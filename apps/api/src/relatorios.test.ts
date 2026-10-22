import "reflect-metadata";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import { CHAVE_REQUER } from "./auth.guard";
import { ErroEscrita } from "./reclamacoes-escrita";
import {
  calcularRelatorio,
  type FiltrosRelatorio,
  filtroDoRelatorio,
  LIMITE_RELATORIO,
  type LinhaRelatorio,
  lerFiltrosRelatorio,
  type RepositorioRelatorios,
  ServicoRelatorios,
} from "./relatorios";
import { ControladorRelatorios } from "./relatorios.controller";

function usuario(perfil: Perfil, setores: string[] = []): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: `Pessoa ${perfil}`,
    perfil,
    setores,
    permissoes: mesclarPermissoes(perfil, []),
  };
}

const SEM_CUSTO = {
  freteEnvio: 0,
  freteRetorno: 0,
  valorPeca: 0,
  estorno: 0,
  desconto: 0,
  guia: 0,
};

function linha(sobrescrever: Partial<LinhaRelatorio> = {}): LinhaRelatorio {
  return {
    dataAbertura: "2026-03-01",
    dataRecebimento: null,
    dataAcao: null,
    devolucao: "NA",
    primeiraAnalise: null,
    produto: { codigo: "P1", nome: "Produto 1" },
    bancada: { codigo: "01", nome: "" },
    causa: { nome: "Solda", categoria: "Fabricação", origem: "montagem" },
    setorResp: { nome: "Solda" },
    custos: SEM_CUSTO,
    ...sobrescrever,
  };
}

function repoFalso(linhas: LinhaRelatorio[] = []) {
  const chamadas: Parameters<RepositorioRelatorios["linhas"]>[0][] = [];
  const repo: RepositorioRelatorios = {
    async linhas(args) {
      chamadas.push(args);
      return linhas;
    },
  };
  return { repo, chamadas };
}

describe("lerFiltrosRelatorio", () => {
  it("aceita período, marca, setor e causa; ignora o resto", () => {
    expect(
      lerFiltrosRelatorio({
        de: "2026-01-01",
        ate: "2026-03-31",
        marca: "m1",
        setor: "s1",
        causa: "c1",
        busca: "x",
        pagina: "9",
      }),
    ).toEqual({
      ok: true,
      filtros: {
        de: "2026-01-01",
        ate: "2026-03-31",
        marcaId: "m1",
        setorId: "s1",
        causaId: "c1",
      },
    });
  });

  it("sem parâmetros, não filtra nada", () => {
    expect(lerFiltrosRelatorio({})).toEqual({ ok: true, filtros: {} });
  });

  it("recusa data inválida e período invertido", () => {
    expect(lerFiltrosRelatorio({ de: "31/01/2026" }).ok).toBe(false);
    expect(
      lerFiltrosRelatorio({ de: "2026-05-01", ate: "2026-01-01" }).ok,
    ).toBe(false);
  });

  it("recusa filtro longo demais", () => {
    expect(lerFiltrosRelatorio({ setor: "x".repeat(65) }).ok).toBe(false);
  });
});

describe("filtroDoRelatorio", () => {
  const filtros: FiltrosRelatorio = {
    de: "2026-01-01",
    ate: "2026-01-31",
    marcaId: "m1",
    setorId: "s1",
    causaId: "c1",
  };

  it("leva os filtros como valores e deixa o rascunho de fora", () => {
    const w = JSON.stringify(
      filtroDoRelatorio(filtros, { perfil: "gestor", setores: [] }),
    );
    expect(w).toContain('"marcaId":"m1"');
    expect(w).toContain('"setorRespId":"s1"');
    expect(w).toContain('"causaId":"c1"');
    expect(w).toContain('"gte":"2026-01-01T00:00:00.000Z"');
    expect(w).toContain('"lte":"2026-01-31T00:00:00.000Z"');
    expect(w).toContain('"rascunho":false');
  });

  it("responsável de setor fica preso aos próprios setores", () => {
    const w = JSON.stringify(
      filtroDoRelatorio(
        {},
        { perfil: "responsavel_setor", setores: ["Solda", "Pintura"] },
      ),
    );
    expect(w).toContain('"in":["Solda","Pintura"]');
  });

  it("quem vê todos os setores não leva filtro de escopo", () => {
    const w = JSON.stringify(
      filtroDoRelatorio({}, { perfil: "gestor", setores: ["Solda"] }),
    );
    expect(w).not.toContain("Solda");
  });
});

