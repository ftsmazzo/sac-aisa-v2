import { situacao } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import {
  type Escopo,
  type FichaBanco,
  filtroDeEscopo,
  type LinhaBanco,
  lerConsulta,
  montarFiltro,
  type OpcoesFiltro,
  paraItemLista,
  type RepositorioReclamacoes,
  ServicoReclamacoes,
} from "./reclamacoes";

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

function linha(over: Partial<LinhaBanco> = {}): LinhaBanco {
  return {
    id: "r1",
    numero: 7,
    dataAbertura: dia("2026-03-10"),
    dataAcao: null,
    devolucao: "NA",
    estado: "em_tratativa",
    estadoDesde: new Date("2026-03-10T12:00:00Z"),
    prazoMarketplace: null,
    descricao: "Cliente recebeu a peça trincada.",
    cidade: "Araraquara",
    uf: "SP",
    marca: { id: "m1", nome: "AISA" },
    canal: { id: "c1", nome: "Mercado Livre" },
    produto: { codigo: "P1", nome: "Produto 1" },
    causa: { id: "transporte", nome: "Avaria", categoria: "Transporte" },
    setorResp: { id: "s1", nome: "Logística" },
    custo: {
      freteEnvio: "10.10",
      freteRetorno: "20.20",
      valorPeca: "5",
      estorno: "0",
      desconto: "0.1",
      guia: "0",
    },
    ...over,
  };
}

function ficha(over: Partial<FichaBanco> = {}): FichaBanco {
  return {
    ...linha(),
    protocoloExterno: null,
    dataRecebimento: null,
    laudo: "",
    procedencia: "",
    solucao: "",
    observacao: "",
    garantia: "",
    pedido: "123",
    clienteNome: "Maria",
    transportadora: "",
    peca: "",
    setorRespManual: false,
    causaManual: false,
    rascunho: false,
    origemRegistro: "importacao",
    criadoEm: new Date("2026-03-10T12:00:00Z"),
    alteradoEm: new Date("2026-03-11T12:00:00Z"),
    bancada: null,
    causas: [
      { primaria: true, causa: { id: "a", nome: "A", categoria: "X" } },
      { primaria: false, causa: { id: "b", nome: "B", categoria: "X" } },
    ],
    analises: [],
    historicoEstados: [],
    _count: { fotos: 2 },
    ...over,
  };
}

describe("lerConsulta", () => {
  it("usa padrões sem parâmetros", () => {
    expect(lerConsulta({})).toEqual({
      ok: true,
      consulta: { pagina: 1, porPagina: 25 },
    });
  });

  it("lê filtros válidos e ignora vazios", () => {
    const r = lerConsulta({
      de: "2026-01-01",
      ate: "2026-02-01",
      marca: "m1",
      canal: " ",
      situacao: "resolvida",
      busca: " trinca ",
      pagina: "2",
      porPagina: "50",
    });
    expect(r).toEqual({
      ok: true,
      consulta: {
        de: "2026-01-01",
        ate: "2026-02-01",
        marcaId: "m1",
        situacao: "resolvida",
        busca: "trinca",
        pagina: 2,
        porPagina: 50,
      },
    });
  });

  it.each([
    [{ de: "2026-13-01" }],
    [{ de: "2026-02-30" }],
    [{ de: "01/02/2026" }],
    [{ de: "2026-05-01", ate: "2026-04-01" }],
    [{ situacao: "feita" }],
    [{ pagina: "0" }],
    [{ pagina: "-1" }],
    [{ pagina: "abc" }],
    [{ porPagina: "101" }],
    [{ porPagina: "0" }],
    [{ busca: "x".repeat(101) }],
    [{ marca: "x".repeat(65) }],
  ])("recusa %j", (q) => {
    expect(lerConsulta(q).ok).toBe(false);
  });
});

