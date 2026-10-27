import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarTabelas } from "./aplicar";
import {
  type BackupLegado,
  codigoBancada,
  converterBackup,
  paraData,
  parseCatalogoProdutos,
  type RegistroLegado,
  slug,
} from "./converter";

const base = (reg: number, extra: Partial<RegistroLegado> = {}) =>
  ({
    reg,
    data: "2026-03-10",
    empresa: "ARTMAQ",
    setor: "SETOR 06",
    sku: "G48",
    produto: "ABAFADOR DE ALUMINIO",
    familia: "DIVERSOS",
    canal: "MERCADO LIVRE",
    protocolo: `P-${reg}`,
    cliente: "Cliente Teste",
    cidade: "Campinas",
    uf: "SP",
    reclamacao: "Produto chegou com a solda soltando",
    laudo: "",
    procedencia: "PROCEDE",
    solucao: "",
    dataAcao: "",
    obs: "",
    garantia: "SIM",
    transp: "",
    freteEnvio: 10.1,
    freteRetorno: 0.2,
    valorPeca: 0,
    estorno: 0,
    desconto: 0,
    guia: 0,
    ...extra,
  }) as RegistroLegado;

const CATALOGO = [
  "G48|0|ABAFADOR DE ALUMINIO|A|P|DIVERSOS",
  "M08|0|ALICATE PRESSÃO FUXICO|A|P|DIVERSOS",
  "X01|0|PRODUTO ANTIGO|I|X|DIVERSOS",
].join("\n");

const backup: BackupLegado = {
  regs: [
    base(1),
    base(2, { empresa: "ARTAMQ", canal: "Shopee", setor: "SETOR 04.2" }),
    base(3, { canal: "", sku: "", produto: "", empresa: "" }),
    base(4, {
      causaManual: true,
      causaId: "voltagem",
      devolucao: "AGUARDANDO",
      setorRespManual: "Logística",
    }),
    base(5, {
      dataAcao: "2026-03-12",
      devolucao: "RECEBIDO",
      dataRecebimento: "2026-03-11",
    }),
    base(6, { data: "10/03/2026" }),
    base(7, {
      sku: "Z99",
      produto: "PRODUTO FORA DO CATÁLOGO",
      setor: "ADMIN",
    }),
  ],
  auditoria: [{}, {}, {}],
};

describe("conversão do backup", () => {
  const { tabelas, relatorio } = converterBackup(backup, {
    catalogoProdutos: CATALOGO,
  });
  const rec = (n: number) => tabelas.reclamacoes.find((r) => r.numero === n);

  it("converte o que tem data válida e pula o resto, avisando", () => {
    expect(relatorio.lidas).toBe(7);
    expect(relatorio.importadas).toBe(6);
    expect(relatorio.semData).toEqual([6]);
    expect(rec(6)).toBeUndefined();
  });

  it("preserva o número da reclamação e cria ids estáveis", () => {
    expect(rec(1)?.id).toBe("imp-1");
    expect(rec(4)?.numero).toBe(4);
  });

  it("junta ARTAMQ com ARTMAQ e deixa sem marca quando a empresa é vazia", () => {
    expect(tabelas.marcas.map((m) => m.nome)).toEqual(["ARTMAQ"]);
    expect(rec(2)?.marcaId).toBe("marca-artmaq");
    expect(rec(3)?.marcaId).toBeNull();
  });

  it("reconhece os canais e manda o desconhecido para Não informado", () => {
    expect(rec(1)?.canalId).toBe("canal-mercado-livre");
    expect(rec(2)?.canalId).toBe("canal-shopee");
    expect(rec(3)?.canalId).toBe("canal-nao-informado");
    const ml = tabelas.canais.find((c) => c.nome === "Mercado Livre");
    expect(ml?.tipo).toBe("marketplace");
    expect(relatorio.semCanal).toBe(1);
  });

  it("vira bancada o setor numerado, inclusive os subníveis", () => {
    expect(codigoBancada("SETOR 04.2")).toBe("04.2");
    expect(codigoBancada("ADMIN")).toBe("ADMIN");
    expect(codigoBancada("")).toBeNull();
    // Reclamações (06, 04.2, ADMIN) + coluna 2 do catálogo (0).
    expect(tabelas.bancadas.map((b) => b.codigo).sort()).toEqual([
      "0",
      "04.2",
      "06",
      "ADMIN",
    ]);
  });

  it("usa o catálogo de produtos e cria os que só aparecem nas reclamações", () => {
    expect(tabelas.produtos).toHaveLength(4);
    expect(relatorio.produtosCriadosDasReclamacoes).toBe(1);
    expect(rec(3)?.produtoId).toBeNull();
    expect(rec(7)?.produtoId).toBe("produto-z99");
    expect(tabelas.produtos.find((p) => p.codigo === "X01")?.ativo).toBe(false);
    // Coluna 2 do catálogo (G48|0|...) vira bancada do produto.
    expect(tabelas.produtos.find((p) => p.codigo === "G48")?.bancadaId).toBe(
      "bancada-0",
    );
    expect(tabelas.bancadas.map((b) => b.codigo).sort()).toEqual(
      expect.arrayContaining(["0", "04.2", "06", "ADMIN"]),
    );
  });

  it("classifica pela regra quando o backup não definiu a causa", () => {
    expect(rec(1)?.causaId).toBe("solda");
    expect(rec(1)?.setorRespId).toBe("setor-solda");
    expect(relatorio.causaInferida).toBe(5);
    expect(relatorio.causaDefinidaNoBackup).toBe(1);
  });

  it("respeita a causa e o setor definidos à mão", () => {
    expect(rec(4)?.causaId).toBe("voltagem");
    expect(rec(4)?.causaManual).toBe(true);
    expect(rec(4)?.setorRespId).toBe("setor-logistica");
    expect(rec(4)?.setorRespManual).toBe(true);
  });

  it("calcula a situação pela regra do domínio", () => {
    expect(rec(1)?.situacao).toBe("tratativa");
    expect(rec(4)?.situacao).toBe("aguardando");
    expect(rec(5)?.situacao).toBe("resolvida");
    expect(rec(5)?.dataAcao).toBe("2026-03-12");
  });

  it("arredonda dinheiro em centavos", () => {
    const c = tabelas.custos.find((x) => x.reclamacaoId === "imp-1");
    expect(c?.freteEnvio).toBe(10.1);
    expect(c?.freteRetorno).toBe(0.2);
  });

  it("relatório avisa o que ficou de fora, sem dado de cliente", () => {
    expect(relatorio.ignorados).toEqual({
      fotos: 0,
      auditoria: 3,
    });
    expect(JSON.stringify(relatorio)).not.toContain("Cliente Teste");
  });

  it("funções auxiliares", () => {
    expect(paraData("2026-02-30")).toBeNull();
    expect(paraData("2026-02-28T12:00:00Z")).toBe("2026-02-28");
    expect(slug("Embalagem / Expedição")).toBe("embalagem-expedicao");
    expect(parseCatalogoProdutos(CATALOGO)[0]).toMatchObject({
      codigo: "G48",
      codigoBancada: "0",
      categoria: "PRODUTO AISA",
      ativo: true,
    });
  });
});

