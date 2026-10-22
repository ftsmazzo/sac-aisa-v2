import { describe, expect, it } from "vitest";
import {
  type Integracao,
  montarEntrada,
  rascunhoInicial,
} from "../lib/integracoes";
import {
  MINUTOS_DO_ROTEIRO,
  mensagemTreino,
  ROTEIRO,
  TEXTO_FAIXA_TREINO,
} from "../lib/treino";

describe("faixa e roteiro do modo treino", () => {
  it("a faixa diz com clareza que os dados são fictícios", () => {
    expect(TEXTO_FAIXA_TREINO).toBe("MODO TREINO: dados fictícios");
  });

  it("o roteiro tem 10 passos que somam 10 minutos", () => {
    expect(ROTEIRO).toHaveLength(10);
    expect(MINUTOS_DO_ROTEIRO).toBe(10);
  });

  it("cada passo tem texto e um link direto para uma tela do sistema", () => {
    const telas = [
      "/",
      "/reclamacoes",
      "/fila",
      "/alertas",
      "/relatorios",
      "/admin/treino",
    ];
    for (const p of ROTEIRO) {
      expect(p.titulo.length).toBeGreaterThan(0);
      expect(p.fazer.length).toBeGreaterThan(10);
      expect(p.dizer.length).toBeGreaterThan(10);
      expect(p.rotulo.length).toBeGreaterThan(0);
      const caminho = p.href.split("?")[0];
      expect(telas, p.titulo).toContain(caminho);
    }
    expect(new Set(ROTEIRO.map((p) => p.titulo)).size).toBe(ROTEIRO.length);
  });

  it("o roteiro passa pelos simuladores, pela fila, pelos alertas e pelos relatórios", () => {
    const hrefs = ROTEIRO.map((p) => p.href);
    for (const h of ["/admin/treino", "/fila", "/alertas", "/relatorios"]) {
      expect(hrefs).toContain(h);
    }
  });

  it("as mensagens de erro não vazam detalhe técnico", () => {
    expect(mensagemTreino(403)).toContain("administrador");
    expect(mensagemTreino(502)).toContain("indisponível");
    expect(mensagemTreino(400, "Confirme.")).toBe("Confirme.");
  });
});

describe("integração com o ClickUp: cards de treino", () => {
  const clickup: Integracao = {
    chave: "clickup",
    nome: "ClickUp",
    resumo: "",
    passos: [],
    estado: "conectado",
    ultimoErro: null,
    testadoEm: null,
    campos: [],
    clickup: {
      setores: [],
      mapaEstados: {} as never,
      padraoEstados: {} as never,
    },
  };

  it("vem desligada por padrão e segue o que o servidor informa", () => {
    expect(rascunhoInicial(clickup).criarCardsTreino).toBe(false);
    const ligado: Integracao = {
      ...clickup,
      clickup: {
        ...(clickup.clickup as NonNullable<Integracao["clickup"]>),
        criarCardsTreino: true,
      },
    };
    expect(rascunhoInicial(ligado).criarCardsTreino).toBe(true);
  });

  it("vai no corpo do PUT só para o ClickUp", () => {
    const r = { ...rascunhoInicial(clickup), criarCardsTreino: true };
    expect(montarEntrada(clickup, r).criarCardsTreino).toBe(true);
    const shopee: Integracao = {
      ...clickup,
      chave: "shopee",
      clickup: undefined,
    };
    expect(
      "criarCardsTreino" in montarEntrada(shopee, rascunhoInicial(shopee)),
    ).toBe(false);
  });
});
