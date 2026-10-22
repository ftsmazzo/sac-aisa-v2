import { createHmac } from "node:crypto";
import type { Devolucao, Situacao } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import {
  type AuditoriaClickup,
  aplicarStatusExterno,
  assinaturaValida,
  chaveDoEvento,
  type DadosAnalise,
  type DadosCard,
  ErroWebhook,
  ESPERAS_MIN,
  type EventoGravado,
  montarCard,
  type RepositorioClickup,
  ServicoClickup,
  ServicoWebhookClickup,
  statusNovo,
} from "./clickup";

const AGORA = () => new Date("2026-10-22T15:00:00Z");
const TOKEN = "pk_000111222_TOKEN_DO_CLICKUP_ZZZZ";
const SEGREDO_WEBHOOK = "segredo-do-webhook-1234567890";

function dadosCard(extra: Partial<DadosCard> = {}): DadosCard {
  return {
    cardId: "card1",
    taskId: null,
    listaId: null,
    statusExterno: null,
    tentativas: 0,
    precisaSync: false,
    comentarios: [],
    reclamacao: {
      id: "r1",
      numero: 77,
      descricao: "Pé da mesa quebrou",
      setorRespId: "s-solda",
      setorNome: "Solda",
      marca: "AISA",
      canal: "Site",
      produto: "P1 Mesa",
      causa: "Solda soltando",
      pedido: "123",
      dataAbertura: "2026-10-20",
      situacao: "tratativa",
      devolucao: "NA",
      custoTotal: 0,
    },
    ...extra,
  };
}

class RepoFalso implements RepositorioClickup {
  card: DadosCard | null = dadosCard();
  criado: Parameters<RepositorioClickup["registrarCriado"]>[0] | null = null;
  falhas: Parameters<RepositorioClickup["registrarFalha"]>[0][] = [];
  eventos = new Map<string, EventoGravado>();
  porTask = new Map<
    string,
    { cardId: string; reclamacaoId: string | null; statusExterno?: string }
  >();
  marcados: Parameters<RepositorioClickup["marcarSync"]>[0][] = [];
  enviados: string[] = [];
  sincronizado: Parameters<RepositorioClickup["registrarSincronizado"]>[0][] =
    [];
  analise: DadosAnalise | null = null;
  chaves = new Map<string, string>();
  repeticoes = 0;
  rec = {
    numero: 77,
    dataAcao: null as string | null,
    devolucao: "NA" as Devolucao,
  };
  aplicado: Parameters<RepositorioClickup["aplicarStatus"]>[0][] = [];

  async carregarCard() {
    return this.card;
  }
  async registrarCriado(
    a: Parameters<RepositorioClickup["registrarCriado"]>[0],
  ) {
    this.criado = a;
  }
  async registrarFalha(a: Parameters<RepositorioClickup["registrarFalha"]>[0]) {
    this.falhas.push(a);
  }
  async pendentes() {
    return ["r1"];
  }
  async gravarEvento(e: Parameters<RepositorioClickup["gravarEvento"]>[0]) {
    const antes = e.chave ? this.chaves.get(e.chave) : undefined;
    if (antes) {
      this.repeticoes += 1;
      return { id: antes, duplicado: true };
    }
    const id = `e${this.eventos.size + 1}`;
    this.eventos.set(id, {
      id,
      taskId: e.taskId,
      tipo: e.tipo,
      payload: e.payload,
      processadoEm: null,
    });
    if (e.chave) this.chaves.set(e.chave, id);
    return { id, duplicado: false };
  }
  async marcarSync(a: Parameters<RepositorioClickup["marcarSync"]>[0]) {
    this.marcados.push(a);
  }
  async comentarioEnviado(id: string) {
    this.enviados.push(id);
  }
  async registrarSincronizado(
    a: Parameters<RepositorioClickup["registrarSincronizado"]>[0],
  ) {
    this.sincronizado.push(a);
  }
  async carregarAnalise() {
    return this.analise;
  }
  async fila() {
    return {
      itens: [],
      totais: { pendente: 0, erro: 0, esgotado: 0 },
    };
  }
  async reenviar() {
    return 1;
  }
  async obterEvento(id: string) {
    return this.eventos.get(id) ?? null;
  }
  async cardPorTaskId(t: string) {
    const c = this.porTask.get(t);
    return c ? { statusExterno: null, ...c } : null;
  }
  async reclamacaoParaStatus() {
    return this.rec;
  }
  async aplicarStatus(a: Parameters<RepositorioClickup["aplicarStatus"]>[0]) {
    this.aplicado.push(a);
    const e = this.eventos.get(a.eventoId);
    if (e) e.processadoEm = a.agora;
  }
}