describe("escopo e filtro", () => {
  it("administrador, gestor e operação não têm restrição de setor", () => {
    for (const perfil of ["administrador", "gestor", "operacao"] as const) {
      expect(filtroDeEscopo({ perfil, setores: [] })).toBeNull();
    }
  });

  it("responsável de setor fica restrito aos seus setores", () => {
    expect(
      filtroDeEscopo({ perfil: "responsavel_setor", setores: ["Solda"] }),
    ).toEqual({ setorResp: { nome: { in: ["Solda"] } } });
  });

  it("responsável sem setor não vê nada", () => {
    expect(
      filtroDeEscopo({ perfil: "responsavel_setor", setores: [] }),
    ).toEqual({ setorResp: { nome: { in: [] } } });
  });

  it("o escopo acompanha qualquer filtro escolhido pela pessoa", () => {
    const w = montarFiltro(
      { pagina: 1, porPagina: 25, setorId: "outro-setor" },
      { perfil: "responsavel_setor", setores: ["Solda"] },
    );
    expect(w).toEqual({
      AND: [
        { treino: false },
        { setorResp: { nome: { in: ["Solda"] } } },
        { setorRespId: "outro-setor" },
      ],
    });
  });

  it("sem filtro e sem restrição, não filtra nada", () => {
    expect(
      montarFiltro(
        { pagina: 1, porPagina: 25 },
        { perfil: "gestor", setores: [] },
      ),
    ).toEqual({ AND: [{ treino: false }] });
  });

  it("período vira intervalo de datas", () => {
    const w = montarFiltro(
      { pagina: 1, porPagina: 25, de: "2026-01-01", ate: "2026-01-31" },
      { perfil: "gestor", setores: [] },
    );
    expect(w).toEqual({
      AND: [
        { treino: false },
        {
          dataAbertura: { gte: dia("2026-01-01"), lte: dia("2026-01-31") },
        },
      ],
    });
  });

  it("busca por número aceita #", () => {
    const w = montarFiltro(
      { pagina: 1, porPagina: 25, busca: "#42" },
      { perfil: "gestor", setores: [] },
    ) as { AND: { OR: unknown[] }[] };
    expect(w.AND[1].OR).toContainEqual({ numero: 42 });
  });

  it("texto de busca é só valor: aspas e símbolos não viram consulta", () => {
    const b = "x'; DROP TABLE reclamacoes; --";
    const w = montarFiltro(
      { pagina: 1, porPagina: 25, busca: b },
      { perfil: "gestor", setores: [] },
    ) as { AND: { OR: Record<string, unknown>[] }[] };
    expect(w.AND[1].OR[0]).toEqual({
      descricao: { contains: b, mode: "insensitive" },
    });
  });

  it("filtros de situação batem com a regra do domínio", () => {
    const esperado = {
      resolvida: { dataAcao: { not: null } },
      aguardando: { dataAcao: null, devolucao: "AGUARDANDO" },
      tratativa: { dataAcao: null, devolucao: { not: "AGUARDANDO" } },
    } as const;
    for (const s of ["resolvida", "aguardando", "tratativa"] as const) {
      const w = montarFiltro(
        { pagina: 1, porPagina: 25, situacao: s },
        { perfil: "gestor", setores: [] },
      );
      expect(w).toEqual({ AND: [{ treino: false }, esperado[s]] });
    }

    // Cada caso cai em exatamente uma situação, a mesma que o domínio calcula.
    const casos = [
      { dataAcao: "2026-04-01", devolucao: "AGUARDANDO" },
      { dataAcao: null, devolucao: "AGUARDANDO" },
      { dataAcao: null, devolucao: "RECEBIDO" },
      { dataAcao: null, devolucao: "NA" },
    ] as const;
    const bate = (
      c: (typeof casos)[number],
      s: "resolvida" | "aguardando" | "tratativa",
    ) => {
      if (s === "resolvida") return c.dataAcao !== null;
      if (c.dataAcao !== null) return false;
      return s === "aguardando"
        ? c.devolucao === "AGUARDANDO"
        : c.devolucao !== "AGUARDANDO";
    };
    for (const c of casos) {
      const sits = (["resolvida", "aguardando", "tratativa"] as const).filter(
        (s) => bate(c, s),
      );
      expect(sits).toEqual([situacao(c)]);
    }
  });
});

