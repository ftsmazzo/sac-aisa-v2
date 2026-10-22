import { createHmac } from "node:crypto";
import type { Devolucao, Estado, Situacao } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import {
  type AuditoriaClickup,
  aplicarStatusExterno,
  assinaturaValida,
  type DadosCard,
  decidirStatusExterno,
  ErroWebhook,
  ESPERA_STATUS_MIN,
  ESPERAS_MIN,
  type EventoGravado,
  estadoDoStatus,
  MAPA_ESTADOS_PADRAO,
  mapaEstadosEfetivo,
  montarCard,
  type RepositorioClickup,
  ServicoClickup,
  ServicoWebhookClickup,
  type SincroniaCard,
  statusDoEstado,
  statusNovo,
} from "./clickup";

const AGORA = () => new Date("2026-10-22T15:00:00Z");
const TOKEN = "pk_000111222_TOKEN_DO_CLICKUP_ZZZZ";
const SEGREDO_WEBHOOK = "segredo-do-webhook-1234567890";

function dadosCard(extra: Partial<DadosCard> = {}): DadosCard {
  return {
    cardId: "card1",
    taskId: null,
    tentativas: 0,
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
    },
    ...extra,
  };
}

class RepoFalso implements RepositorioClickup {
  card: DadosCard | null = dadosCard();
  criado: Parameters<RepositorioClickup["registrarCriado"]>[0] | null = null;
  falhas: Parameters<RepositorioClickup["registrarFalha"]>[0][] = [];
  eventos = new Map<string, EventoGravado>();
  porTask = new Map<string, { cardId: string; reclamacaoId: string | null }>();
  rec = {
    numero: 77,
    estado: "em_tratativa" as Estado,
    dataAbertura: "2026-10-20",
    dataAcao: null as string | null,
    devolucao: "NA" as Devolucao,
    temSetor: true,
  };
  aplicado: Parameters<RepositorioClickup["aplicarStatus"]>[0][] = [];
  sincronia: SincroniaCard | null = null;
  sincronizados: Parameters<
    RepositorioClickup["registrarStatusSincronizado"]
  >[0][] = [];
  falhasStatus: Parameters<RepositorioClickup["registrarFalhaStatus"]>[0][] =
    [];

