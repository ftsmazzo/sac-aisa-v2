import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  formatarQuando,
  type Integracao,
  mensagemIntegracao,
  montarEntrada,
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
    assistente: { workspaceId: "", spaceId: "", webhookAtivo: false },
    setores: [{ id: "s1", nome: "Solda", listaId: "111" }],
    mapaEstados: {
      triagem: "triagem",
      aguardando_cliente: "aguardando cliente",
      encaminhada: "to do",
      recebida: "recebida",
      em_tratativa: "em andamento",
      resolvida_setor: "complete",
      finalizada: "finalizada",
    },
    padraoEstados: {
      triagem: "triagem",
      aguardando_cliente: "aguardando cliente",
      encaminhada: "encaminhada",
      recebida: "recebida",
      em_tratativa: "em tratativa",
      resolvida_setor: "resolvida no setor",
      finalizada: "finalizada",
    },
  },
};

describe("formulário de integrações", () => {
  it("o segredo gravado nunca vira valor do campo: começa vazio", () => {
    const r = rascunhoInicial(CLICKUP);
    expect(r.campos).toEqual({ token: "", listaPadraoId: "900" });
    expect(JSON.stringify(r)).not.toContain("ABCD");
  });

  it("mostra só o que difere do padrão; o resto fica vazio (placeholder)", () => {
    const r = rascunhoInicial(CLICKUP);
    expect(r.estados.encaminhada).toBe("to do");
    expect(r.estados.resolvida_setor).toBe("complete");
    expect(r.estados.triagem).toBe("");
  });

  it("monta o corpo com listas e os 7 estados, aparando espaços", () => {
    const r = rascunhoInicial(CLICKUP);
    r.estados.recebida = " Aceita ";
    const corpo = montarEntrada(CLICKUP, r);
    expect(corpo.listas).toEqual({ s1: "111" });
    expect(Object.keys(corpo.mapaEstados ?? {})).toHaveLength(7);
    expect(corpo.mapaEstados?.recebida).toBe("Aceita");
    expect(corpo.mapaEstados?.triagem).toBe("");
    expect(corpo).not.toHaveProperty("mapaStatus");
  });

  it("canais não mandam listas nem mapa", () => {
    const shopee: Integracao = {
      ...CLICKUP,
      chave: "shopee",
      clickup: undefined,
    };
    const corpo = montarEntrada(shopee, rascunhoInicial(shopee));
    expect(corpo).not.toHaveProperty("listas");
    expect(corpo).not.toHaveProperty("mapaEstados");
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
