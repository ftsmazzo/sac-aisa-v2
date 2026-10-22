import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AcessoBanco,
  hashSenha,
  redefinirSenha,
  verificarSenha,
} from "../packages/auth/src";

let db: PGlite;
let banco: AcessoBanco;

const SENHA_ANTIGA = "senha-antiga-comprida-1";
const SENHA_NOVA = "senha-nova-bem-longa-2";

async function hashDe(login: string): Promise<string> {
  const r = await db.query<{ senhaHash: string }>(
    `SELECT "senhaHash" FROM usuarios WHERE login = $1`,
    [login],
  );
  return r.rows[0].senhaHash;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    readFileSync(
      join(
        __dirname,
        "..",
        "prisma",
        "migrations",
        "20261022000000_base_v2",
        "migration.sql",
      ),
      "utf8",
    ),
  );
  banco = {
    consultar: async (sql, params) =>
      (await db.query(sql, params)).rows as Record<string, unknown>[],
    executar: (sql, params) => db.query(sql, params),
  };
  const antigo = await hashSenha(SENHA_ANTIGA);
  await db.query(
    `INSERT INTO usuarios (id, login, nome, perfil, "senhaHash", "alteradoEm")
     VALUES ('u1', 'ana', 'Ana', 'administrador', $1, now()),
            ('u2', 'bia', 'Bia', 'operacao', $1, now())`,
    [antigo],
  );
  await db.exec(
    `INSERT INTO sessoes (id, "usuarioId", "expiraEm") VALUES
       ('s1', 'u1', now() + interval '1 hour'),
       ('s2', 'u1', now() + interval '2 hours'),
       ('s3', 'u2', now() + interval '1 hour')`,
  );
});

afterAll(async () => {
  await db.close();
});

describe("redefinir senha", () => {
  it("recusa dados incompletos e não toca em nada", async () => {
    const antes = await hashDe("ana");
    const r = await redefinirSenha(banco, "", "");
    expect(r).toMatchObject({ ok: false, motivo: "dados" });
    expect(await hashDe("ana")).toBe(antes);
  });

  it("recusa senha fraca, dizendo qual regra falhou", async () => {
    const antes = await hashDe("ana");
    const r = await redefinirSenha(banco, "ana", "curta");
    expect(r).toMatchObject({ ok: false, motivo: "senha_fraca" });
    if (!r.ok) expect(r.mensagem).toContain("10 caracteres");
    expect(await hashDe("ana")).toBe(antes);
  });

  it("não cria usuário que não existe", async () => {
    const r = await redefinirSenha(banco, "ninguem", SENHA_NOVA);
    expect(r).toMatchObject({ ok: false, motivo: "inexistente" });
    const n = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM usuarios`,
    );
    expect(n.rows[0].n).toBe("2");
  });

  it("troca a senha, aceita a nova e recusa a antiga", async () => {
    const r = await redefinirSenha(banco, "  ANA ", SENHA_NOVA);
    expect(r).toEqual({ ok: true, login: "ana", sessoesEncerradas: 2 });
    const hash = await hashDe("ana");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verificarSenha(SENHA_NOVA, hash)).toBe(true);
    expect(await verificarSenha(SENHA_ANTIGA, hash)).toBe(false);
  });

  it("encerra só as sessões de quem teve a senha trocada", async () => {
    const ana = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sessoes WHERE "usuarioId" = 'u1'`,
    );
    const bia = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sessoes WHERE "usuarioId" = 'u2'`,
    );
    expect(ana.rows[0].n).toBe("0");
    expect(bia.rows[0].n).toBe("1");
  });

  it("não mexe na senha nem no perfil dos outros usuários", async () => {
    expect(await verificarSenha(SENHA_ANTIGA, await hashDe("bia"))).toBe(true);
    const perfil = await db.query<{ perfil: string }>(
      `SELECT perfil FROM usuarios WHERE login = 'bia'`,
    );
    expect(perfil.rows[0].perfil).toBe("operacao");
  });

  it("a mensagem de resultado nunca traz a senha", async () => {
    const r = await redefinirSenha(banco, "bia", SENHA_NOVA);
    expect(JSON.stringify(r)).not.toContain(SENHA_NOVA);
  });
});