function integr(
  token: string | null = TOKEN,
  listas: Record<string, string> = { "s-solda": "L-SOLDA" },
  config: Record<string, unknown> = { listaPadraoId: "L-PADRAO" },
) {
  return {
    segredo: async (
      _c: "clickup" | "shopee" | "mercadolivre" | "openrouter",
      nome: string,
    ) =>
      nome === "token"
        ? token
        : nome === "segredoWebhook"
          ? SEGREDO_WEBHOOK
          : null,
    config: async () => config,
    listasClickup: async () => listas,
  };
}

function http(status: number, corpo: unknown = {}) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    return new Response(JSON.stringify(corpo), { status });
  }) as typeof fetch;
  return { f, chamadas };
}

describe("card ao registrar", () => {
  it("cria o card na lista do setor responsável", async () => {
    const repo = new RepoFalso();
    const h = http(200, { id: "t-abc", status: { status: "to do" } });
    const s = new ServicoClickup(
      repo,
      integr(),
      h.f,
      AGORA,
      "https://sac.exemplo",
    );
    expect(await s.tentarCard("r1")).toBe("criado");
    expect(h.chamadas[0].url).toContain("/list/L-SOLDA/task");
    expect(repo.criado).toMatchObject({
      cardId: "card1",
      taskId: "t-abc",
      listaId: "L-SOLDA",
      statusExterno: "to do",
    });
  });

  it("setor sem lista cai na lista padrão", async () => {
    const repo = new RepoFalso();
    const h = http(200, { id: "t-1" });
    const s = new ServicoClickup(repo, integr(TOKEN, {}), h.f, AGORA);
    await s.tentarCard("r1");
    expect(h.chamadas[0].url).toContain("/list/L-PADRAO/task");
  });

  it("sem token nada quebra: não chama o ClickUp e o card segue pendente", async () => {
    const repo = new RepoFalso();
    const h = http(200);
    const s = new ServicoClickup(repo, integr(null), h.f, AGORA);
    expect(await s.tentarCard("r1")).toBe("sem_token");
    expect(h.chamadas).toHaveLength(0);
    expect(repo.falhas).toHaveLength(0);
    expect(repo.criado).toBeNull();
  });

  it("sem lista alguma, registra o erro sem contar tentativa", async () => {
    const repo = new RepoFalso();
    const s = new ServicoClickup(
      repo,
      integr(TOKEN, {}, {}),
      http(200).f,
      AGORA,
    );
    expect(await s.tentarCard("r1")).toBe("sem_lista");
    expect(repo.falhas[0]).toMatchObject({ contarTentativa: false });
    expect(repo.falhas[0].erro).toContain("lista");
  });

  it("falha do ClickUp registra o erro e agenda nova tentativa, sem lançar", async () => {
    const repo = new RepoFalso();
    const h = http(500, { err: `quebrou com ${TOKEN}` });
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.tentarCard("r1")).toBe("falhou");
    const f = repo.falhas[0];
    expect(f.contarTentativa).toBe(true);
    expect(f.erro).toContain("500");
    expect(f.erro).not.toContain(TOKEN);
    expect(f.proxima?.getTime()).toBe(
      AGORA().getTime() + ESPERAS_MIN[0] * 60_000,
    );
  });

  it("falha de rede também vira erro registrado", async () => {
    const repo = new RepoFalso();
    const f = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    const s = new ServicoClickup(repo, integr(), f, AGORA);
    expect(await s.tentarCard("r1")).toBe("falhou");
    expect(repo.falhas[0].erro).toBe("Sem resposta do ClickUp.");
  });

  it("a espera cresce a cada falha e, esgotada, a fila para", async () => {
    const repo = new RepoFalso();
    const s = new ServicoClickup(repo, integr(), http(503).f, AGORA);
    repo.card = dadosCard({ tentativas: 2 });
    await s.tentarCard("r1");
    expect(repo.falhas[0].proxima?.getTime()).toBe(
      AGORA().getTime() + ESPERAS_MIN[2] * 60_000,
    );
    repo.card = dadosCard({ tentativas: ESPERAS_MIN.length });
    await s.tentarCard("r1");
    expect(repo.falhas[1].proxima).toBeNull();
  });

  it("card que já tem task não é criado de novo", async () => {
    const repo = new RepoFalso();
    repo.card = dadosCard({ taskId: "t-ja" });
    const h = http(200);
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.tentarCard("r1")).toBe("criado");
    expect(h.chamadas).toHaveLength(0);
  });

  it("o card não leva dados pessoais do cliente", () => {
    const c = montarCard(dadosCard().reclamacao, "https://sac.exemplo/");
    expect(c.name).toBe("Reclamação #77 · Site · AISA");
    expect(c.markdown_description).toContain("Setor responsável: Solda");
    expect(c.markdown_description).toContain(
      "https://sac.exemplo/reclamacoes?ficha=r1",
    );
  });
});

