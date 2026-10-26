import "reflect-metadata";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  compararUrgencia,
  mesclarPermissoes,
  type Perfil,
  urgenciaDe,
} from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import {
  ControladorAnalise,
  ControladorFilaAlertas,
  lerMarca,
} from "./analise-fila.controller";
import {
  type AuditoriaAnalise,
  lerAnalise,
  type ReclamacaoParaAnalise,
  type RepositorioAnalise,
  ServicoAnalise,
} from "./analise-setor";
import { CHAVE_REQUER } from "./auth.guard";
import {
  type LinhaAberta,
  type RepositorioFila,
  ServicoFilaAlertas,
} from "./fila-alertas";
import { ErroEscrita } from "./reclamacoes-escrita";

const AGORA = () => new Date("2026-10-22T15:00:00Z");

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

async function recusa(p: Promise<unknown>): Promise<ErroEscrita> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroEscrita) return e;
    throw e;
  }
  throw new Error("Era esperado um ErroEscrita.");
}

// ---------- Análise ----------

function reclamacao(
  sobrescrever: Partial<ReclamacaoParaAnalise> = {},
): ReclamacaoParaAnalise {
  return {
    id: "r1",
    numero: 7,
    setorRespId: "s-log",
    devolucao: "NA",
    dataAbertura: "2026-10-01",
    dataAcao: null,
    dataRecebimento: null,
    analises: [],
    ...sobrescrever,
  };
}

function repoAnalise(
  atual: { setorNome: string; r: ReclamacaoParaAnalise } | null,
) {
  const gravado = {
    salvos: [] as Parameters<RepositorioAnalise["salvar"]>[0][],
    auditorias: [] as AuditoriaAnalise[],
    buscas: [] as unknown[],
  };
  const repo: RepositorioAnalise = {
    async obterReclamacao(where) {
      gravado.buscas.push(where);
      if (!atual) return null;
      const e = (where as { AND?: unknown[] }).AND?.[1] as
        | { setorResp: { nome: { in: string[] } } }
        | undefined;
      if (e && !e.setorResp.nome.in.includes(atual.setorNome)) return null;
      return atual.r;
    },
    async salvar(args) {
      gravado.salvos.push(args);
      const id = args.analiseId ?? "a-nova";
      gravado.auditorias.push(args.auditar(id));
      return { id };
    },
  };
  return { repo, gravado };
}

describe("lerAnalise", () => {
  it("criar exige a decisão de retorno do produto", () => {
    expect(lerAnalise({ conclusao: "x" }, "criar").ok).toBe(false);
    expect(lerAnalise({ produtoPrecisaVoltar: true }, "criar").ok).toBe(true);
  });

  it("recusa campo que o cliente não pode mandar, como setor e autor", () => {
    for (const campo of ["setorId", "analisadoPorId", "reclamacaoId", "id"]) {
      expect(
        lerAnalise({ produtoPrecisaVoltar: true, [campo]: "x" }, "criar").ok,
      ).toBe(false);
    }
  });

  it("recusa tipo e data inválidos e edição vazia", () => {
    expect(lerAnalise({ produtoPrecisaVoltar: "sim" }, "criar").ok).toBe(false);
    expect(lerAnalise({ produtoRecebidoEm: "31/10/2026" }, "editar").ok).toBe(
      false,
    );
    expect(lerAnalise({ conclusao: "x".repeat(5001) }, "editar").ok).toBe(
      false,
    );
    expect(lerAnalise({}, "editar").ok).toBe(false);
    expect(lerAnalise([], "criar").ok).toBe(false);
  });
});