describe("ServicoRelatorios", () => {
  it("nega sem a permissão relatorios.ver e nem toca no banco", async () => {
    const { repo, chamadas } = repoFalso();
    let erro: unknown;
    try {
      await new ServicoRelatorios(repo).gerar({}, usuario("operacao"));
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroEscrita);
    expect((erro as ErroEscrita).status).toBe(403);
    expect(chamadas).toEqual([]);
  });

  it("administrador e gestor veem tudo; responsável de setor, com escopo", async () => {
    const { repo, chamadas } = repoFalso([linha()]);
    const servico = new ServicoRelatorios(repo);
    await servico.gerar({}, usuario("administrador"));
    await servico.gerar({}, usuario("gestor"));
    await servico.gerar({}, usuario("responsavel_setor", ["Solda"]));
    expect(JSON.stringify(chamadas[0]?.where)).not.toContain("Solda");
    expect(JSON.stringify(chamadas[1]?.where)).not.toContain("Solda");
    expect(JSON.stringify(chamadas[2]?.where)).toContain('"in":["Solda"]');
  });

  it("filtro de setor de outro setor não fura o escopo", async () => {
    const { repo, chamadas } = repoFalso();
    await new ServicoRelatorios(repo).gerar(
      { setorId: "s-logistica" },
      usuario("responsavel_setor", ["Solda"]),
    );
    const w = JSON.stringify(chamadas[0]?.where);
    expect(w).toContain('"in":["Solda"]');
    expect(w).toContain('"setorRespId":"s-logistica"');
  });

  it("pede um a mais que o teto para saber se cortou", async () => {
    const { repo, chamadas } = repoFalso([linha()]);
    const r = await new ServicoRelatorios(repo).gerar({}, usuario("gestor"));
    expect(chamadas[0]?.take).toBe(LIMITE_RELATORIO + 1);
    expect(r.cortado).toBe(false);
    expect(r.totais.reclamacoes).toBe(1);

    const muitas = Array.from({ length: LIMITE_RELATORIO + 1 }, () => linha());
    const c = await new ServicoRelatorios(repoFalso(muitas).repo).gerar(
      {},
      usuario("gestor"),
    );
    expect(c.cortado).toBe(true);
    expect(c.totais.reclamacoes).toBe(LIMITE_RELATORIO);
  });

  it("devolve os filtros aplicados e nenhum dado de cliente", async () => {
    const { repo } = repoFalso([linha()]);
    const r = await new ServicoRelatorios(repo).gerar(
      { marcaId: "m1" },
      usuario("gestor"),
    );
    expect(r.filtros).toEqual({ marcaId: "m1" });
    expect(JSON.stringify(r)).not.toMatch(/cliente|cidade|pedido/i);
  });
});

describe("ControladorRelatorios", () => {
  it("a rota exige a permissão relatorios.ver", () => {
    const meta = Reflect.getMetadata(
      CHAVE_REQUER,
      ControladorRelatorios.prototype.gerar,
    );
    expect(meta).toEqual(["relatorios.ver"]);
  });
});

describe("calcularRelatorio: totais e situação", () => {
  it("conta pela regra de situação do domínio e soma o custo", () => {
    const r = calcularRelatorio([
      linha({
        dataAcao: "2026-03-05",
        custos: { ...SEM_CUSTO, valorPeca: 10 },
      }),
      linha({ devolucao: "AGUARDANDO", custos: { ...SEM_CUSTO, guia: 5.5 } }),
      linha({ devolucao: "RECEBIDO", dataRecebimento: "2026-03-04" }),
      linha({
        custos: { ...SEM_CUSTO, freteEnvio: 1, freteRetorno: 2, estorno: 3 },
      }),
    ]);
    expect(r.totais).toEqual({
      reclamacoes: 4,
      resolvidas: 1,
      aguardando: 1,
      tratativa: 2,
      custoTotal: 21.5,
    });
  });

  it("sem reclamação, tudo zerado e médias nulas", () => {
    const r = calcularRelatorio([]);
    expect(r.totais.reclamacoes).toBe(0);
    expect(r.etapas.every((e) => e.mediaDias === null && e.n === 0)).toBe(true);
    expect(r.porSetor).toEqual([]);
    expect(r.bancadaXTipo.linhas).toEqual([]);
  });
});