  async statusPendentes() {
    return [];
  }
  async carregarSincronia() {
    return this.sincronia;
  }
  async registrarStatusSincronizado(
    a: Parameters<RepositorioClickup["registrarStatusSincronizado"]>[0],
  ) {
    this.sincronizados.push(a);
  }
  async registrarFalhaStatus(
    a: Parameters<RepositorioClickup["registrarFalhaStatus"]>[0],
  ) {
    this.falhasStatus.push(a);
  }

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
  async gravarEvento(e: { taskId: string; tipo: string; payload: unknown }) {
    const id = `e${this.eventos.size + 1}`;
    this.eventos.set(id, { id, ...e, processadoEm: null });
    return id;
  }
  async obterEvento(id: string) {
    return this.eventos.get(id) ?? null;
  }
  async cardPorTaskId(t: string) {
    return this.porTask.get(t) ?? null;
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

  const eventoCom = (status: string) => ({
    event: "taskStatusUpdated",
    task_id: "t-abc",
    history_items: [{ field: "status", after: { status } }],
  });

  async function receberEProcessar(
    repo: RepoFalso,
    ev: unknown = evento,
    config: Record<string, unknown> = {},
    corrigir?: (id: string) => Promise<unknown>,
  ) {
    const w = new ServicoWebhookClickup(
      repo,
      integr(TOKEN, {}, config),
      AGORA,
      corrigir,
    );
    const b = corpo(ev);
    const { id } = await w.receber(b, assinar(b));
    await w.processar(id);
    return repo.aplicado[0];
  }

  function comCard(estado: Estado, extra: Partial<RepoFalso["rec"]> = {}) {
    const repo = new RepoFalso();
    repo.porTask.set("t-abc", { cardId: "card1", reclamacaoId: "r1" });
    repo.rec = { ...repo.rec, estado, ...extra };
    return repo;
  }

  it('"Complete" no ClickUp é Resolvida no setor técnico, nunca Finalizada', async () => {
    const repo = comCard("em_tratativa");
    const a = await receberEProcessar(repo);
    expect(a.statusExterno).toBe("Complete");
    expect(a.reclamacao).toEqual({
      id: "r1",
      de: "em_tratativa",
      passos: ["resolvida_setor"],
      dataAcao: "2026-10-22",
      situacao: "resolvida" satisfies Situacao,
    });
    expect(a.corrigirCard).toBe(false);
    expect((a.auditoria as AuditoriaClickup).acao).toBe("clickup.status");
    expect(repo.eventos.get("e1")?.processadoEm).not.toBeNull();
  });

  it("o setor anda de Encaminhada até Resolvida passando pelos passos, cada um com as regras", async () => {
    const repo = comCard("encaminhada");
    const a = await receberEProcessar(repo);
    expect(a.reclamacao?.passos).toEqual([
      "recebida",
      "em_tratativa",
      "resolvida_setor",
    ]);
  });

  it("mover o card para um estado do SAC é recusado e o card volta", async () => {
    const repo = comCard("em_tratativa");
    const corrigidos: string[] = [];
    const a = await receberEProcessar(
      repo,
      eventoCom("Finalizada no SAC"),
      {},
      async (id) => {
        corrigidos.push(id);
      },
    );
    expect(a.reclamacao).toBeNull();
    expect(a.corrigirCard).toBe(true);
    expect(corrigidos).toEqual(["r1"]);
    const aud = a.auditoria as AuditoriaClickup;
    expect(aud.detalhe).toContain("recusado");
    expect(aud.extra).toMatchObject({ recusado: true, estado: "em_tratativa" });
  });

  it("card movido quando a reclamação ainda é do SAC volta ao status certo", async () => {
    for (const estado of ["triagem", "aguardando_cliente"] as const) {
      const repo = comCard(estado);
      const a = await receberEProcessar(repo, eventoCom("Em tratativa"));
      expect(a.reclamacao).toBeNull();
      expect(a.corrigirCard).toBe(true);
    }
  });

  it("produto ainda não recebido: Em tratativa pelo ClickUp é recusado", async () => {
    const repo = comCard("recebida", { devolucao: "AGUARDANDO" });
    const a = await receberEProcessar(repo, eventoCom("Em tratativa"));
    expect(a.reclamacao).toBeNull();
    expect(a.corrigirCard).toBe(true);
    expect((a.auditoria as AuditoriaClickup).detalhe).toContain(
      "produto ainda não foi recebido",
    );
  });

  it("o eco do status que o próprio sistema pôs não muda nada nem gera aviso", async () => {
    const repo = comCard("recebida");
    const a = await receberEProcessar(repo, eventoCom("recebida pelo setor"));
    expect(a.reclamacao).toBeNull();
    expect(a.auditoria).toBeNull();
    expect(a.corrigirCard).toBe(false);
  });

  it("status que o sistema não conhece só registra o status externo", async () => {
    const repo = comCard("em_tratativa");
    const a = await receberEProcessar(repo, eventoCom("Revisão do chefe"));
    expect(a.statusExterno).toBe("Revisão do chefe");
    expect(a.reclamacao).toBeNull();
    expect(a.corrigirCard).toBe(false);
  });

  it("o mapa configurado vale: um status próprio leva ao estado escolhido", async () => {
    const repo = comCard("recebida");
    const a = await receberEProcessar(repo, eventoCom("Mão na massa"), {
      mapaEstados: { em_tratativa: "Mão na massa" },
    });
    expect(a.reclamacao?.passos).toEqual(["em_tratativa"]);
  });

  it("evento de card desconhecido é marcado como processado sem mexer em nada", async () => {
    const repo = new RepoFalso();
    const a = await receberEProcessar(repo);
    expect(a).toMatchObject({
      cardId: null,
      reclamacao: null,
      auditoria: null,
    });
  });

  it("processar duas vezes o mesmo evento não repete", async () => {
    const repo = comCard("em_tratativa");
    const w = new ServicoWebhookClickup(repo, integr(), AGORA);
    const b = corpo(evento);
    const { id } = await w.receber(b, assinar(b));
    await w.processar(id);
    await w.processar(id);
    expect(repo.aplicado).toHaveLength(1);
  });
});

