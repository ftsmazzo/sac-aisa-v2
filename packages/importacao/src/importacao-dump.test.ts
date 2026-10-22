import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarTabelas } from "./aplicar";
import {
  type BackupLegado,
  converterBackup,
  type RegistroLegado,
} from "./converter";

const reg = (n: number, extra: Partial<RegistroLegado> = {}) =>
  ({
    reg: n,
    id: `old-${n}`,
    data: "2026-05-10",
    empresa: "AISA",
    setor: "SETOR 01",
    sku: "G48",
    produto: "ABAFADOR",
    familia: "DIVERSOS",
    canal: "SITE",
    cliente: "Cliente Teste",
    reclamacao: "Produto chegou com a solda soltando",
    laudo: "",
    solucao: "",
    dataAcao: "2026-05-11",
    ...extra,
  }) as RegistroLegado;

const backup: BackupLegado = {
  regs: [
    reg(1, { canal: "SHOPPE" }),
    reg(2, { canal: "MERCADO LIVRE " }),
    reg(3, { causaManual: true, causaId: "kit" }),
    reg(4),
  ],
  causasExtras: [
    { reclamacaoId: "old-2", causaId: "avaria", primaria: false, ordem: 1 },
    { reclamacaoId: "old-2", causaId: "eletrico", primaria: true, ordem: 0 },
    { reclamacaoId: "old-2", causaId: "nao-existe", primaria: false, ordem: 2 },
  ],
  vendas: [
    { sku: "g48", descricao: "Abafador", data: "2026-06-01", quantidade: 3 },
    { sku: "G48", data: "2026-06-02", quantidade: 2.9 },
    { sku: "", data: "2026-06-01", quantidade: 1 },
    { sku: "M08", data: "2026-13-40", quantidade: 1 },
  ],
  usuarios: [
    {
      login: "Joao",
      nome: "João",
      perfil: "gestor",
      ativo: true,
      telefone: "1199",
    },
    { login: "renato", nome: "Renato", perfil: "master" },
    { login: "  ", nome: "Sem login", perfil: "gestor" },
  ],
  fotos: 4,
};

describe("dados que só vêm do dump", () => {
  const { tabelas, relatorio } = converterBackup(backup);
  const rec = (n: number) => tabelas.reclamacoes.find((r) => r.numero === n);

  it("trata o canal digitado errado e com espaço sobrando", () => {
    expect(rec(1)?.canalId).toBe("canal-shopee");
    expect(rec(2)?.canalId).toBe("canal-mercado-livre");
    expect(relatorio.semCanal).toBe(0);
  });

  it("respeita as causas gravadas, primária primeiro, e ignora causa inexistente", () => {
    const doisc = tabelas.reclamacao_causas
      .filter((c) => c.reclamacaoId === "imp-2")
      .sort((a, b) => Number(a.ordem) - Number(b.ordem));
    expect(doisc.map((c) => c.causaId)).toEqual(["eletrico", "avaria"]);
    expect(doisc[0].primaria).toBe(true);
    expect(rec(2)?.causaId).toBe("eletrico");
    expect(rec(2)?.causaManual).toBe(true);
  });

  it("usa a causa manual quando não há causas gravadas, e infere o resto", () => {
    expect(rec(3)?.causaId).toBe("kit");
    expect(rec(4)?.causaId).toBe("solda");
    expect(rec(4)?.causaManual).toBe(false);
    expect(relatorio.causaDefinidaNoBackup).toBe(2);
    expect(relatorio.causaInferida).toBe(2);
  });

  it("converte as vendas: sku em maiúsculas, quantidade inteira, descarta o inválido", () => {
    expect(relatorio.vendasLidas).toBe(4);
    expect(tabelas.vendas_dia).toHaveLength(2);
    expect(tabelas.vendas_dia[0]).toMatchObject({
      id: "venda-g48-2026-06-01",
      sku: "G48",
      quantidade: 3,
    });
    expect(tabelas.vendas_dia[1].quantidade).toBe(2);
  });

  it("importa usuários inativos, sem senha utilizável, com o perfil novo", () => {
    expect(relatorio.usuariosInativos).toBe(2);
    const joao = tabelas.usuarios.find((u) => u.login === "joao");
    const renato = tabelas.usuarios.find((u) => u.login === "renato");
    expect(joao).toMatchObject({
      perfil: "gestor",
      ativo: false,
      telefone: "1199",
    });
    expect(renato).toMatchObject({ perfil: "administrador", ativo: false });
    for (const u of tabelas.usuarios) {
      expect(String(u.senhaHash).startsWith("$argon2")).toBe(false);
    }
  });

  it("informa a contagem de fotos que não vieram", () => {
    expect(relatorio.ignorados.fotos).toBe(4);
  });
});

describe("gravação em lotes no banco", () => {
  let db: PGlite;
  const muitas: BackupLegado = {
    ...backup,
    vendas: Array.from({ length: 3000 }, (_, i) => ({
      sku: `SKU${i % 50}`,
      data: `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")}`,
      quantidade: i % 7,
    })),
  };
  const { tabelas } = converterBackup(muitas);

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
    await aplicarTabelas((sql, params) => db.query(sql, params), tabelas);
  });

  afterAll(async () => {
    await db.close();
  });

  const contar = async (t: string) =>
    Number(
      (await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`))
        .rows[0].n,
    );

  it("grava todas as vendas distintas, mesmo em vários lotes", async () => {
    expect(await contar("vendas_dia")).toBe(tabelas.vendas_dia.length);
  });

  it("grava os usuários inativos com o perfil certo", async () => {
    const r = await db.query<{ login: string; perfil: string; ativo: boolean }>(
      `SELECT login, perfil, ativo FROM usuarios ORDER BY login`,
    );
    expect(r.rows).toEqual([
      { login: "joao", perfil: "gestor", ativo: false },
      { login: "renato", perfil: "administrador", ativo: false },
    ]);
  });

  it("não duplica ao rodar de novo e não altera usuário que já existe", async () => {
    await db.exec(
      `UPDATE usuarios SET nome = 'Nome Novo', ativo = true WHERE login = 'joao'`,
    );
    await aplicarTabelas((sql, params) => db.query(sql, params), tabelas);
    expect(await contar("vendas_dia")).toBe(tabelas.vendas_dia.length);
    const j = await db.query<{ nome: string; ativo: boolean }>(
      `SELECT nome, ativo FROM usuarios WHERE login = 'joao'`,
    );
    expect(j.rows[0]).toEqual({ nome: "Nome Novo", ativo: true });
  });

  it("a causa gravada fica ligada à reclamação certa", async () => {
    const r = await db.query<{ causaId: string; primaria: boolean }>(
      `SELECT "causaId", primaria FROM reclamacao_causas WHERE "reclamacaoId" = 'imp-2' ORDER BY ordem`,
    );
    expect(r.rows).toEqual([
      { causaId: "eletrico", primaria: true },
      { causaId: "avaria", primaria: false },
    ]);
  });
});
