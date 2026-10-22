import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    __dirname,
    "..",
    "prisma",
    "migrations",
    "20261022000000_base_v2",
    "migration.sql",
  ),
  "utf8",
);

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql);
  await db.exec(`
    INSERT INTO canais (id, nome, tipo) VALUES ('c1', 'Mercado Livre', 'marketplace'), ('c2', 'Site', 'interno');
    INSERT INTO setores (id, nome) VALUES ('s1', 'Solda'), ('s2', 'Logística');
    INSERT INTO causas (id, categoria, nome, "setorId", origem) VALUES ('solda', 'Fabricação', 'Solda soltando', 's1', 'montagem');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("migração base v2", () => {
  it("cria as 31 tabelas", async () => {
    const r = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    expect(Number(r.rows[0].n)).toBe(31);
  });

  it("recusa reclamação sem canal existente", async () => {
    await expect(
      db.exec(
        `INSERT INTO reclamacoes (id, "canalId", "dataAbertura", "alteradoEm") VALUES ('r0', 'nao-existe', '2026-01-01', now())`,
      ),
    ).rejects.toThrow();
  });

  it("guarda datas como data e custo como decimal sem perder centavos", async () => {
    await db.exec(
      `INSERT INTO reclamacoes (id, "canalId", "causaId", "dataAbertura", "alteradoEm") VALUES ('r1', 'c1', 'solda', '2026-01-10', now())`,
    );
    await db.exec(
      `INSERT INTO custos ("reclamacaoId", "valorPeca", "freteEnvio") VALUES ('r1', 10.10, 0.20)`,
    );
    const r = await db.query<{ total: string; dia: string }>(
      `SELECT ("valorPeca" + "freteEnvio")::text AS total, "dataAbertura"::text AS dia
       FROM custos c JOIN reclamacoes r ON r.id = c."reclamacaoId" WHERE r.id = 'r1'`,
    );
    expect(r.rows[0].total).toBe("10.30");
    expect(r.rows[0].dia).toBe("2026-01-10");
  });

  it("numera as reclamações em sequência", async () => {
    await db.exec(
      `INSERT INTO reclamacoes (id, "canalId", "dataAbertura", "alteradoEm") VALUES ('r2', 'c2', '2026-01-11', now())`,
    );
    const r = await db.query<{ numero: number }>(
      `SELECT numero FROM reclamacoes WHERE id IN ('r1', 'r2') ORDER BY numero`,
    );
    expect(r.rows[1].numero).toBe(r.rows[0].numero + 1);
  });

  it("não duplica a captura do mesmo canal e código externo", async () => {
    await db.exec(
      `INSERT INTO capturas_canal (id, "canalId", "idExterno", payload) VALUES ('k1', 'c1', 'ML-123', '{}')`,
    );
    await expect(
      db.exec(
        `INSERT INTO capturas_canal (id, "canalId", "idExterno", payload) VALUES ('k2', 'c1', 'ML-123', '{}')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `INSERT INTO capturas_canal (id, "canalId", "idExterno", payload) VALUES ('k3', 'c2', 'ML-123', '{}')`,
    );
  });

  it("aceita só os perfis do sistema", async () => {
    await db.exec(
      `INSERT INTO usuarios (id, login, nome, perfil, "senhaHash", "alteradoEm") VALUES ('u1', 'ana', 'Ana', 'gestor', 'x', now())`,
    );
    await expect(
      db.exec(
        `INSERT INTO usuarios (id, login, nome, perfil, "senhaHash", "alteradoEm") VALUES ('u2', 'bia', 'Bia', 'master', 'x', now())`,
      ),
    ).rejects.toThrow();
  });

  it("não deixa duas chaves de alerta iguais", async () => {
    await db.exec(
      `INSERT INTO alertas (id, tipo, titulo, mensagem, "chaveDedupe") VALUES ('a1', 'CUSTO_ALTO', 't', 'm', 'r1:custo')`,
    );
    await expect(
      db.exec(
        `INSERT INTO alertas (id, tipo, titulo, mensagem, "chaveDedupe") VALUES ('a2', 'CUSTO_ALTO', 't', 'm', 'r1:custo')`,
      ),
    ).rejects.toThrow();
  });

  it("apagar a reclamação leva o custo junto", async () => {
    await db.exec(`DELETE FROM reclamacoes WHERE id = 'r1'`);
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM custos WHERE "reclamacaoId" = 'r1'`,
    );
    expect(r.rows[0].n).toBe("0");
  });
});