describe("formato da resposta", () => {
  it("situação e custo saem do domínio, em número", () => {
    const item = paraItemLista(linha());
    expect(item.situacao).toBe("tratativa");
    expect(item.custoTotal).toBe(35.4);
    expect(item.dataAbertura).toBe("2026-03-10");
  });

  it("resolvida quando há data de ação, mesmo aguardando devolução", () => {
    const item = paraItemLista(
      linha({ dataAcao: dia("2026-03-20"), devolucao: "AGUARDANDO" }),
    );
    expect(item.situacao).toBe("resolvida");
  });

  it("sem custo gravado, o total é zero", () => {
    expect(paraItemLista(linha({ custo: null })).custoTotal).toBe(0);
  });

  it("resumo longo é cortado", () => {
    const item = paraItemLista(linha({ descricao: "a".repeat(300) }));
    expect(item.resumo.length).toBe(158);
  });
});

const OPCOES: OpcoesFiltro = {
  marcas: [{ id: "m1", nome: "AISA" }],
  canais: [{ id: "c1", nome: "ML" }],
  setores: [
    { id: "s1", nome: "Logística" },
    { id: "s2", nome: "Solda" },
  ],
  causas: [],
  bancadas: [],
};

function repoFalso() {
  const chamadas: unknown[] = [];
  const repo: RepositorioReclamacoes = {
    async listar(args) {
      chamadas.push(args);
      return { linhas: [linha()], total: 51 };
    },
    async obter(where) {
      chamadas.push(where);
      return ficha();
    },
    async opcoes() {
      return OPCOES;
    },
  };
  return { repo, chamadas };
}

describe("ServicoReclamacoes", () => {
  const gestor: Escopo = { perfil: "gestor", setores: [] };

  it("pagina e calcula o total de páginas", async () => {
    const { repo, chamadas } = repoFalso();
    const r = await new ServicoReclamacoes(repo).listar(
      { pagina: 3, porPagina: 20 },
      gestor,
    );
    expect(r).toMatchObject({ total: 51, pagina: 3, totalPaginas: 3 });
    expect(r.itens).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ skip: 40, take: 20 });
  });

  it("lista vazia ainda tem 1 página", async () => {
    const repo: RepositorioReclamacoes = {
      ...repoFalso().repo,
      listar: async () => ({ linhas: [], total: 0 }),
    };
    const r = await new ServicoReclamacoes(repo).listar(
      { pagina: 1, porPagina: 25 },
      gestor,
    );
    expect(r.totalPaginas).toBe(1);
  });

  it("a ficha do responsável é buscada já com o escopo do setor", async () => {
    const { repo, chamadas } = repoFalso();
    await new ServicoReclamacoes(repo).obter("r1", {
      perfil: "responsavel_setor",
      setores: ["Solda"],
    });
    expect(chamadas[0]).toEqual({
      AND: [
        { id: "r1", treino: false },
        { setorResp: { nome: { in: ["Solda"] } } },
      ],
    });
  });

  it("ficha fora do escopo ou inexistente devolve null", async () => {
    const repo: RepositorioReclamacoes = {
      ...repoFalso().repo,
      obter: async () => null,
    };
    expect(await new ServicoReclamacoes(repo).obter("x", gestor)).toBeNull();
  });

  it("a ficha traz custos, causas extras e fotos", async () => {
    const r = await new ServicoReclamacoes(repoFalso().repo).obter(
      "r1",
      gestor,
    );
    expect(r?.custos.freteRetorno).toBe(20.2);
    expect(r?.causasExtras).toEqual([{ id: "b", nome: "B", categoria: "X" }]);
    expect(r?.fotos).toBe(2);
    expect(r?.clienteNome).toBe("Maria");
  });

  it("responsável só recebe os próprios setores nas opções", async () => {
    const o = await new ServicoReclamacoes(repoFalso().repo).opcoes({
      perfil: "responsavel_setor",
      setores: ["Solda"],
    });
    expect(o.setores).toEqual([{ id: "s2", nome: "Solda" }]);
    expect(o.marcas).toHaveLength(1);
  });

  it("gestor recebe todos os setores nas opções", async () => {
    const o = await new ServicoReclamacoes(repoFalso().repo).opcoes(gestor);
    expect(o.setores).toHaveLength(2);
  });
});