describe("mapa de estados do ClickUp, nos dois sentidos", () => {
  it("o padrão cobre os sete estados com nomes diferentes", () => {
    const nomes = Object.values(MAPA_ESTADOS_PADRAO);
    expect(nomes).toHaveLength(7);
    expect(new Set(nomes.map((n) => n.toLowerCase())).size).toBe(7);
  });

  it("estado → status e status → estado se desfazem, sem ligar para caixa", () => {
    const mapa = mapaEstadosEfetivo({});
    for (const [estado, status] of Object.entries(mapa)) {
      expect(statusDoEstado(estado as Estado, mapa)).toBe(status);
      expect(estadoDoStatus(status.toUpperCase(), mapa)).toBe(estado);
      expect(estadoDoStatus(`  ${status} `, mapa)).toBe(estado);
    }
  });

  it("a troca do administrador vale por cima do padrão, e vazio volta ao padrão", () => {
    const mapa = mapaEstadosEfetivo({
      mapaEstados: { recebida: "Em análise", triagem: "  " },
    });
    expect(mapa.recebida).toBe("Em análise");
    expect(mapa.triagem).toBe(MAPA_ESTADOS_PADRAO.triagem);
    expect(estadoDoStatus("em análise", mapa)).toBe("recebida");
  });

  it("nomes que o ClickUp já traz: Complete e Closed são do setor técnico", () => {
    const mapa = mapaEstadosEfetivo({});
    expect(estadoDoStatus("Complete", mapa)).toBe("resolvida_setor");
    expect(estadoDoStatus("closed", mapa)).toBe("resolvida_setor");
    expect(estadoDoStatus("coisa nenhuma", mapa)).toBeNull();
  });

  it("o mapa configurado ganha do apelido", () => {
    const mapa = mapaEstadosEfetivo({
      mapaEstados: { finalizada: "Complete" },
    });
    expect(estadoDoStatus("complete", mapa)).toBe("finalizada");
  });

  it("config torta (não objeto) cai no padrão", () => {
    expect(mapaEstadosEfetivo({ mapaEstados: "x" })).toEqual(
      MAPA_ESTADOS_PADRAO,
    );
  });
});

describe("decidirStatusExterno", () => {
  const base = { devolucao: "NA" as Devolucao, temSetor: true };

  it("só vale para os estados do setor, para a frente", () => {
    expect(
      decidirStatusExterno({ ...base, estado: "encaminhada" }, "recebida"),
    ).toEqual({ tipo: "aplicar", passos: ["recebida"] });
    expect(
      decidirStatusExterno({ ...base, estado: "recebida" }, "em_tratativa"),
    ).toEqual({ tipo: "aplicar", passos: ["em_tratativa"] });
    expect(
      decidirStatusExterno(
        { ...base, estado: "em_tratativa" },
        "resolvida_setor",
      ),
    ).toEqual({ tipo: "aplicar", passos: ["resolvida_setor"] });
  });

  it("estado do SAC, ou voltar atrás, é recusado", () => {
    for (const alvo of [
      "triagem",
      "aguardando_cliente",
      "encaminhada",
      "finalizada",
    ] as const) {
      expect(
        decidirStatusExterno({ ...base, estado: "em_tratativa" }, alvo).tipo,
      ).toBe("reverter");
    }
    expect(
      decidirStatusExterno({ ...base, estado: "em_tratativa" }, "recebida")
        .tipo,
    ).toBe("reverter");
    expect(
      decidirStatusExterno(
        { ...base, estado: "resolvida_setor" },
        "em_tratativa",
      ).tipo,
    ).toBe("reverter");
  });

  it("antes de encaminhar ou depois de finalizar, o setor não mexe", () => {
    for (const estado of [
      "triagem",
      "aguardando_cliente",
      "finalizada",
    ] as const) {
      expect(
        decidirStatusExterno({ ...base, estado }, "em_tratativa").tipo,
      ).toBe("reverter");
    }
  });

  it("o mesmo estado, ou status desconhecido, não faz nada", () => {
    expect(
      decidirStatusExterno({ ...base, estado: "recebida" }, "recebida"),
    ).toEqual({ tipo: "ignorar" });
    expect(decidirStatusExterno({ ...base, estado: "recebida" }, null)).toEqual(
      { tipo: "ignorar" },
    );
  });
});

