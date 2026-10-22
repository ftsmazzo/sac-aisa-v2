import { createHmac } from "node:crypto";
import type { Devolucao, Situacao } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import {
  type AuditoriaClickup,
  aplicarStatusExterno,
  assinaturaValida,
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