describe("webhook do ClickUp", () => {
  const corpo = (o: unknown) => Buffer.from(JSON.stringify(o));
  const assinar = (b: Buffer, segredo = SEGREDO_WEBHOOK) =>
    createHmac("sha256", segredo).update(b).digest("hex");
  const evento = {
    event: "taskStatusUpdated",
    task_id: "t-abc",
    history_items: [{ field: "status", after: { status: "Complete" } }],
  };

  it("confere a assinatura sobre o corpo cru", () => {
    const b = corpo(evento);
    expect(assinaturaValida(b, SEGREDO_WEBHOOK, assinar(b))).toBe(true);
    expect(assinaturaValida(b, SEGREDO_WEBHOOK, assinar(b, "outro"))).toBe(
      false,
    );
    expect(assinaturaValida(b, SEGREDO_WEBHOOK, undefined)).toBe(false);
    expect(assinaturaValida(b, SEGREDO_WEBHOOK, "nao-e-hex")).toBe(false);
    const adulterado = corpo({ ...evento, task_id: "t-outro" });
    expect(assinaturaValida(adulterado, SEGREDO_WEBHOOK, assinar(b))).toBe(
      false,
    );
  });

  it("assinatura inválida: 401 e nada é gravado", async () => {
    const repo = new RepoFalso();
    const w = new ServicoWebhookClickup(repo, integr(), AGORA);
    const b = corpo(evento);
    await expect(w.receber(b, "0".repeat(64))).rejects.toMatchObject({
      status: 401,
    });
    await expect(w.receber(b, undefined)).rejects.toBeInstanceOf(ErroWebhook);
    await expect(w.receber(undefined, assinar(b))).rejects.toMatchObject({
      status: 401,
    });
    expect(repo.eventos.size).toBe(0);
  });

  it("sem segredo de webhook configurado, nada é aceito", async () => {
    const repo = new RepoFalso();
    const sem = { ...integr(), segredo: async () => null };
    const w = new ServicoWebhookClickup(repo, sem, AGORA);
    const b = corpo(evento);
    await expect(w.receber(b, assinar(b))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("assinatura válida grava o evento; corpo sem task_id é 400", async () => {
    const repo = new RepoFalso();
    const w = new ServicoWebhookClickup(repo, integr(), AGORA);
    const b = corpo(evento);
    const { id } = await w.receber(b, assinar(b));
    expect(repo.eventos.get(id)).toMatchObject({
      taskId: "t-abc",
      tipo: "taskStatusUpdated",
    });
    const ruim = corpo({ event: "x" });
    await expect(w.receber(ruim, assinar(ruim))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("extrai o status novo nos dois formatos do ClickUp", () => {
    expect(statusNovo(evento)).toBe("Complete");
    expect(statusNovo({ history_items: [{ after: "open" }] })).toBe("open");
    expect(statusNovo({})).toBeNull();
  });

  async function receberEProcessar(
    repo: RepoFalso,
    mapa: Record<string, string>,
  ) {
    const w = new ServicoWebhookClickup(
      repo,
      integr(TOKEN, {}, { mapaStatus: mapa }),
      AGORA,
    );
    const b = corpo(evento);
    const { id } = await w.receber(b, assinar(b));
    await w.processar(id);
    return repo.aplicado[0];
  }

  it("status mapeado para resolvida atualiza a situação e audita", async () => {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", { cardId: "card1", reclamacaoId: "r1" });
    const a = await receberEProcessar(repo, { complete: "resolvida" });
    expect(a.statusExterno).toBe("Complete");
    expect(a.reclamacao).toEqual({
      id: "r1",
      dataAcao: "2026-10-22",
      situacao: "resolvida" satisfies Situacao,
    });
    expect((a.auditoria as AuditoriaClickup).acao).toBe("clickup.status");
    expect(repo.eventos.get("e1")?.processadoEm).not.toBeNull();
  });

  it("status sem mapa só registra o status externo", async () => {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", { cardId: "card1", reclamacaoId: "r1" });
    const a = await receberEProcessar(repo, {});
    expect(a.statusExterno).toBe("Complete");
    expect(a.reclamacao).toBeNull();
  });

  it("evento de card desconhecido é marcado como processado sem mexer em nada", async () => {
    const repo = new RepoFalso();
    const a = await receberEProcessar(repo, { complete: "resolvida" });
    expect(a).toMatchObject({
      cardId: null,
      reclamacao: null,
      auditoria: null,
    });
  });

  it("processar duas vezes o mesmo evento não repete", async () => {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", { cardId: "card1", reclamacaoId: "r1" });
    const w = new ServicoWebhookClickup(
      repo,
      integr(TOKEN, {}, { mapaStatus: { complete: "resolvida" } }),
      AGORA,
    );
    const b = corpo(evento);
    const { id } = await w.receber(b, assinar(b));
    await w.processar(id);
    await w.processar(id);
    expect(repo.aplicado).toHaveLength(1);
  });
});

describe("aplicarStatusExterno", () => {
  const hoje = "2026-10-22";

  it("resolver põe a data de ação de hoje", () => {
    expect(
      aplicarStatusExterno(
        { dataAcao: null, devolucao: "NA" },
        "resolvida",
        hoje,
      ),
    ).toMatchObject({ mudou: true, dataAcao: hoje, situacao: "resolvida" });
  });

  it("não resolve enquanto o produto não voltou", () => {
    const m = aplicarStatusExterno(
      { dataAcao: null, devolucao: "AGUARDANDO" },
      "resolvida",
      hoje,
    );
    expect(m).toMatchObject({ mudou: false, situacao: "aguardando" });
    expect(m.motivo).toBeDefined();
  });

  it("reabrir limpa a data de ação", () => {
    expect(
      aplicarStatusExterno(
        { dataAcao: "2026-10-01", devolucao: "RECEBIDO" },
        "tratativa",
        hoje,
      ),
    ).toMatchObject({ mudou: true, dataAcao: null, situacao: "tratativa" });
  });

  it("já resolvida e resolvida de novo: nada muda", () => {
    expect(
      aplicarStatusExterno(
        { dataAcao: "2026-10-01", devolucao: "NA" },
        "resolvida",
        hoje,
      ).mudou,
    ).toBe(false);
  });
});

describe("atualização do card quando o SAC muda", () => {
  const MAPA = {
    "to do": "tratativa",
    "em espera": "aguardando",
    complete: "resolvida",
  };
  const comTask = (
    extra: Partial<DadosCard> = {},
    rec: Partial<DadosCard["reclamacao"]> = {},
  ) =>
    dadosCard({
      taskId: "t-1",
      listaId: "L-SOLDA",
      precisaSync: true,
      statusExterno: "to do",
      ...extra,
      reclamacao: { ...dadosCard().reclamacao, ...rec },
    });
  const montar = (
    repo: RepoFalso,
    h: ReturnType<typeof http>,
    config: Record<string, unknown> = { mapaStatus: MAPA },
    token: string | null = TOKEN,
  ) =>
    new ServicoClickup(
      repo,
      integr(token, { "s-solda": "L-SOLDA" }, config),
      h.f,
      AGORA,
      "https://sac.exemplo",
    );
  const corpoEnviado = (h: ReturnType<typeof http>, i = 0) =>
    JSON.parse(String(h.chamadas[i].init?.body));

  it("situação nova vira o status do card pelo mapa invertido", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({}, { situacao: "resolvida" });
    const h = http(200, { id: "t-1", status: { status: "complete" } });
    expect(await montar(repo, h).sincronizar("r1")).toBe("sincronizado");
    expect(h.chamadas).toHaveLength(1);
    expect(h.chamadas[0].url).toBe("https://api.clickup.com/api/v2/task/t-1");
    expect(h.chamadas[0].init?.method).toBe("PUT");
    expect(corpoEnviado(h)).toMatchObject({
      status: "complete",
      name: "Reclamação #77 · Site · AISA",
      priority: 4,
    });
    expect(corpoEnviado(h).markdown_content).toContain("resolvida");
    expect(repo.sincronizado[0]).toMatchObject({
      cardId: "card1",
      listaId: "L-SOLDA",
      statusExterno: "complete",
    });
  });

  it("não troca o status se o card já está num status da mesma situação", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ statusExterno: "Em Andamento" });
    const h = http(200, { id: "t-1" });
    await montar(repo, h, {
      mapaStatus: { ...MAPA, "em andamento": "tratativa" },
    }).sincronizar("r1");
    expect(corpoEnviado(h)).not.toHaveProperty("status");
  });

  it("título, descrição, prazo e prioridade seguem a reclamação", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({}, { dataAbertura: "2026-10-10" });
    const h = http(200, { id: "t-1" });
    await montar(repo, h).sincronizar("r1");
    // Meta de 2 dias a partir de 10/10 e hoje é 22/10: prazo vencido, urgente.
    expect(corpoEnviado(h)).toMatchObject({
      due_date: Date.UTC(2026, 9, 12),
      due_date_time: false,
      priority: 1,
    });
    repo.card = comTask({}, { custoTotal: 800 });
    const h2 = http(200, { id: "t-1" });
    await montar(repo, h2).sincronizar("r1");
    expect(corpoEnviado(h2).priority).toBe(2);
  });

  it("setor novo move o card para a lista do setor e só então atualiza", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ listaId: "L-ANTIGA" });
    const h = http(200, { id: "t-1" });
    const r = await montar(repo, h, {
      mapaStatus: MAPA,
      workspaceId: "9001",
    }).sincronizar("r1");
    expect(r).toBe("sincronizado");
    expect(h.chamadas[0].url).toBe(
      "https://api.clickup.com/api/v3/workspaces/9001/tasks/t-1/home_list/L-SOLDA",
    );
    expect(h.chamadas[1].url).toContain("/v2/task/t-1");
    expect(repo.sincronizado[0].listaId).toBe("L-SOLDA");
  });

  it("sem o ID do workspace não move, avisa e não gasta tentativa", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ listaId: "L-ANTIGA" });
    const h = http(200, { id: "t-1" });
    expect(await montar(repo, h).sincronizar("r1")).toBe("sem_workspace");
    expect(h.chamadas.every((c) => !c.url.includes("/v3/"))).toBe(true);
    expect(repo.falhas[0]).toMatchObject({ contarTentativa: false });
    expect(repo.falhas[0].erro).toContain("workspace");
    expect(repo.sincronizado).toHaveLength(0);
  });

  it("comentário pendente sai no card, na ordem, e é marcado como enviado", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({
      precisaSync: false,
      comentarios: [
        { id: "c1", texto: "primeiro" },
        { id: "c2", texto: "segundo" },
      ],
    });
    const h = http(200, { id: "x" });
    await montar(repo, h).sincronizar("r1");
    expect(h.chamadas.map((c) => c.url)).toEqual([
      "https://api.clickup.com/api/v2/task/t-1/comment",
      "https://api.clickup.com/api/v2/task/t-1/comment",
    ]);
    expect(corpoEnviado(h, 0).comment_text).toBe("primeiro");
    expect(corpoEnviado(h, 1).comment_text).toBe("segundo");
    expect(repo.enviados).toEqual(["c1", "c2"]);
  });

  it("nada a enviar: não chama o ClickUp", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ precisaSync: false });
    const h = http(200);
    expect(await montar(repo, h).sincronizar("r1")).toBe("nada");
    expect(h.chamadas).toHaveLength(0);
  });

  it("análise registrada: comenta a decisão de retorno e a devolução recebida, com o link", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ precisaSync: false });
    repo.analise = {
      reclamacaoId: "r1",
      numero: 77,
      setorNome: "Solda",
      produtoPrecisaVoltar: true,
      produtoRecebidoEm: "2026-10-21",
      conclusao: "Solda fria no pé.",
      resultado: "Trocar a peça",
    };
    const h = http(200, { id: "t-1" });
    await montar(repo, h).aposAnalise("r1", {
      id: "a1",
      criando: true,
      devolucaoRecebida: true,
    });
    const [analise, devolucao] = repo.marcados[0].comentarios;
    expect(analise).toContain("Análise do setor Solda registrada");
    expect(analise).toContain("Produto precisa voltar; recebido em 2026-10-21");
    expect(analise).toContain("Solda fria no pé.");
    expect(analise).toContain("https://sac.exemplo/reclamacoes?ficha=r1");
    expect(devolucao).toContain("Devolução recebida");
  });

  it("análise editada diz que foi alterada; sem devolução, um comentário só", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ precisaSync: false });
    repo.analise = {
      reclamacaoId: "r1",
      numero: 77,
      setorNome: "Solda",
      produtoPrecisaVoltar: false,
      produtoRecebidoEm: null,
      conclusao: "",
      resultado: "",
    };
    await montar(repo, http(200)).aposAnalise("r1", {
      id: "a1",
      criando: false,
      devolucaoRecebida: false,
    });
    expect(repo.marcados[0].comentarios).toHaveLength(1);
    expect(repo.marcados[0].comentarios[0]).toContain("alterada");
    expect(repo.marcados[0].comentarios[0]).toContain("não precisa voltar");
  });

  it("edição da reclamação: atualiza o card; devolução recebida também comenta", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ precisaSync: false });
    const s = montar(repo, http(200));
    await s.aposEdicao("r1", { numero: 77, devolucaoRecebida: false });
    await s.aposEdicao("r1", { numero: 77, devolucaoRecebida: true });
    expect(repo.marcados[0].comentarios).toEqual([]);
    expect(repo.marcados[1].comentarios[0]).toContain("Devolução recebida");
  });

  it("falha do ClickUp registra o erro sem o token e agenda nova tentativa", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ tentativas: 1 });
    const h = http(500, { err: `caiu com ${TOKEN}` });
    expect(await montar(repo, h).sincronizar("r1")).toBe("falhou");
    expect(repo.falhas[0].contarTentativa).toBe(true);
    expect(repo.falhas[0].erro).toContain("500");
    expect(repo.falhas[0].erro).not.toContain(TOKEN);
    expect(repo.falhas[0].proxima?.getTime()).toBe(
      AGORA().getTime() + ESPERAS_MIN[1] * 60_000,
    );
    expect(repo.sincronizado).toHaveLength(0);
  });

  it("esgotadas as tentativas, a fila para", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({ tentativas: ESPERAS_MIN.length });
    await montar(repo, http(503)).sincronizar("r1");
    expect(repo.falhas[0].proxima).toBeNull();
  });

  it("falha de rede no comentário não perde o que já saiu", async () => {
    const repo = new RepoFalso();
    repo.card = comTask({
      precisaSync: false,
      comentarios: [
        { id: "c1", texto: "um" },
        { id: "c2", texto: "dois" },
      ],
    });
    let n = 0;
    const f = (async () => {
      n += 1;
      if (n === 2) throw new Error("ECONNRESET");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const s = new ServicoClickup(repo, integr(), f, AGORA);
    expect(await s.sincronizar("r1")).toBe("falhou");
    expect(repo.enviados).toEqual(["c1"]);
    expect(repo.falhas[0].erro).toBe("Sem resposta do ClickUp.");
  });

  it("sem token nada quebra e o card segue pendente", async () => {
    const repo = new RepoFalso();
    repo.card = comTask();
    const h = http(200);
    const s = montar(repo, h, { mapaStatus: MAPA }, null);
    expect(await s.sincronizar("r1")).toBe("sem_token");
    expect(h.chamadas).toHaveLength(0);
    expect(repo.falhas).toHaveLength(0);
  });

  it("avisar a mudança nunca lança, nem se o banco falhar", async () => {
    const repo = new RepoFalso();
    repo.marcarSync = async () => {
      throw new Error("banco fora");
    };
    await expect(
      montar(repo, http(200)).reclamacaoMudou("r1"),
    ).resolves.toBeUndefined();
  });

  it("mudança vinda do ClickUp não volta para o ClickUp (sem laço)", async () => {
    const repo = new RepoFalso();
    repo.card = comTask();
    const h = http(200);
    await montar(repo, h).reclamacaoMudou("r1", { origem: "clickup" });
    expect(repo.marcados).toHaveLength(0);
    expect(h.chamadas).toHaveLength(0);
  });

  it("o webhook que altera a reclamação não marca o card para enviar de volta", async () => {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", { cardId: "card1", reclamacaoId: "r1" });
    const w = new ServicoWebhookClickup(
      repo,
      integr(TOKEN, {}, { mapaStatus: MAPA }),
      AGORA,
    );
    const b = Buffer.from(
      JSON.stringify({
        event: "taskStatusUpdated",
        task_id: "t-abc",
        webhook_id: "w1",
        history_items: [{ id: "h1", after: { status: "Complete" } }],
      }),
    );
    const { id } = await w.receber(
      b,
      createHmac("sha256", SEGREDO_WEBHOOK).update(b).digest("hex"),
    );
    await w.processar(id);
    expect(repo.aplicado[0].reclamacao).toMatchObject({
      situacao: "resolvida",
    });
    expect(repo.marcados).toHaveLength(0);
  });

  it("o eco do status que o SAC mandou ao card é ignorado", async () => {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", {
      cardId: "card1",
      reclamacaoId: "r1",
      statusExterno: "complete",
    });
    const w = new ServicoWebhookClickup(
      repo,
      integr(TOKEN, {}, { mapaStatus: MAPA }),
      AGORA,
    );
    const b = Buffer.from(
      JSON.stringify({
        event: "taskStatusUpdated",
        task_id: "t-abc",
        history_items: [{ id: "h1", after: { status: "Complete" } }],
      }),
    );
    const { id } = await w.receber(
      b,
      createHmac("sha256", SEGREDO_WEBHOOK).update(b).digest("hex"),
    );
    await w.processar(id);
    expect(repo.aplicado[0].reclamacao).toBeNull();
    expect(repo.eventos.get(id)?.processadoEm).not.toBeNull();
  });
});