describe("calcularRelatorio: tempo médio por etapa", () => {
  const etapa = (r: ReturnType<typeof calcularRelatorio>, chave: string) =>
    r.etapas.find((e) => e.chave === chave);

  it("calcula cada etapa só com quem passou por ela", () => {
    const r = calcularRelatorio([
      linha({
        devolucao: "RECEBIDO",
        dataAbertura: "2026-03-01",
        dataRecebimento: "2026-03-05",
        primeiraAnalise: "2026-03-02",
        dataAcao: "2026-03-07",
      }),
      linha({
        devolucao: "NA",
        dataAbertura: "2026-03-10",
        primeiraAnalise: "2026-03-14",
        dataAcao: "2026-03-12",
      }),
      linha({ devolucao: "AGUARDANDO", dataAbertura: "2026-03-20" }),
    ]);
    // produto chegou: só a primeira (4 dias)
    expect(etapa(r, "recebimento")).toMatchObject({ n: 1, mediaDias: 4 });
    // análise: 1 e 4 dias
    expect(etapa(r, "analise")).toMatchObject({ n: 2, mediaDias: 2.5 });
    // tratativa: do recebimento (2 dias) e da abertura sem devolução (2 dias)
    expect(etapa(r, "tratativa")).toMatchObject({ n: 2, mediaDias: 2 });
    // abertura até resolver: 6 e 2 dias
    expect(etapa(r, "total")).toMatchObject({ n: 2, mediaDias: 4 });
  });

  it("data fora de ordem não entra na média", () => {
    const r = calcularRelatorio([
      linha({ dataAbertura: "2026-03-10", dataAcao: "2026-03-01" }),
    ]);
    expect(etapa(r, "total")).toMatchObject({ n: 0, mediaDias: null });
  });
});

describe("calcularRelatorio: setor, produto e bancada × tipo", () => {
  it("ocorrências por setor, com 'Sem setor' à vista, e por produto, ordenados", () => {
    const r = calcularRelatorio([
      linha({ setorResp: { nome: "Solda" } }),
      linha({ setorResp: { nome: "Solda" } }),
      linha({ setorResp: { nome: "Logística" } }),
      linha({ setorResp: null, produto: null }),
      linha({ produto: { codigo: "P2", nome: "Produto 2" } }),
    ]);
    expect(r.porSetor.map((s) => [s.setor, s.total])).toEqual([
      ["Solda", 3],
      ["Logística", 1],
      ["Sem setor", 1],
    ]);
    expect(r.porProduto[0]).toMatchObject({ codigo: "P1", total: 3 });
    expect(r.porProduto.map((p) => p.produto)).toContain(
      "Produto não informado",
    );
  });

  it("limita os produtos à lista dos mais frequentes", () => {
    const muitos = Array.from({ length: 30 }, (_, i) =>
      linha({ produto: { codigo: `P${i}`, nome: `Produto ${i}` } }),
    );
    expect(calcularRelatorio(muitos).porProduto).toHaveLength(15);
  });

  it("defeito de componente, lote ou sem origem não é atribuído à bancada que montou", () => {
    const r = calcularRelatorio([
      linha({
        bancada: { codigo: "06", nome: "" },
        causa: { nome: "Solda", categoria: "Fabricação", origem: "montagem" },
      }),
      linha({
        bancada: { codigo: "06", nome: "" },
        causa: {
          nome: "Lote ruim",
          categoria: "Produto",
          origem: "componente_lote",
        },
      }),
      linha({
        bancada: { codigo: "06", nome: "" },
        causa: { nome: "Elétrico", categoria: "Produto", origem: null },
      }),
    ]);
    expect(r.bancadaXTipo.linhas[0]).toMatchObject({
      bancada: "06",
      total: 3,
      daMontagem: 1,
      foraDaMontagem: 2,
      porTipo: { Fabricação: 1, Produto: 2 },
    });
  });

  it("mostra 'Sem bancada' e 'A classificar' em vez de esconder", () => {
    const r = calcularRelatorio([
      linha({ bancada: null, causa: null }),
      linha({ bancada: { codigo: "01", nome: "Norte" } }),
    ]);
    expect(r.bancadaXTipo.linhas.map((l) => l.bancada)).toEqual([
      "01 · Norte",
      "Sem bancada",
    ]);
    expect(r.bancadaXTipo.tipos).toEqual(["Fabricação", "A classificar"]);
    expect(r.bancadaXTipo.linhas[1]).toMatchObject({
      total: 1,
      foraDaMontagem: 1,
      porTipo: { "A classificar": 1 },
    });
  });
});
