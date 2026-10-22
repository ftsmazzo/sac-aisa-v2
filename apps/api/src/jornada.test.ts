import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import type { LinhaAberta, RepositorioFila } from "./fila-alertas";
import { ServicoFilaAlertas } from "./fila-alertas";
import {
  dataDeAcaoDoEstado,
  lerEntradaEstado,
  type ReclamacaoParaEstado,
  type RepositorioJornada,
  ServicoJornada,
} from "./jornada";
import { filtroDeEscopo, ServicoReclamacoes } from "./reclamacoes";
import {
  ErroEscrita,
  type EstadoReclamacao,
  estadoVazio,
  type Referencias,
  type RepositorioEscrita,
  ServicoEscrita,
  type TransicaoGravada,
} from "./reclamacoes-escrita";
import {
  ErroUsuario,
  lerEntradaUsuario,
  type RepositorioUsuarios,
  ServicoUsuarios,
  type UsuarioVisao,
} from "./usuarios";

const AGORA = () => new Date("2026-10-22T15:00:00Z");

function usuario(
  perfil: Perfil,
  setores: string[] = [],
  marcas: string[] = [],
): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: `Pessoa ${perfil}`,
    perfil,
    setores,
    marcas,
    permissoes: mesclarPermissoes(perfil, []),
  };
}

// ---------- Mudança de estado no servidor ----------

function repoJornada(r: Partial<ReclamacaoParaEstado> | null) {
  const buscas: unknown[] = [];
  const gravado: Parameters<RepositorioJornada["gravar"]>[0][] = [];
  const repo: RepositorioJornada = {
    async obter(where) {
      buscas.push(where);
      return r === null
        ? null
        : {
            id: "r1",
            numero: 12,
            estado: "triagem",
            devolucao: "NA",
            dataAbertura: "2026-10-20",
            dataAcao: null,
            setorRespId: "s-solda",
            ...r,
          };
    },
    async gravar(a) {
      gravado.push(a);
    },
  };
  return { repo, buscas, gravado };
}

async function recusa(p: Promise<unknown>): Promise<ErroEscrita | ErroUsuario> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroEscrita || e instanceof ErroUsuario) return e;
    throw e;
  }
  throw new Error("Era para recusar.");
}

