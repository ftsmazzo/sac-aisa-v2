import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type BackupLegado,
  executarImportacao,
  LIMITES,
  validarArquivo,
} from "./index";

const reg = (n: number) => ({
  reg: n,
  id: `old-${n}`,
  data: "2026-05-10",
  empresa: "AISA",
  setor: "SETOR 01",
  sku: "G48",
  produto: "ABAFADOR",
  canal: "SITE",
  reclamacao: "Produto chegou com a solda soltando",
  dataAcao: "2026-05-11",
});

const valido = {
  regs: [reg(1), reg(2)],
  vendas: [{ sku: "G48", data: "2026-06-01", quantidade: 3 }],
  usuarios: [{ login: "ana", nome: "Ana", perfil: "gestor" }],
};

type Exec = (s: string, p: unknown[]) => Promise<unknown>;

describe("validação do arquivo enviado", () => {
  it("aceita o formato esperado", () => {
    const r = validarArquivo(valido);
    expect(r.ok).toBe(true);
  });

  it("recusa o que não é um objeto, sem reclamações ou sem lista", () => {
    for (const ruim of [
      null,
      "texto",
      42,
      [],
      {},
      { regs: [] },
      { regs: "x" },
    ]) {
      const r = validarArquivo(ruim);
      expect(r.ok).toBe(false);
    }
  });

  it("recusa reclamação sem número inteiro ou sem data", () => {
    expect(
      validarArquivo({ regs: [{ reg: "1", data: "2026-01-01" }] }).ok,
    ).toBe(false);
    expect(validarArquivo({ regs: [{ reg: 0, data: "2026-01-01" }] }).ok).toBe(
      false,
    );
    expect(validarArquivo({ regs: [{ reg: 1 }] }).ok).toBe(false);
    expect(validarArquivo({ regs: [null] }).ok).toBe(false);
  });

  it("recusa lista opcional que não é lista ou passa do limite", () => {
    expect(validarArquivo({ ...valido, vendas: "x" }).ok).toBe(false);
    const muitos = Array.from({ length: LIMITES.usuarios + 1 }, () => ({}));
    const r = validarArquivo({ ...valido, usuarios: muitos });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toContain("usuarios");
  });

  it("não depende de campos opcionais", () => {
    expect(validarArquivo({ regs: [reg(1)] }).ok).toBe(true);
  });
});

describe("execução contra o banco", () => {
  let db: PGlite;
  const arquivo = valido as unknown as BackupLegado;

  const deps = {
    transacao: <T>(fn: (exec: Exec) => Promise<T>) =>
      db.transaction((tx) => fn((s, p) => tx.query(s, p))),
  };

  const contar = async (t: string) =>
    Number(
      (await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`))
        .rows[0].n,
    );

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
  });

  afterAll(async () => {
    await db.close();
  });

  it("a simulação devolve o relatório e não grava nada", async () => {
    const r = await executarImportacao(deps, arquivo, "simular");
    expect(r.modo).toBe("simular");
    expect(r.gravado).toBeNull();
    expect(r.relatorio.importadas).toBe(2);
    expect(await contar("reclamacoes")).toBe(0);
    expect(await contar("setores")).toBe(0);
  });

  it("gravar escreve tudo e informa as linhas por tabela", async () => {
    const r = await executarImportacao(deps, arquivo, "gravar");
    expect(r.modo).toBe("gravar");
    expect(r.gravado?.reclamacoes).toBe(2);
    expect(r.gravado?.vendas_dia).toBe(1);
    expect(await contar("reclamacoes")).toBe(2);
    expect(await contar("usuarios")).toBe(1);
    expect(await contar("vendas_dia")).toBe(1);
  });

  it("gravar de novo não duplica", async () => {
    await executarImportacao(deps, arquivo, "gravar");
    expect(await contar("reclamacoes")).toBe(2);
    expect(await contar("vendas_dia")).toBe(1);
  });

  it("falha no meio da gravação desfaz tudo, sem deixar metade no banco", async () => {
    const antes = await contar("reclamacoes");
    const quebrado = {
      transacao: <T>(fn: (exec: Exec) => Promise<T>) =>
        db.transaction(async (tx) => {
          let chamadas = 0;
          return fn(async (s, p) => {
            chamadas++;
            if (chamadas > 3) throw new Error("falha simulada");
            return tx.query(s, p);
          });
        }),
    };
    const novo = { regs: [reg(99)] } as unknown as BackupLegado;
    await expect(executarImportacao(quebrado, novo, "gravar")).rejects.toThrow(
      "falha simulada",
    );
    expect(await contar("reclamacoes")).toBe(antes);
  });

  it("o relatório não traz dado de cliente", async () => {
    const r = await executarImportacao(deps, arquivo, "simular");
    expect(JSON.stringify(r)).not.toContain("solda soltando");
  });
});