describe("status do card acompanha o estado", () => {
  const sinc = (extra: Partial<SincroniaCard> = {}): SincroniaCard => ({
    cardId: "card1",
    taskId: "t-abc",
    estado: "recebida",
    statusExterno: "encaminhada ao setor",
    statusPendente: true,
    ...extra,
  });

  it("manda o status do estado atual para a task e marca em dia", async () => {
    const repo = new RepoFalso();
    repo.sincronia = sinc();
    const h = http(200);
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.sincronizarEstado("r1")).toBe("atualizado");
    expect(h.chamadas[0].url).toBe("https://api.clickup.com/api/v2/task/t-abc");
    expect(h.chamadas[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(h.chamadas[0].init?.body))).toEqual({
      status: "recebida pelo setor",
    });
    expect(repo.sincronizados[0]).toMatchObject({
      cardId: "card1",
      statusExterno: "recebida pelo setor",
    });
  });

  it("usa o mapa que o administrador configurou", async () => {
    const repo = new RepoFalso();
    repo.sincronia = sinc({ estado: "finalizada" });
    const h = http(200);
    const s = new ServicoClickup(
      repo,
      integr(TOKEN, {}, { mapaEstados: { finalizada: "Fechada pelo SAC" } }),
      h.f,
      AGORA,
    );
    await s.sincronizarEstado("r1");
    expect(JSON.parse(String(h.chamadas[0].init?.body))).toEqual({
      status: "Fechada pelo SAC",
    });
  });

  it("card que já mostra o status certo não gasta chamada", async () => {
    const repo = new RepoFalso();
    repo.sincronia = sinc({ statusExterno: "Recebida pelo Setor" });
    const h = http(200);
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.sincronizarEstado("r1")).toBe("em_dia");
    expect(h.chamadas).toHaveLength(0);
    expect(repo.sincronizados).toHaveLength(1);
  });

  it("sem pendência, sem task ou sem token, não chama o ClickUp", async () => {
    const h = http(200);
    const repo = new RepoFalso();
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.sincronizarEstado("r1")).toBe("sem_card");
    repo.sincronia = sinc({ statusPendente: false });
    expect(await s.sincronizarEstado("r1")).toBe("sem_pendencia");
    repo.sincronia = sinc({ taskId: null });
    expect(await s.sincronizarEstado("r1")).toBe("sem_task");
    repo.sincronia = sinc();
    const semToken = new ServicoClickup(repo, integr(null), h.f, AGORA);
    expect(await semToken.sincronizarEstado("r1")).toBe("sem_token");
    expect(h.chamadas).toHaveLength(0);
  });

  it("o ClickUp recusar o nome do status vira erro no card, sem lançar e sem vazar o token", async () => {
    const repo = new RepoFalso();
    repo.sincronia = sinc();
    const h = http(400, { err: `Status not found ${TOKEN}` });
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.sincronizarEstado("r1")).toBe("falhou");
    const f = repo.falhasStatus[0];
    expect(f.erro).toContain("recebida pelo setor");
    expect(f.erro).not.toContain(TOKEN);
    expect(f.proxima.getTime()).toBe(
      AGORA().getTime() + ESPERA_STATUS_MIN * 60_000,
    );
    expect(repo.sincronizados).toHaveLength(0);
  });

  it("falha de rede também vira erro e nova tentativa", async () => {
    const repo = new RepoFalso();
    repo.sincronia = sinc();
    const f = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    const s = new ServicoClickup(repo, integr(), f, AGORA);
    expect(await s.sincronizarEstado("r1")).toBe("falhou");
    expect(repo.falhasStatus[0].erro).toContain("Sem resposta");
  });

  it("recém-criado, o card recebe logo o status do estado atual", async () => {
    const repo = new RepoFalso();
    repo.sincronia = sinc({ estado: "triagem", statusExterno: "to do" });
    const h = http(200, { id: "t-abc", status: { status: "to do" } });
    const s = new ServicoClickup(repo, integr(), h.f, AGORA);
    expect(await s.tentarCard("r1")).toBe("criado");
    expect(h.chamadas).toHaveLength(2);
    expect(h.chamadas[0].init?.method).toBe("POST");
    expect(h.chamadas[1].init?.method).toBe("PUT");
    expect(JSON.parse(String(h.chamadas[1].init?.body))).toEqual({
      status: "triagem",
    });
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