describe("idempotência do webhook", () => {
  const evento = (hist: string) =>
    Buffer.from(
      JSON.stringify({
        event: "taskStatusUpdated",
        task_id: "t-abc",
        webhook_id: "wh-1",
        history_items: [{ id: hist, after: { status: "Complete" } }],
      }),
    );
  const assinar = (b: Buffer) =>
    createHmac("sha256", SEGREDO_WEBHOOK).update(b).digest("hex");

  it("a chave é webhook_id:history_item_id; sem um dos dois, não há chave", () => {
    expect(chaveDoEvento(JSON.parse(String(evento("h9"))))).toBe("wh-1:h9");
    expect(chaveDoEvento({ webhook_id: "w", history_items: [] })).toBeNull();
    expect(chaveDoEvento({ history_items: [{ id: "h" }] })).toBeNull();
    expect(chaveDoEvento(null)).toBeNull();
  });

  it("entrega repetida é marcada como duplicada e não é reprocessada", async () => {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", { cardId: "card1", reclamacaoId: "r1" });
    const w = new ServicoWebhookClickup(
      repo,
      integr(TOKEN, {}, { mapaStatus: { complete: "resolvida" } }),
      AGORA,
    );
    const b = evento("h1");
    const a = await w.receber(b, assinar(b));
    expect(a.duplicado).toBe(false);
    await w.processar(a.id);

    const deNovo = await w.receber(b, assinar(b));
    expect(deNovo).toEqual({ id: a.id, duplicado: true });
    expect(repo.eventos.size).toBe(1);
    expect(repo.repeticoes).toBe(1);
    // Mesmo que alguém chame processar de novo, o evento já está marcado.
    await w.processar(deNovo.id);
    expect(repo.aplicado).toHaveLength(1);
  });

  it("outro item de histórico é outro evento", async () => {
    const repo = new RepoFalso();
    const w = new ServicoWebhookClickup(repo, integr(), AGORA);
    const x = evento("h1");
    const y = evento("h2");
    await w.receber(x, assinar(x));
    const r = await w.receber(y, assinar(y));
    expect(r.duplicado).toBe(false);
    expect(repo.eventos.size).toBe(2);
  });
});