describe("ServicoJornada (a regra é do servidor)", () => {
  it("o SAC encaminha: grava estado, motivo vazio e auditoria com o autor", async () => {
    const { repo, gravado } = repoJornada({ estado: "triagem" });
    const r = await new ServicoJornada(repo, AGORA).mudar(
      "r1",
      { para: "encaminhada" },
      usuario("operacao"),
    );
    expect(r).toMatchObject({ de: "triagem", estado: "encaminhada" });
    expect(gravado).toHaveLength(1);
    expect(gravado[0]).toMatchObject({
      de: "triagem",
      para: "encaminhada",
      dataAcao: null,
      reabertura: false,
    });
    expect(gravado[0].auditoria).toMatchObject({
      usuarioId: "u-operacao",
      usuarioNome: "Pessoa operacao",
      acao: "reclamacao.estado",
      reclamacaoId: "r1",
    });
  });

  it("o setor assume a reclamação do próprio setor", async () => {
    const { repo, gravado } = repoJornada({ estado: "encaminhada" });
    await new ServicoJornada(repo, AGORA).mudar(
      "r1",
      { para: "recebida" },
      usuario("responsavel_setor", ["Solda"]),
    );
    expect(gravado[0]).toMatchObject({ de: "encaminhada", para: "recebida" });
  });

  it("transição de quem não pode é 403 e nada é gravado", async () => {
    const { repo, gravado } = repoJornada({ estado: "encaminhada" });
    const e = await recusa(
      new ServicoJornada(repo, AGORA).mudar(
        "r1",
        { para: "recebida" },
        usuario("operacao"),
      ),
    );
    expect(e.status).toBe(403);
    expect(gravado).toEqual([]);
  });

  it("transição inválida é 400, com a mensagem da regra", async () => {
    const { repo, gravado } = repoJornada({ estado: "triagem" });
    const e = await recusa(
      new ServicoJornada(repo, AGORA).mudar(
        "r1",
        { para: "finalizada" },
        usuario("operacao"),
      ),
    );
    expect(e.status).toBe(400);
    expect(e.message).toContain("Não há passagem");
    expect(gravado).toEqual([]);
  });

  it("gestor fora do fluxo precisa de motivo; com motivo passa e fica no registro", async () => {
    const { repo, gravado } = repoJornada({ estado: "triagem" });
    const s = new ServicoJornada(repo, AGORA);
    expect(
      (await recusa(s.mudar("r1", { para: "recebida" }, usuario("gestor"))))
        .status,
    ).toBe(400);
    await s.mudar(
      "r1",
      { para: "recebida", motivo: "Setor já estava com o produto." },
      usuario("gestor"),
    );
    expect(gravado[0].motivo).toBe("Setor já estava com o produto.");
    expect(gravado[0].auditoria.extra.motivo).toBe(
      "Setor já estava com o produto.",
    );
  });

  it("encaminhar sem setor responsável é recusado", async () => {
    const { repo } = repoJornada({ estado: "triagem", setorRespId: null });
    const e = await recusa(
      new ServicoJornada(repo, AGORA).mudar(
        "r1",
        { para: "encaminhada" },
        usuario("operacao"),
      ),
    );
    expect(e.message).toContain("setor responsável");
  });

  it("produto ainda não chegou: nem Em tratativa nem Resolvida", async () => {
    const { repo, gravado } = repoJornada({
      estado: "recebida",
      devolucao: "AGUARDANDO",
    });
    const e = await recusa(
      new ServicoJornada(repo, AGORA).mudar(
        "r1",
        { para: "em_tratativa" },
        usuario("responsavel_setor", ["Solda"]),
      ),
    );
    expect(e.message).toContain("produto");
    expect(gravado).toEqual([]);
  });

  it("resolvida no setor técnico põe a data de ação de hoje; reabrir a limpa", async () => {
    const a = repoJornada({ estado: "em_tratativa" });
    await new ServicoJornada(a.repo, AGORA).mudar(
      "r1",
      { para: "resolvida_setor" },
      usuario("responsavel_setor", ["Solda"]),
    );
    expect(a.gravado[0]).toMatchObject({
      para: "resolvida_setor",
      dataAcao: "2026-10-22",
      situacao: "resolvida",
    });

    const b = repoJornada({ estado: "finalizada", dataAcao: "2026-10-21" });
    await new ServicoJornada(b.repo, AGORA).mudar(
      "r1",
      { para: "encaminhada", motivo: "Cliente reclamou de novo." },
      usuario("operacao"),
    );
    expect(b.gravado[0]).toMatchObject({
      de: "finalizada",
      para: "encaminhada",
      dataAcao: null,
      reabertura: true,
      motivo: "Cliente reclamou de novo.",
    });
    expect(b.gravado[0].auditoria.detalhe).toContain("Reabertura");
  });

  it("reabrir sem motivo é recusado", async () => {
    const { repo, gravado } = repoJornada({
      estado: "resolvida_setor",
      dataAcao: "2026-10-21",
    });
    const e = await recusa(
      new ServicoJornada(repo, AGORA).mudar(
        "r1",
        { para: "encaminhada" },
        usuario("operacao"),
      ),
    );
    expect(e.message).toContain("motivo");
    expect(gravado).toEqual([]);
  });

  it("fora do escopo do setor é 404, igual a não existir", async () => {
    const { repo, buscas } = repoJornada(null);
    const e = await recusa(
      new ServicoJornada(repo, AGORA).mudar(
        "r1",
        { para: "recebida" },
        usuario("responsavel_setor", ["Solda"]),
      ),
    );
    expect(e.status).toBe(404);
    expect(JSON.stringify(buscas[0])).toContain("Solda");
  });

  it("a data de ação segue o estado", () => {
    const base = { dataAcao: null, dataAbertura: "2026-10-20" };
    expect(dataDeAcaoDoEstado("resolvida_setor", base, "2026-10-22")).toBe(
      "2026-10-22",
    );
    expect(
      dataDeAcaoDoEstado(
        "finalizada",
        { ...base, dataAcao: "2026-10-21" },
        "2026-10-22",
      ),
    ).toBe("2026-10-21");
    expect(dataDeAcaoDoEstado("em_tratativa", base, "2026-10-22")).toBeNull();
    expect(
      dataDeAcaoDoEstado(
        "encaminhada",
        { ...base, dataAcao: "2026-10-21" },
        "2026-10-22",
      ),
    ).toBeNull();
  });

  it("o corpo só aceita estado e motivo", () => {
    expect(lerEntradaEstado({ para: "recebida" }).ok).toBe(true);
    expect(lerEntradaEstado({ para: "reaberta" }).ok).toBe(false);
    expect(lerEntradaEstado({ para: "recebida", autor: "x" }).ok).toBe(false);
    expect(lerEntradaEstado({ para: "recebida", motivo: 5 }).ok).toBe(false);
    expect(
      lerEntradaEstado({ para: "recebida", motivo: "x".repeat(201) }).ok,
    ).toBe(false);
    expect(lerEntradaEstado(null).ok).toBe(false);
  });
});