describe("ServicoAnalise: permissão e escopo", () => {
  it("nega sem a permissão de analisar, sem tocar no banco", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao(),
    });
    const e = await recusa(
      new ServicoAnalise(repo, AGORA).criar(
        "r1",
        { produtoPrecisaVoltar: false },
        usuario("operacao"),
      ),
    );
    expect(e.status).toBe(403);
    expect(gravado.buscas).toEqual([]);
    expect(gravado.salvos).toEqual([]);
  });

  it("responsável de outro setor recebe 404, igual a inexistente", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao(),
    });
    const e = await recusa(
      new ServicoAnalise(repo, AGORA).criar(
        "r1",
        { produtoPrecisaVoltar: false },
        usuario("responsavel_setor", ["Solda"]),
      ),
    );
    expect(e.status).toBe(404);
    expect(gravado.salvos).toEqual([]);
  });

  it("responsável do setor analisa; gestor analisa qualquer setor", async () => {
    for (const u of [
      usuario("responsavel_setor", ["Logística"]),
      usuario("gestor"),
    ]) {
      const { repo, gravado } = repoAnalise({
        setorNome: "Logística",
        r: reclamacao(),
      });
      await new ServicoAnalise(repo, AGORA).criar(
        "r1",
        { produtoPrecisaVoltar: false },
        u,
      );
      expect(gravado.salvos).toHaveLength(1);
    }
  });

  it("o setor vem da reclamação, nunca do cliente", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({ setorRespId: "s-log" }),
    });
    await new ServicoAnalise(repo, AGORA).criar(
      "r1",
      { produtoPrecisaVoltar: false, setorId: "s-outro" } as never,
      usuario("gestor"),
    );
    expect(gravado.salvos[0]?.setorId).toBe("s-log");
  });

  it("recusa reclamação sem setor ou já resolvida", async () => {
    for (const r of [
      reclamacao({ setorRespId: null }),
      reclamacao({ dataAcao: "2026-10-10" }),
    ]) {
      const { repo, gravado } = repoAnalise({ setorNome: "Logística", r });
      const e = await recusa(
        new ServicoAnalise(repo, AGORA).criar(
          "r1",
          { produtoPrecisaVoltar: false },
          usuario("gestor"),
        ),
      );
      expect(e.status).toBe(400);
      expect(gravado.salvos).toEqual([]);
    }
  });

  it("segunda análise do mesmo setor é recusada", async () => {
    const { repo } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({
        analises: [
          {
            id: "a1",
            setorId: "s-log",
            produtoPrecisaVoltar: false,
            produtoRecebidoEm: null,
            conclusao: "",
            resultado: "",
          },
        ],
      }),
    });
    const e = await recusa(
      new ServicoAnalise(repo, AGORA).criar(
        "r1",
        { produtoPrecisaVoltar: true },
        usuario("gestor"),
      ),
    );
    expect(e.status).toBe(400);
  });
});