describe("gravação no banco com a migração real", () => {
  let db: PGlite;
  const { tabelas } = converterBackup(backup, { catalogoProdutos: CATALOGO });
  const exec = (sql: string, params: unknown[]) => db.query(sql, params);

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "..",
          "prisma",
          "migrations",
          "20261022000000_base_v2",
          "migration.sql",
        ),
        "utf8",
      ),
    );
    // A jornada (estado e histórico de estados) vem de migração própria.
    await db.exec(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "..",
          "prisma",
          "migrations",
          "20261025000000_jornada",
          "migration.sql",
        ),
        "utf8",
      ),
    );
    // Bancada de fabricação no produto (coluna 2 do catálogo).
    await db.exec(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "..",
          "prisma",
          "migrations",
          "20261027110000_produto_bancada",
          "migration.sql",
        ),
        "utf8",
      ),
    );
    await aplicarTabelas(exec, tabelas);
  });

  afterAll(async () => {
    await db.close();
  });

  const contar = async (tabela: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${tabela}`,
        )
      ).rows[0].n,
    );

  it("grava tudo respeitando chaves, enums e tipos", async () => {
    expect(await contar("reclamacoes")).toBe(6);
    expect(await contar("custos")).toBe(6);
    expect(await contar("causas")).toBe(22);
    expect(await contar("setores")).toBe(12);
    expect(await contar("reclamacao_causas")).toBe(
      tabelas.reclamacao_causas.length,
    );
  });

  it("não deixa reclamação sem canal, causa ou setor existentes", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM reclamacoes r
       JOIN canais c ON c.id = r."canalId"
       JOIN causas ca ON ca.id = r."causaId"
       JOIN setores s ON s.id = r."setorRespId"`,
    );
    expect(Number(r.rows[0].n)).toBe(6);
  });

  it("guarda data e custo sem perder precisão", async () => {
    const r = await db.query<{ dia: string; total: string }>(
      `SELECT r."dataAbertura"::text AS dia, (c."freteEnvio" + c."freteRetorno")::text AS total
       FROM reclamacoes r JOIN custos c ON c."reclamacaoId" = r.id WHERE r.numero = 1`,
    );
    expect(r.rows[0].dia).toBe("2026-03-10");
    expect(r.rows[0].total).toBe("10.30");
  });

  it("rodar de novo não duplica nada", async () => {
    await aplicarTabelas(exec, tabelas);
    expect(await contar("reclamacoes")).toBe(6);
    expect(await contar("custos")).toBe(6);
    expect(await contar("produtos")).toBe(tabelas.produtos.length);
  });

  it("a próxima reclamação criada continua depois do maior número importado", async () => {
    await db.exec(
      `INSERT INTO reclamacoes (id, "canalId", "dataAbertura", "alteradoEm")
       VALUES ('nova', 'canal-mercado-livre', '2026-04-01', now())`,
    );
    const r = await db.query<{ numero: number }>(
      `SELECT numero FROM reclamacoes WHERE id = 'nova'`,
    );
    expect(r.rows[0].numero).toBe(8);
  });
});
