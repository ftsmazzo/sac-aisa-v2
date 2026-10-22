import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migracao = (nome: string) =>
  readFileSync(
    join(__dirname, "..", "prisma", "migrations", nome, "migration.sql"),
    "utf8",
  );
const desfazer = readFileSync(
  join(
    __dirname,
    "..",
    "prisma",
    "rollback",
    "20261025000000_jornada_desfazer.sql",
  ),
  "utf8",
);

let db: PGlite;

/** Banco com a base e dados "antigos" (sem jornada), depois a migração da jornada por cima. */
beforeAll(async () => {
  db = new PGlite();
  await db.exec(migracao("20261022000000_base_v2"));
  await db.exec(migracao("20261023000000_integracoes"));
  await db.exec(migracao("20261024000000_clickup_sincronizacao"));
  await db.exec(`
    INSERT INTO canais (id, nome, tipo) VALUES ('c1', 'Site', 'interno');
    INSERT INTO reclamacoes (id, "canalId", "dataAbertura", "dataAcao", devolucao, rascunho, situacao, "criadoEm", "alteradoEm") VALUES
      ('resolvida', 'c1', '2026-01-10', '2026-01-12', 'NA', false, 'resolvida', '2026-01-10T10:00:00Z', now()),
      ('aguardando', 'c1', '2026-01-10', NULL, 'AGUARDANDO', false, 'aguardando', '2026-01-10T10:00:00Z', now()),
      ('tratativa', 'c1', '2026-01-10', NULL, 'NA', false, 'tratativa', '2026-01-10T10:00:00Z', now()),
      ('recebido', 'c1', '2026-01-10', NULL, 'RECEBIDO', false, 'tratativa', '2026-01-10T10:00:00Z', now()),
      ('rascunho', 'c1', '2026-01-10', NULL, 'NA', true, 'tratativa', '2026-01-10T10:00:00Z', now());
    INSERT INTO alertas (id, tipo, titulo, mensagem, "chaveDedupe") VALUES ('a-antigo', 'CUSTO_ALTO', 't', 'm', 'antigo');
  `);
  await db.exec(migracao("20261025000000_jornada"));
});

it("a migração da jornada vem depois das que já existiam e nenhum nome se repete", () => {
  const pasta = join(__dirname, "..", "prisma", "migrations");
  const nomes = readdirSync(pasta)
    .filter((n) => /^[0-9]{14}_/.test(n))
    .sort();
  expect(new Set(nomes).size).toBe(nomes.length);
  const i = nomes.indexOf("20261025000000_jornada");
  expect(i).toBeGreaterThan(
    nomes.indexOf("20261024000000_clickup_sincronizacao"),
  );
  expect(i).toBeGreaterThan(nomes.indexOf("20261023000000_integracoes"));
});

afterAll(async () => {
  await db.close();
});

const estados = async () =>
  Object.fromEntries(
    (
      await db.query<{ id: string; estado: string }>(
        "SELECT id, estado::text AS estado FROM reclamacoes",
      )
    ).rows.map((r) => [r.id, r.estado]),
  );