describe("ServicoAnalise: retorno do produto e auditoria", () => {
  const gestor = usuario("gestor");

  it("produto precisa voltar: devolução vira aguardando e a situação acompanha", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao(),
    });
    await new ServicoAnalise(repo, AGORA).criar(
      "r1",
      { produtoPrecisaVoltar: true, conclusao: "Verificar peça." },
      gestor,
    );
    expect(gravado.salvos[0]?.reclamacao).toEqual({
      devolucao: "AGUARDANDO",
      dataRecebimento: null,
      situacao: "aguardando",
    });
  });

  it("com data de recebimento, vira recebido e entra em tratativa", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({ devolucao: "AGUARDANDO" }),
    });
    await new ServicoAnalise(repo, AGORA).criar(
      "r1",
      { produtoPrecisaVoltar: true, produtoRecebidoEm: "2026-10-15" },
      gestor,
    );
    expect(gravado.salvos[0]?.reclamacao).toEqual({
      devolucao: "RECEBIDO",
      dataRecebimento: "2026-10-15",
      situacao: "tratativa",
    });
  });

  it("não volta: a reclamação nem é tocada se já estava sem devolução", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao(),
    });
    await new ServicoAnalise(repo, AGORA).criar(
      "r1",
      { produtoPrecisaVoltar: false },
      gestor,
    );
    expect(gravado.salvos[0]?.reclamacao).toBeNull();
  });

  it("recusa data de recebimento sem retorno, no futuro ou antes da abertura", async () => {
    const casos: Record<string, unknown>[] = [
      { produtoPrecisaVoltar: false, produtoRecebidoEm: "2026-10-15" },
      { produtoPrecisaVoltar: true, produtoRecebidoEm: "2026-12-01" },
      { produtoPrecisaVoltar: true, produtoRecebidoEm: "2026-09-01" },
    ];
    for (const c of casos) {
      const { repo, gravado } = repoAnalise({
        setorNome: "Logística",
        r: reclamacao(),
      });
      const e = await recusa(
        new ServicoAnalise(repo, AGORA).criar("r1", c as never, gestor),
      );
      expect(e.status).toBe(400);
      expect(gravado.salvos).toEqual([]);
    }
  });

  it("não aceita dizer que o produto não volta se ele já foi recebido", async () => {
    const { repo } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({ devolucao: "RECEBIDO", dataRecebimento: "2026-10-10" }),
    });
    const e = await recusa(
      new ServicoAnalise(repo, AGORA).criar(
        "r1",
        { produtoPrecisaVoltar: false },
        gestor,
      ),
    );
    expect(e.status).toBe(400);
  });

  it("grava auditoria com autor e mudanças, sem copiar texto livre", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao(),
    });
    await new ServicoAnalise(repo, AGORA).criar(
      "r1",
      { produtoPrecisaVoltar: true, conclusao: "Dado do cliente Fulano." },
      gestor,
    );
    const a = gravado.auditorias[0];
    expect(a).toMatchObject({
      usuarioId: "u-gestor",
      acao: "analise.criar",
      alvo: "Reclamação #7",
      reclamacaoId: "r1",
    });
    expect(a?.extra.mudancas).toEqual(
      expect.arrayContaining([
        { campo: "produtoPrecisaVoltar", de: null, para: true },
        { campo: "conclusao", alterado: true },
        { campo: "reclamacao.devolucao", de: "NA", para: "AGUARDANDO" },
      ]),
    );
    expect(JSON.stringify(a)).not.toContain("Fulano");
  });

  const existente = {
    id: "a1",
    setorId: "s-log",
    produtoPrecisaVoltar: true,
    produtoRecebidoEm: null,
    conclusao: "Inicial.",
    resultado: "",
  };

  it("editar muda a análise e audita; sem mudança não grava nada", async () => {
    const { repo, gravado } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({ devolucao: "AGUARDANDO", analises: [existente] }),
    });
    const s = new ServicoAnalise(repo, AGORA);
    const igual = await s.editar("r1", "a1", { conclusao: "Inicial." }, gestor);
    expect(igual.alterou).toBe(false);
    expect(gravado.salvos).toEqual([]);

    const r = await s.editar(
      "r1",
      "a1",
      { produtoRecebidoEm: "2026-10-18" },
      gestor,
    );
    expect(r.alterou).toBe(true);
    expect(gravado.salvos[0]?.analiseId).toBe("a1");
    expect(gravado.auditorias[0]?.acao).toBe("analise.editar");
    expect(gravado.salvos[0]?.reclamacao?.situacao).toBe("tratativa");
  });

  it("editar análise de outro setor ou inexistente dá 404", async () => {
    const { repo } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({
        analises: [{ ...existente, id: "a9", setorId: "s-solda" }],
      }),
    });
    const s = new ServicoAnalise(repo, AGORA);
    const outro = await recusa(
      s.editar("r1", "a9", { conclusao: "x" }, gestor),
    );
    const falta = await recusa(
      s.editar("r1", "zz", { conclusao: "x" }, gestor),
    );
    expect([outro.status, falta.status]).toEqual([404, 404]);
  });

  it("editar também exige permissão", async () => {
    const { repo } = repoAnalise({
      setorNome: "Logística",
      r: reclamacao({ analises: [existente] }),
    });
    const e = await recusa(
      new ServicoAnalise(repo, AGORA).editar(
        "r1",
        "a1",
        { conclusao: "x" },
        usuario("operacao"),
      ),
    );
    expect(e.status).toBe(403);
  });
});

// ---------- Regras de alerta e urgência ----------

const HOJE = "2026-10-22";
const base = { dataAcao: null, devolucao: "NA", laudo: "", solucao: "" };

describe("alertas e urgência (domínio)", () => {
  it("aguardando produto além de 7 dias dispara; em 7 não", () => {
    const aguardando = { ...base, devolucao: "AGUARDANDO" };
    expect(
      urgenciaDe({ ...aguardando, data: "2026-10-14" }, undefined, HOJE)
        .alertas,
    ).toContain("AGUARDANDO_DIAS");
    expect(
      urgenciaDe({ ...aguardando, data: "2026-10-15" }, undefined, HOJE)
        .alertas,
    ).not.toContain("AGUARDANDO_DIAS");
  });

  it("tratativa além de 2 dias dispara; resolvida nunca alerta", () => {
    expect(
      urgenciaDe({ ...base, data: "2026-10-19" }, undefined, HOJE).alertas,
    ).toContain("TRATATIVA_META");
    expect(
      urgenciaDe(
        {
          ...base,
          data: "2026-01-01",
          dataAcao: "2026-01-02",
          freteEnvio: 900,
        },
        undefined,
        HOJE,
      ).alertas,
    ).toEqual([]);
  });

  it("custo a partir de R$ 500 dispara", () => {
    const u = (v: number) =>
      urgenciaDe({ ...base, data: HOJE, valorPeca: v }, undefined, HOJE)
        .alertas;
    expect(u(500)).toContain("CUSTO_ALTO");
    expect(u(499.99)).not.toContain("CUSTO_ALTO");
  });

  it("causa 'outros' além de 3 dias dispara", () => {
    expect(
      urgenciaDe(
        { ...base, data: "2026-10-18", reclamacao: "xyz sem pista" },
        undefined,
        HOJE,
      ).alertas,
    ).toContain("CAUSA_OUTROS");
  });

  it("ordena por alertas, depois dias, depois custo", () => {
    const a = urgenciaDe(
      { ...base, data: "2026-10-01", valorPeca: 600 },
      undefined,
      HOJE,
    );
    const b = urgenciaDe({ ...base, data: "2026-10-05" }, undefined, HOJE);
    const c = urgenciaDe({ ...base, data: "2026-10-21" }, undefined, HOJE);
    expect([c, b, a].sort(compararUrgencia)).toEqual([a, b, c]);
  });
});