// ---------- Escopo por setor e por marca ----------

describe("escopo de setor e de marca", () => {
  it("SAC, gestor e administrador veem tudo, mesmo com marcas na lista", () => {
    for (const p of ["operacao", "gestor", "administrador"] as const) {
      expect(
        filtroDeEscopo({ perfil: p, setores: [], marcas: ["AISA"] }),
      ).toBeNull();
    }
  });

  it("o responsável de setor vê só os seus setores", () => {
    expect(
      filtroDeEscopo({ perfil: "responsavel_setor", setores: ["Solda"] }),
    ).toEqual({ setorResp: { nome: { in: ["Solda"] } } });
    // Sem setor vinculado, não vê nada.
    expect(
      filtroDeEscopo({ perfil: "responsavel_setor", setores: [] }),
    ).toEqual({ setorResp: { nome: { in: [] } } });
  });

  it("com marcas na lista, o responsável também fica restrito a elas", () => {
    expect(
      filtroDeEscopo({
        perfil: "responsavel_setor",
        setores: ["Solda"],
        marcas: ["AISA"],
      }),
    ).toEqual({
      AND: [
        { setorResp: { nome: { in: ["Solda"] } } },
        { marca: { nome: { in: ["AISA"] } } },
      ],
    });
  });

  it("o seletor só recebe as marcas permitidas", async () => {
    const repo = {
      async listar() {
        return { linhas: [], total: 0 };
      },
      async obter() {
        return null;
      },
      async opcoes() {
        return {
          marcas: [
            { id: "m1", nome: "AISA" },
            { id: "m2", nome: "ARTMAQ" },
          ],
          canais: [],
          setores: [
            { id: "s1", nome: "Solda" },
            { id: "s2", nome: "Logística" },
          ],
          causas: [],
          bancadas: [],
        };
      },
    };
    const s = new ServicoReclamacoes(repo, AGORA);
    const restrito = await s.opcoes({
      perfil: "responsavel_setor",
      setores: ["Solda"],
      marcas: ["ARTMAQ"],
    });
    expect(restrito.marcas.map((m) => m.nome)).toEqual(["ARTMAQ"]);
    expect(restrito.setores.map((x) => x.nome)).toEqual(["Solda"]);
    const livre = await s.opcoes({
      perfil: "responsavel_setor",
      setores: ["Solda"],
      marcas: [],
    });
    expect(livre.marcas).toHaveLength(2);
    const gestor = await s.opcoes({
      perfil: "gestor",
      setores: [],
      marcas: ["AISA"],
    });
    expect(gestor.marcas).toHaveLength(2);
    expect(gestor.setores).toHaveLength(2);
  });
});

// ---------- Fila do setor ----------

const SEM_CUSTO = {
  freteEnvio: 0,
  freteRetorno: 0,
  valorPeca: 0,
  estorno: 0,
  desconto: 0,
  guia: 0,
};

