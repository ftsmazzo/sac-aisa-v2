import { describe, expect, it } from "vitest";
import {
  type Integracao,
  montarEntrada,
  rascunhoInicial,
} from "../lib/integracoes";
import { botoesDoCanal, formatarMs, simboloDoItem } from "../lib/simulacao";
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

  it("o roteiro tem 9 passos que somam 10 minutos", () => {
    expect(ROTEIRO).toHaveLength(9);
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
      "/admin/simulacao-canais",
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

  it("o roteiro passa pela simulação de canais, pela fila, pelos alertas e pelos relatórios", () => {
    const hrefs = ROTEIRO.map((p) => p.href);
    for (const h of [
      "/admin/simulacao-canais",
      "/fila",
      "/alertas",
      "/relatorios",
    ]) {
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
      assistente: { workspaceId: "", spaceId: "", webhookAtivo: false },
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

describe("tela de simulação de canais", () => {
  it("cada canal tem os cenários pedidos, com o texto certo no primeiro", () => {
    const ml = botoesDoCanal("mercadolivre");
    const sp = botoesDoCanal("shopee");
    expect(ml.map((b) => b.cenario)).toEqual([
      "novo_caso",
      "atualizacao",
      "aviso_duplicado",
      "aviso_perdido",
      "busca",
    ]);
    expect(ml[0].rotulo).toBe("Novo caso do Mercado Livre");
    expect(sp[0].rotulo).toBe("Nova devolução da Shopee");
  });

  it("o item da lista 'o que falta' mostra feito, falta ou conferir no painel", () => {
    expect(simboloDoItem(true).texto).toBe("✓");
    expect(simboloDoItem(false).texto).toBe("✗");
    expect(simboloDoItem(null).rotulo).toContain("painel do canal");
  });

  it("o tempo aparece em ms ou segundos, e vazio para marco sem duração", () => {
    expect(formatarMs(42)).toBe("42 ms");
    expect(formatarMs(1500)).toBe("1.5 s");
    expect(formatarMs(null)).toBe("—");
  });
});