describe("migração da jornada", () => {
  it("leva a situação antiga para o estado novo", async () => {
    expect(await estados()).toEqual({
      resolvida: "finalizada",
      aguardando: "recebida",
      tratativa: "em_tratativa",
      recebido: "em_tratativa",
      rascunho: "triagem",
    });
  });

  it("não perde o histórico: dados, situação e alertas antigos continuam", async () => {
    const r = await db.query<{ n: string; dia: string }>(
      `SELECT count(*)::text AS n, max("dataAcao"::text) AS dia FROM reclamacoes`,
    );
    expect(r.rows[0]).toMatchObject({ n: "5", dia: "2026-01-12" });
    const s = await db.query<{ situacao: string }>(
      `SELECT situacao::text AS situacao FROM reclamacoes WHERE id = 'resolvida'`,
    );
    expect(s.rows[0].situacao).toBe("resolvida");
    const a = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM alertas",
    );
    expect(a.rows[0].n).toBe("1");
  });

  it("grava uma linha-base no histórico de estados por reclamação, com a data de criação", async () => {
    const h = await db.query<{
      reclamacaoId: string;
      de: string | null;
      para: string;
      quando: string;
      origem: string;
    }>(
      `SELECT "reclamacaoId", de::text AS de, para::text AS para, quando::text AS quando, origem
       FROM estado_historico ORDER BY "reclamacaoId"`,
    );
    expect(h.rows).toHaveLength(5);
    const fin = h.rows.find((x) => x.reclamacaoId === "resolvida");
    expect(fin).toMatchObject({
      de: null,
      para: "finalizada",
      origem: "migracao",
    });
    expect(fin?.quando).toContain("2026-01-10 10:00:00");
  });

  it("o estado novo nasce em triagem e o prazo do marketplace é opcional", async () => {
    await db.exec(
      `INSERT INTO reclamacoes (id, "canalId", "dataAbertura", "alteradoEm") VALUES ('nova', 'c1', '2026-02-01', now())`,
    );
    const r = await db.query<{ estado: string; prazo: string | null }>(
      `SELECT estado::text AS estado, "prazoMarketplace"::text AS prazo FROM reclamacoes WHERE id = 'nova'`,
    );
    expect(r.rows[0]).toEqual({ estado: "triagem", prazo: null });
  });

  it("recusa estado fora da jornada e apagar a reclamação leva o histórico junto", async () => {
    await expect(
      db.exec(`UPDATE reclamacoes SET estado = 'reaberta' WHERE id = 'nova'`),
    ).rejects.toThrow();
    await db.exec(`DELETE FROM reclamacoes WHERE id = 'rascunho'`);
    const h = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM estado_historico WHERE "reclamacaoId" = 'rascunho'`,
    );
    expect(h.rows[0].n).toBe("0");
  });

  it("guarda as marcas do usuário e some com elas junto do usuário", async () => {
    await db.exec(`
      INSERT INTO marcas (id, nome) VALUES ('m1', 'AISA');
      INSERT INTO usuarios (id, login, nome, perfil, "senhaHash", "alteradoEm") VALUES ('u1', 'ana', 'Ana', 'responsavel_setor', 'x', now());
      INSERT INTO usuario_marcas ("usuarioId", "marcaId") VALUES ('u1', 'm1');
    `);
    await expect(
      db.exec(
        `INSERT INTO usuario_marcas ("usuarioId", "marcaId") VALUES ('u1', 'm1')`,
      ),
    ).rejects.toThrow();
    await db.exec(`DELETE FROM usuarios WHERE id = 'u1'`);
    const r = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM usuario_marcas",
    );
    expect(r.rows[0].n).toBe("0");
  });

  it("aceita os alertas novos da jornada", async () => {
    await db.exec(
      `INSERT INTO alertas (id, tipo, titulo, mensagem, "chaveDedupe") VALUES ('a-novo', 'SEM_RECEBIMENTO_SETOR', 't', 'm', 'novo')`,
    );
  });

  it("o script de desfazer tira só o que a jornada criou e deixa o resto intacto", async () => {
    await db.exec(desfazer);
    const tabelas = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables
       WHERE table_name IN ('estado_historico', 'usuario_marcas')`,
    );
    expect(tabelas.rows[0].n).toBe("0");
    const colunas = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns
       WHERE table_name = 'reclamacoes' AND column_name IN ('estado', 'estadoDesde', 'prazoMarketplace')`,
    );
    expect(colunas.rows[0].n).toBe("0");
    const r = await db.query<{ n: string; situacao: string }>(
      `SELECT count(*)::text AS n, max(situacao::text) AS situacao FROM reclamacoes`,
    );
    expect(r.rows[0]).toMatchObject({ n: "5", situacao: "tratativa" });
    const a = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM alertas",
    );
    expect(a.rows[0].n).toBe("1");
    // E dá para aplicar a migração de novo por cima.
    await db.exec(migracao("20261025000000_jornada"));
    const e = await estados();
    expect(e.resolvida).toBe("finalizada");
  });
});