function linhaFila(over: Partial<LinhaAberta> = {}): LinhaAberta {
  return {
    id: "r1",
    numero: 1,
    dataAbertura: "2026-10-21",
    dataAcao: null,
    estado: "encaminhada",
    estadoDesde: "2026-10-22T10:00:00.000Z",
    prazoMarketplace: null,
    devolucao: "NA",
    causaId: null,
    causaManual: false,
    descricao: "Peça chegou amassada.",
    laudo: "",
    solucao: "",
    produto: null,
    causaNome: null,
    setorResp: { id: "s-solda", nome: "Solda" },
    setoresComAnalise: [],
    custos: SEM_CUSTO,
    ...over,
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

describe("fila do setor e alertas da jornada", () => {
  it("Assumir só aparece para encaminhada, a quem pode receber", async () => {
    const { repo } = repoFila([
      linhaFila({ id: "a", numero: 1, estado: "encaminhada" }),
      linhaFila({ id: "b", numero: 2, estado: "recebida" }),
    ]);
    const s = new ServicoFilaAlertas(repo, AGORA);
    for (const u of [
      usuario("responsavel_setor", ["Solda"]),
      usuario("gestor"),
    ]) {
      const f = await s.fila(u);
      const por = Object.fromEntries(f.itens.map((i) => [i.id, i]));
      expect(por.a.podeAssumir).toBe(true);
      expect(por.b.podeAssumir).toBe(false);
    }
  });

  it("a fila é só do setor: filtra os estados do setor e o escopo, e nunca finalizada", async () => {
    const { repo, buscas } = repoFila([]);
    await new ServicoFilaAlertas(repo, AGORA).fila(
      usuario("responsavel_setor", ["Solda"], ["AISA"]),
    );
    const and = (buscas[0] as { AND: unknown[] }).AND;
    expect(and).toContainEqual({ estado: { not: "finalizada" } });
    expect(and).toContainEqual({
      estado: { in: ["encaminhada", "recebida", "em_tratativa"] },
    });
    expect(and).toContainEqual({
      AND: [
        { setorResp: { nome: { in: ["Solda"] } } },
        { marca: { nome: { in: ["AISA"] } } },
      ],
    });
  });

  it("alertas: sem recebimento do setor e solução devolvida sem finalização", async () => {
    const { repo } = repoFila([
      linhaFila({
        id: "e",
        numero: 1,
        estado: "encaminhada",
        estadoDesde: "2026-10-20T10:00:00.000Z",
      }),
      linhaFila({
        id: "r",
        numero: 2,
        estado: "resolvida_setor",
        dataAcao: "2026-10-20",
        estadoDesde: "2026-10-20T10:00:00.000Z",
      }),
      linhaFila({
        id: "ok",
        numero: 3,
        estado: "encaminhada",
        estadoDesde: "2026-10-22T14:00:00.000Z",
        dataAbertura: "2026-10-22",
      }),
    ]);
    const a = await new ServicoFilaAlertas(repo, AGORA).alertas(
      usuario("gestor"),
    );
    expect(a.porTipo.SEM_RECEBIMENTO_SETOR).toBe(1);
    expect(a.porTipo.SOLUCAO_SEM_FINALIZACAO).toBe(1);
    expect(a.itens.find((i) => i.reclamacaoId === "ok")).toBeUndefined();
  });
});

// ---------- Efeito da gravação sobre a jornada ----------

const REF: Referencias = {
  canais: new Set(["c1"]),
  marcas: new Set(["m1"]),
  bancadas: new Set(),
  setores: new Set(["s-solda", "s-log"]),
  causaSetor: new Map([
    ["solda", "s-solda"],
    ["avaria", "s-log"],
  ]),
};

function repoEscrita(estado: Partial<EstadoReclamacao>) {
  const gravado: {
    estado: EstadoReclamacao;
    transicao: TransicaoGravada | null;
  }[] = [];
  const criados: EstadoReclamacao[] = [];
  const repo: RepositorioEscrita = {
    async referencias() {
      return REF;
    },
    async produtoPorCodigo() {
      return null;
    },
    async obterAtual() {
      return {
        id: "r1",
        numero: 5,
        estado: {
          ...estadoVazio("c1", "2026-10-01"),
          descricao: "Solda soltou.",
          causaId: "solda",
          causaManual: true,
          setorRespId: "s-solda",
          ...estado,
        },
      };
    },
    async criar(a) {
      criados.push(a.estado);
      return { id: "novo", numero: 6 };
    },
    async atualizar(a) {
      gravado.push({ estado: a.estado, transicao: a.transicao });
    },
  };
  return { repo, gravado, criados };
}

describe("a gravação mexe na jornada", () => {
  it("a reclamação nasce em Triagem", async () => {
    const { repo, criados } = repoEscrita({});
    await new ServicoEscrita(repo, AGORA).criar(
      { canalId: "c1", descricao: "Peça quebrada." },
      usuario("operacao"),
    );
    expect(criados[0].estado).toBe("triagem");
  });

  it("o prazo do marketplace é do SAC e vai na gravação", async () => {
    const { repo, gravado } = repoEscrita({ estado: "triagem" });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { prazoMarketplace: "2026-10-30" },
      usuario("operacao"),
    );
    expect(gravado[0].estado.prazoMarketplace).toBe("2026-10-30");
    expect(gravado[0].transicao).toBeNull();
  });

  it("data de ação em tratativa resolve no setor técnico, com histórico", async () => {
    const { repo, gravado } = repoEscrita({ estado: "em_tratativa" });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { dataAcao: "2026-10-21" },
      usuario("responsavel_setor", ["Solda"]),
    );
    expect(gravado[0].estado.estado).toBe("resolvida_setor");
    expect(gravado[0].transicao).toMatchObject({
      de: "em_tratativa",
      para: "resolvida_setor",
      reabertura: false,
    });
  });

  it("o setor não registra a ação sem receber e tratar antes", async () => {
    for (const estado of ["encaminhada", "recebida", "triagem"] as const) {
      const { repo, gravado } = repoEscrita({ estado });
      const e = await recusa(
        new ServicoEscrita(repo, AGORA).editar(
          "r1",
          { dataAcao: "2026-10-21" },
          usuario("responsavel_setor", ["Solda"]),
        ),
      );
      expect(e.status).toBe(400);
      expect(gravado).toEqual([]);
    }
  });

  it("apagar a data de ação volta a tratativa; depois de finalizada, só reabrindo", async () => {
    const a = repoEscrita({
      estado: "resolvida_setor",
      dataAcao: "2026-10-21",
    });
    await new ServicoEscrita(a.repo, AGORA).editar(
      "r1",
      { dataAcao: null },
      usuario("responsavel_setor", ["Solda"]),
    );
    expect(a.gravado[0].estado.estado).toBe("em_tratativa");

    const b = repoEscrita({ estado: "finalizada", dataAcao: "2026-10-21" });
    const e = await recusa(
      new ServicoEscrita(b.repo, AGORA).editar(
        "r1",
        { dataAcao: null },
        usuario("gestor"),
      ),
    );
    expect(e.message).toContain("Reabra");
  });

  it("trocar o setor de algo já assumido volta a Encaminhada ao setor", async () => {
    const { repo, gravado } = repoEscrita({ estado: "em_tratativa" });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { setorRespId: "s-log", motivoTroca: "Era problema de transporte." },
      usuario("gestor"),
    );
    expect(gravado[0].estado.estado).toBe("encaminhada");
    expect(gravado[0].transicao).toMatchObject({
      de: "em_tratativa",
      para: "encaminhada",
      motivo: "Era problema de transporte.",
    });
  });

  it("trocar o setor em Triagem não mexe no estado", async () => {
    const { repo, gravado } = repoEscrita({ estado: "triagem" });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { setorRespId: "s-log" },
      usuario("gestor"),
    );
    expect(gravado[0].estado.estado).toBe("triagem");
    expect(gravado[0].transicao).toBeNull();
  });
});

