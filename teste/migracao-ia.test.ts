import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  CAUSA_POR_ID,
  perguntasAplicaveis,
  TIPOS_PERGUNTA,
} from "@sac-aisa/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migracao = (nome: string) =>
  readFileSync(
    join(__dirname, "..", "prisma", "migrations", nome, "migration.sql"),
    "utf8",
  );

const FAMILIAS_DO_CATALOGO = new Set(
  readFileSync(
    join(
      __dirname,
      "..",
      "packages",
      "importacao",
      "dados",
      "catalogo-produtos.txt",
    ),
    "utf8",
  )
    .split(/\r?\n/)
    .map((l) => (l.split("|")[5] ?? "").trim().toUpperCase())
    .filter(Boolean),
);

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const m of [
    "20261022000000_base_v2",
    "20261023000000_integracoes",
    "20261024000000_jornada",
    "20261025000000_ia_triagem",
    "20261025000100_ia_padrao_inicial",
  ]) {
    await db.exec(migracao(m));
  }
});

afterAll(async () => {
  await db.close();
});

describe("migração da IA e padrão inicial", () => {
  it("semeia o perfil v1 marcado como exemplo de teste, com assinatura e sem política comercial", async () => {
    const r = await db.query<{
      versao: number;
      padrao: boolean;
      assinatura: string;
      nota: string;
      tomDeVoz: string;
      evitar: string;
    }>(
      'SELECT versao, padrao, assinatura, nota, "tomDeVoz", evitar FROM perfil_empresa',
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      versao: 1,
      padrao: true,
      assinatura: "Equipe SAC {marca}",
    });
    expect(r.rows[0].nota).toMatch(/validar com o dono/);
    expect(r.rows[0].tomDeVoz).toMatch(/Cordial, direto e humano/);
    expect(r.rows[0].evitar).toMatch(/Prometer prazo/);
  });

  it("semeia perguntas por categoria, todas marcadas como padrão", async () => {
    const r = await db.query<{ categoria: string; n: number }>(
      "SELECT categoria, count(*)::int AS n FROM perguntas_obrigatorias WHERE padrao GROUP BY categoria ORDER BY categoria",
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.categoria, x.n]))).toEqual({
      eletrica: 4,
      embalagem: 3,
      montagem: 3,
      peca_faltante: 2,
      transporte: 2,
    });
  });

  it("as regras só citam causas e famílias que existem de verdade", async () => {
    const r = await db.query<{
      chave: string;
      tipo: string;
      regras: { familias?: string[]; causaIds?: string[] }[];
    }>("SELECT chave, tipo::text AS tipo, regras FROM perguntas_obrigatorias");
    expect(r.rows.length).toBe(14);
    for (const p of r.rows) {
      expect(TIPOS_PERGUNTA).toContain(p.tipo);
      expect(p.regras.length).toBeGreaterThan(0);
      for (const regra of p.regras) {
        for (const c of regra.causaIds ?? [])
          expect(CAUSA_POR_ID[c], `${p.chave}: ${c}`).toBeDefined();
        for (const f of regra.familias ?? [])
          expect(
            FAMILIAS_DO_CATALOGO.has(f.toUpperCase()),
            `${p.chave}: ${f}`,
          ).toBe(true);
      }
    }
  });

  it("o padrão responde ao que o dono pediu: elétrica, embalagem, montagem, peça faltante e transporte", async () => {
    const r = await db.query<{
      chave: string;
      texto: string;
      tipo: string;
      opcoes: string[];
      obrigatoria: boolean;
      ordem: number;
      ativa: boolean;
      regras: unknown;
    }>(
      "SELECT chave, texto, tipo::text AS tipo, opcoes, obrigatoria, ordem, ativa, regras FROM perguntas_obrigatorias",
    );
    const lista = r.rows.map((p) => ({
      ...p,
      tipo: p.tipo as "texto",
      regras: p.regras as never,
    }));
    const chaves = (ctx: Parameters<typeof perguntasAplicaveis>[1]) =>
      perguntasAplicaveis(lista, ctx).map((p) => p.chave);
    expect(chaves({ causaId: "voltagem" })).toEqual([
      "voltagem_tomada",
      "extensao_estabilizador",
      "modelo_serie",
      "foto_etiqueta_produto",
    ]);
    expect(chaves({ causaId: "avaria", causaCategoria: "Transporte" })).toEqual(
      expect.arrayContaining([
        "local_dano_caixa",
        "foto_caixa_externa",
        "foto_etiqueta_transporte",
        "data_recebimento",
        "foto_dano",
      ]),
    );
    expect(chaves({ familia: "PRATELEIRA", causaId: "kit" })).toEqual(
      expect.arrayContaining([
        "passo_manual",
        "foto_peca",
        "ferramenta_usada",
        "pecas_faltando",
        "foto_inventario",
      ]),
    );
    expect(chaves({ causaId: "prazo" })).toEqual([]);
  });

  it("resposta: uma por pergunta na reclamação, e some junto com ela", async () => {
    await db.exec(`
      INSERT INTO canais (id, nome, tipo) VALUES ('c1', 'Site', 'interno');
      INSERT INTO reclamacoes (id, "canalId", "dataAbertura", devolucao, rascunho, situacao, "criadoEm", "alteradoEm")
        VALUES ('r1', 'c1', '2026-10-01', 'NA', false, 'tratativa', now(), now());
      INSERT INTO reclamacao_respostas (id, "reclamacaoId", chave, "textoPergunta", valor) VALUES ('a', 'r1', 'voltagem_tomada', 'Qual a voltagem?', '220 V');
    `);
    await expect(
      db.exec(
        `INSERT INTO reclamacao_respostas (id, "reclamacaoId", chave, "textoPergunta", valor) VALUES ('b', 'r1', 'voltagem_tomada', 'x', '110 V')`,
      ),
    ).rejects.toThrow();
    await db.exec("DELETE FROM reclamacoes WHERE id = 'r1'");
    const n = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM reclamacao_respostas",
    );
    expect(n.rows[0].n).toBe(0);
  });

  it("IaRegistro aceita os tipos novos e os campos de custo", async () => {
    await db.exec(
      `INSERT INTO ia_registros (id, tipo, sugestao, etapa, "tokensEntrada", "tokensSaida", "custoUsd", "latenciaMs") VALUES ('i1', 'triagem', '{}', 'triagem', 400, 80, 0.000123, 900)`,
    );
    const r = await db.query<{ custo: string }>(
      `SELECT "custoUsd"::text AS custo FROM ia_registros WHERE id = 'i1'`,
    );
    expect(Number(r.rows[0].custo)).toBeCloseTo(0.000123, 6);
  });
});