// ---------- Fila e alertas (serviço) ----------

const SEM_CUSTO = {
  freteEnvio: 0,
  freteRetorno: 0,
  valorPeca: 0,
  estorno: 0,
  desconto: 0,
  guia: 0,
};

function linha(sobrescrever: Partial<LinhaAberta> = {}): LinhaAberta {
  return {
    id: "r1",
    numero: 1,
    dataAbertura: "2026-10-21",
    dataAcao: null,
    estado: "recebida",
    estadoDesde: "2026-10-21T12:00:00.000Z",
    prazoMarketplace: null,
    devolucao: "NA",
    causaId: null,
    causaManual: false,
    descricao: "Peça chegou amassada.",
    laudo: "",
    solucao: "",
    produto: null,
    causaNome: null,
    setorResp: { id: "s-log", nome: "Logística" },
    setoresComAnalise: [],
    custos: SEM_CUSTO,
    ...sobrescrever,
  };
}

function repoFila(linhas: LinhaAberta[]) {
  const buscas: unknown[] = [];
  const repo: RepositorioFila = {
    async abertas(where) {
      buscas.push(where);
      return linhas;
    },
  };
  return { repo, buscas };
}

describe("ServicoFilaAlertas", () => {
  it("fila: tira quem já tem análise do setor e ordena por urgência", async () => {
    const { repo } = repoFila([
      linha({ id: "nova", numero: 1, dataAbertura: "2026-10-21" }),
      linha({ id: "velha", numero: 2, dataAbertura: "2026-10-01" }),
      linha({
        id: "analisada",
        numero: 3,
        dataAbertura: "2026-09-01",
        setoresComAnalise: ["s-log"],
      }),
      linha({
        id: "cara",
        numero: 4,
        dataAbertura: "2026-10-21",
        custos: { ...SEM_CUSTO, valorPeca: 800 },
      }),
    ]);
    const f = await new ServicoFilaAlertas(repo, AGORA).fila(usuario("gestor"));
    // Quem já foi analisado continua na fila até o setor devolver a solução.
    expect(f.itens.map((i) => i.id)).toEqual([
      "analisada",
      "velha",
      "cara",
      "nova",
    ]);
    expect(f.itens[0]?.analisada).toBe(true);
    expect(f.itens[1]?.alertas).toContain("TRATATIVA_META");
    expect(f.total).toBe(4);
  });

  it("fila: análise de outro setor não tira a pendência do setor atual", async () => {
    const { repo } = repoFila([linha({ setoresComAnalise: ["s-solda"] })]);
    const f = await new ServicoFilaAlertas(repo, AGORA).fila(usuario("gestor"));
    expect(f.total).toBe(1);
  });

  it("fila: aplica o escopo do setor e só pede reclamação em aberto com setor", async () => {
    const { repo, buscas } = repoFila([]);
    await new ServicoFilaAlertas(repo, AGORA).fila(
      usuario("responsavel_setor", ["Logística"]),
    );
    const and = (buscas[0] as { AND: unknown[] }).AND;
    expect(and).toContainEqual({ estado: { not: "finalizada" } });
    expect(and).toContainEqual({
      estado: { in: ["encaminhada", "recebida", "em_tratativa"] },
    });
    expect(and).toContainEqual({ setorRespId: { not: null } });
    expect(and).toContainEqual({ setorResp: { nome: { in: ["Logística"] } } });
  });

  it("fila e alertas: a marca entra como filtro e some quando não vem", async () => {
    const { repo, buscas } = repoFila([]);
    const s = new ServicoFilaAlertas(repo, AGORA);
    await s.fila(usuario("gestor"), "m-aisa");
    await s.alertas(usuario("gestor"), "m-aisa");
    await s.fila(usuario("gestor"));
    const [fila, alertas, semMarca] = buscas.map(
      (b) => (b as { AND: unknown[] }).AND,
    );
    expect(fila).toContainEqual({ marcaId: "m-aisa" });
    expect(alertas).toContainEqual({ marcaId: "m-aisa" });
    expect(semMarca).not.toContainEqual({ marcaId: "m-aisa" });
  });

  it("lerMarca: aceita id, trata vazio como todas e recusa formato estranho", () => {
    expect(lerMarca(undefined)).toBeUndefined();
    expect(lerMarca("")).toBeUndefined();
    expect(lerMarca("abc-123")).toBe("abc-123");
    expect(() => lerMarca("a b")).toThrow();
    expect(() => lerMarca(["x"])).toThrow();
    expect(() => lerMarca({ not: "x" })).toThrow();
  });

  it("fila e alertas negam sem a permissão, sem consultar o banco", async () => {
    const { repo, buscas } = repoFila([]);
    const s = new ServicoFilaAlertas(repo, AGORA);
    expect((await recusa(s.fila(usuario("operacao")))).status).toBe(403);
    const semAlertas: UsuarioLogado = { ...usuario("gestor"), permissoes: [] };
    expect((await recusa(s.alertas(semAlertas))).status).toBe(403);
    expect(buscas).toEqual([]);
  });

  it("alertas: lista os disparados pelas regras e conta por tipo", async () => {
    const { repo } = repoFila([
      linha({ id: "a", numero: 1, dataAbertura: "2026-10-21" }),
      linha({
        id: "b",
        numero: 2,
        dataAbertura: "2026-10-01",
        devolucao: "AGUARDANDO",
      }),
      linha({
        id: "c",
        numero: 3,
        dataAbertura: "2026-10-20",
        custos: { ...SEM_CUSTO, valorPeca: 500 },
      }),
    ]);
    const r = await new ServicoFilaAlertas(repo, AGORA).alertas(
      usuario("gestor"),
    );
    expect(r.itens.map((i) => [i.numero, i.tipo])).toEqual(
      expect.arrayContaining([
        [2, "AGUARDANDO_DIAS"],
        [3, "CUSTO_ALTO"],
      ]),
    );
    expect(r.itens.some((i) => i.numero === 1)).toBe(false);
    expect(r.porTipo.AGUARDANDO_DIAS).toBe(1);
    expect(r.total).toBe(r.itens.length);
  });

  it("alertas: responsável de setor só varre o próprio setor", async () => {
    const { repo, buscas } = repoFila([]);
    await new ServicoFilaAlertas(repo, AGORA).alertas(
      usuario("responsavel_setor", ["Solda"]),
    );
    expect((buscas[0] as { AND: unknown[] }).AND).toContainEqual({
      setorResp: { nome: { in: ["Solda"] } },
    });
  });

  it("grava prazo, custo e fila e pede para resolver o que saiu", async () => {
    const { repo } = repoFila([
      linha({
        id: "velha",
        numero: 2,
        dataAbertura: "2026-10-01",
        devolucao: "AGUARDANDO",
      }),
    ]);
    const gravados: { chaveDedupe: string; vistas: string[] }[] = [];
    await new ServicoFilaAlertas(repo, AGORA, undefined, {
      async sincronizar(args) {
        gravados.push({
          chaveDedupe: args.atuais.map((a) => a.chaveDedupe).join(","),
          vistas: args.vistas,
        });
      },
    }).alertas(usuario("gestor"));
    expect(gravados[0]?.vistas).toEqual(["velha"]);
    expect(gravados[0]?.chaveDedupe).toContain("velha:AGUARDANDO_DIAS");
  });
});

describe("rotas", () => {
  it("cada rota exige a permissão própria no guarda", () => {
    const meta = (c: object, m: string) =>
      Reflect.getMetadata(
        CHAVE_REQUER,
        (c as Record<string, unknown>)[m] as object,
      );
    expect(meta(ControladorAnalise.prototype, "criar")).toEqual([
      "reclamacoes.analisar",
    ]);
    expect(meta(ControladorAnalise.prototype, "editar")).toEqual([
      "reclamacoes.analisar",
    ]);
    expect(meta(ControladorFilaAlertas.prototype, "fila")).toEqual([
      "reclamacoes.analisar",
    ]);
    expect(meta(ControladorFilaAlertas.prototype, "alertas")).toEqual([
      "alertas.ver",
    ]);
  });
});
