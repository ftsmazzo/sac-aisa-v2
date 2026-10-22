import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  formatarQuando,
  type Integracao,
  type ItemFilaClickup,
  mensagemIntegracao,
  montarEntrada,
  oQueFalta,
  proximaTentativa,
  rascunhoInicial,
} from "../lib/integracoes";

const migracao = (nome: string) =>
  readFileSync(
    join(__dirname, "..", "prisma", "migrations", nome, "migration.sql"),
    "utf8",
  );

const CLICKUP: Integracao = {
  chave: "clickup",
  nome: "ClickUp",
  resumo: "",
  passos: [],
  estado: "pendente",
  ultimoErro: null,
  testadoEm: null,
  campos: [
    {
      nome: "token",
      rotulo: "Token",
      tipo: "segredo",
      ajuda: "",
      preenchido: true,
      mascara: "••••ABCD",
    },
    {
      nome: "listaPadraoId",
      rotulo: "Lista padrão",
      tipo: "texto",
      ajuda: "",
      valor: "900",
    },
  ],
  clickup: {
    setores: [{ id: "s1", nome: "Solda", listaId: "111" }],
    mapaStatus: { complete: "resolvida" },
  },
};

describe("formulário de integrações", () => {
  it("o segredo gravado nunca vira valor do campo: começa vazio", () => {
    const r = rascunhoInicial(CLICKUP);
    expect(r.campos).toEqual({ token: "", listaPadraoId: "900" });
    expect(JSON.stringify(r)).not.toContain("ABCD");
  });

  it("monta o corpo com listas e mapa, descartando linha de status vazia", () => {
    const r = rascunhoInicial(CLICKUP);
    r.mapa.push({ status: "  ", situacao: "tratativa" });
    r.mapa.push({ status: " Em Andamento ", situacao: "tratativa" });
    expect(montarEntrada(CLICKUP, r)).toEqual({
      campos: { token: "", listaPadraoId: "900" },
      listas: { s1: "111" },
      mapaStatus: { complete: "resolvida", "em andamento": "tratativa" },
    });
  });

  it("canais não mandam listas nem mapa", () => {
    const shopee: Integracao = {
      ...CLICKUP,
      chave: "shopee",
      clickup: undefined,
    };
    const corpo = montarEntrada(shopee, rascunhoInicial(shopee));
    expect(corpo).not.toHaveProperty("listas");
    expect(corpo).not.toHaveProperty("mapaStatus");
  });

  it("mensagens de erro em português, sem detalhe técnico", () => {
    expect(mensagemIntegracao(403)).toContain("administrador");
    expect(mensagemIntegracao(401)).toContain("sessão");
    expect(mensagemIntegracao(503, "Defina a chave.")).toBe("Defina a chave.");
    expect(formatarQuando(null)).toBe("nunca testado");
  });
});

describe("migração de integrações", () => {
  it("aplica sobre a base e guarda segredo só como texto cifrado", async () => {
    const db = new PGlite();
    await db.exec(migracao("20261022000000_base_v2"));
    await db.exec(migracao("20261023000000_integracoes"));
    await db.exec(
      `INSERT INTO integracoes_config (chave, segredos, "alteradoEm")
       VALUES ('clickup', '{"token":{"cifrado":"v1.x.y.z","fim":"ABCD"}}', now())`,
    );
    const r = await db.query<{ estado: string }>(
      "SELECT estado FROM integracoes_config WHERE chave = 'clickup'",
    );
    expect(r.rows[0].estado).toBe("pendente");
    const col = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'clickup_cards' AND column_name = 'proximaTentativaEm'`,
    );
    expect(col.rows).toHaveLength(1);
    await db.close();
  });
});

describe("fila de envio ao ClickUp na tela", () => {
  const item = (extra: Partial<ItemFilaClickup> = {}): ItemFilaClickup => ({
    cardId: "c1",
    titulo: "Reclamação #12",
    estado: "erro",
    taskId: null,
    tentativas: 2,
    ultimoErro: "O ClickUp respondeu 500",
    proximaTentativaEm: "2026-10-22T15:05:00Z",
    comentariosPendentes: 0,
    ...extra,
  });

  it("diz o que falta: criar o card, atualizar e comentar", () => {
    expect(oQueFalta(item())).toBe("criar o card");
    expect(oQueFalta(item({ taskId: "t1" }))).toBe("atualizar o card");
    expect(oQueFalta(item({ taskId: "t1", comentariosPendentes: 1 }))).toBe(
      "atualizar o card e 1 comentário",
    );
    expect(oQueFalta(item({ taskId: "t1", comentariosPendentes: 3 }))).toBe(
      "atualizar o card e 3 comentários",
    );
  });

  it("esgotado não tem próxima tentativa: pede o botão", () => {
    expect(
      proximaTentativa(item({ estado: "esgotado", proximaTentativaEm: null })),
    ).toContain("Tentar de novo");
    expect(proximaTentativa(item())).not.toContain("Tentar de novo");
  });
});