// ---------- Usuários com setores e marcas ----------

function repoUsuarios(existentes: UsuarioVisao[] = []) {
  const criados: Parameters<RepositorioUsuarios["criar"]>[0][] = [];
  const atualizados: Parameters<RepositorioUsuarios["atualizar"]>[0][] = [];
  const repo: RepositorioUsuarios = {
    async listar() {
      return existentes;
    },
    async obter(id) {
      return existentes.find((u) => u.id === id) ?? null;
    },
    async opcoes() {
      return { setores: [], marcas: [] };
    },
    async loginExiste(login) {
      return existentes.some((u) => u.login === login);
    },
    async contarExistentes(tipo, ids) {
      const ok = tipo === "setores" ? ["s-solda", "s-log"] : ["m-aisa"];
      return ids.filter((i) => ok.includes(i)).length;
    },
    async criar(a) {
      criados.push(a);
      return { id: "novo" };
    },
    async atualizar(a) {
      atualizados.push(a);
    },
  };
  return { repo, criados, atualizados };
}

const hash = async (s: string) => `hash(${s.length})`;
const SENHA = "uma-senha-bem-longa-1";

describe("usuários: setores e marcas no cadastro", () => {
  const ana: UsuarioVisao = {
    id: "u1",
    login: "ana",
    nome: "Ana",
    perfil: "responsavel_setor",
    ativo: true,
    telefone: "",
    setores: [{ id: "s-solda", nome: "Solda" }],
    marcas: [],
  };

  it("só o administrador mexe em usuário", async () => {
    const { repo, criados } = repoUsuarios();
    const s = new ServicoUsuarios(repo, hash);
    for (const p of ["gestor", "operacao", "responsavel_setor"] as const) {
      expect((await recusa(s.listar(usuario(p)))).status).toBe(403);
      expect(
        (
          await recusa(
            s.criar(usuario(p), {
              login: "x1x",
              nome: "X",
              perfil: "gestor",
              senha: SENHA,
            }),
          )
        ).status,
      ).toBe(403);
    }
    expect(criados).toEqual([]);
  });

  it("cria com lista de setores e de marcas; a senha vira hash e não vai para a auditoria", async () => {
    const { repo, criados } = repoUsuarios();
    await new ServicoUsuarios(repo, hash).criar(usuario("administrador"), {
      login: "bia",
      nome: "Bia",
      perfil: "responsavel_setor",
      senha: SENHA,
      setorIds: ["s-solda", "s-log"],
      marcaIds: ["m-aisa"],
    });
    expect(criados[0]).toMatchObject({
      login: "bia",
      setorIds: ["s-solda", "s-log"],
      marcaIds: ["m-aisa"],
      senhaHash: `hash(${SENHA.length})`,
    });
    expect(JSON.stringify(criados[0].auditoria)).not.toContain(SENHA);
  });

  it("responsável de setor sem setor é recusado; setor ou marca inexistente também", async () => {
    const { repo, criados } = repoUsuarios();
    const s = new ServicoUsuarios(repo, hash);
    const adm = usuario("administrador");
    const base = {
      login: "caio",
      nome: "Caio",
      perfil: "responsavel_setor" as const,
      senha: SENHA,
    };
    expect((await recusa(s.criar(adm, base))).message).toContain("setor");
    expect(
      (await recusa(s.criar(adm, { ...base, setorIds: ["nao-existe"] })))
        .message,
    ).toContain("Setor inexistente");
    expect(
      (
        await recusa(
          s.criar(adm, { ...base, setorIds: ["s-solda"], marcaIds: ["x"] }),
        )
      ).message,
    ).toContain("Marca inexistente");
    expect(criados).toEqual([]);
  });

  it("edita só o que mudou e troca as listas; trocar a senha encerra sessões", async () => {
    const { repo, atualizados } = repoUsuarios([ana]);
    const s = new ServicoUsuarios(repo, hash);
    const adm = usuario("administrador");
    const r = await s.editar(adm, "u1", {
      setorIds: ["s-log"],
      marcaIds: ["m-aisa"],
    });
    expect(r.alterou).toBe(true);
    expect(atualizados[0]).toMatchObject({
      setorIds: ["s-log"],
      marcaIds: ["m-aisa"],
      encerrarSessoes: false,
    });
    await s.editar(adm, "u1", { senha: SENHA });
    expect(atualizados[1].encerrarSessoes).toBe(true);
    expect(atualizados[1].setorIds).toBeUndefined();
    const nada = await s.editar(adm, "u1", { nome: "Ana" });
    expect(nada.alterou).toBe(false);
    expect(atualizados).toHaveLength(2);
  });

  it("quem administra não se desativa nem se rebaixa, e o login não muda", async () => {
    const eu: UsuarioVisao = {
      ...ana,
      id: "u-administrador",
      login: "administrador",
      perfil: "administrador",
      setores: [],
    };
    const { repo } = repoUsuarios([eu]);
    const s = new ServicoUsuarios(repo, hash);
    const adm = usuario("administrador");
    expect(
      (await recusa(s.editar(adm, "u-administrador", { ativo: false }))).status,
    ).toBe(400);
    expect(
      (await recusa(s.editar(adm, "u-administrador", { perfil: "gestor" })))
        .status,
    ).toBe(400);
    expect(
      (await recusa(s.editar(adm, "u-administrador", { login: "outro" })))
        .status,
    ).toBe(400);
    expect((await recusa(s.editar(adm, "nao-tem", { nome: "Z" }))).status).toBe(
      404,
    );
  });

  it("a entrada recusa campo desconhecido e lista torta", () => {
    expect(lerEntradaUsuario({ extra: 1 }, "editar").ok).toBe(false);
    expect(lerEntradaUsuario({ setorIds: "s1" }, "editar").ok).toBe(false);
    expect(lerEntradaUsuario({ setorIds: ["a b"] }, "editar").ok).toBe(false);
    expect(lerEntradaUsuario({ nome: "Ana" }, "criar").ok).toBe(false);
    expect(lerEntradaUsuario({}, "editar").ok).toBe(false);
    expect(
      lerEntradaUsuario(
        { login: "Ana.Souza", nome: "Ana", perfil: "gestor", senha: "x" },
        "criar",
      ),
    ).toMatchObject({ ok: true, entrada: { login: "ana.souza" } });
  });
});
