import { createHmac, timingSafeEqual } from "node:crypto";
import { type Devolucao, type Situacao, situacao } from "@sac-aisa/domain";
import type { Http, ServicoIntegracoes } from "./integracoes";
import { removerSegredos } from "./segredos";

// ---------- Card ao registrar ----------

/** Esperas, em minutos, depois de cada falha. Passou da última, a fila para e o erro fica visível. */
export const ESPERAS_MIN = [1, 5, 15, 60, 180, 720];
export const MAX_TENTATIVAS = ESPERAS_MIN.length + 1;

export interface DadosCard {
  cardId: string;
  taskId: string | null;
  tentativas: number;
  reclamacao: {
    id: string;
    numero: number;
    descricao: string;
    setorRespId: string | null;
    setorNome: string;
    marca: string;
    canal: string;
    produto: string;
    causa: string;
    pedido: string;
    dataAbertura: string;
  };
}

export interface EventoGravado {
  id: string;
  taskId: string;
  tipo: string;
  payload: unknown;
  processadoEm: Date | null;
}

export interface AuditoriaClickup {
  acao: "clickup.status";
  alvo: string;
  detalhe: string;
  reclamacaoId: string;
  extra: Record<string, unknown>;
}

export interface RepositorioClickup {
  carregarCard(reclamacaoId: string): Promise<DadosCard | null>;
  registrarCriado(args: {
    cardId: string;
    taskId: string;
    listaId: string;
    statusExterno: string | null;
    agora: Date;
  }): Promise<void>;
  registrarFalha(args: {
    cardId: string;
    erro: string;
    proxima: Date | null;
    contarTentativa: boolean;
  }): Promise<void>;
  /** Reclamações com card sem task, cuja hora de tentar de novo chegou. */
  pendentes(agora: Date, limite: number): Promise<string[]>;
  gravarEvento(e: {
    taskId: string;
    tipo: string;
    payload: unknown;
  }): Promise<string>;
  obterEvento(id: string): Promise<EventoGravado | null>;
  cardPorTaskId(
    taskId: string,
  ): Promise<{ cardId: string; reclamacaoId: string | null } | null>;
  reclamacaoParaStatus(id: string): Promise<{
    numero: number;
    dataAcao: string | null;
    devolucao: Devolucao;
  } | null>;
  /** Grava, numa transação, o status do card, a mudança da reclamação (se houver), a auditoria e o evento como processado. */
  aplicarStatus(args: {
    eventoId: string;
    cardId: string | null;
    statusExterno: string | null;
    reclamacao: {
      id: string;
      dataAcao: string | null;
      situacao: Situacao;
    } | null;
    auditoria: AuditoriaClickup | null;
    agora: Date;
  }): Promise<void>;
}

export function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

function corte(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Texto do card. Sem nome, cidade nem contato do cliente: o ClickUp é de uso interno, mas o dado pessoal fica só aqui. */
export function montarCard(r: DadosCard["reclamacao"], urlWeb?: string) {
  const nome = [`Reclamação #${r.numero}`, r.canal, r.marca]
    .filter(Boolean)
    .join(" · ");
  const detalhes = [
    r.produto && `Produto: ${r.produto}`,
    r.causa && `Causa: ${r.causa}`,
    r.setorNome && `Setor responsável: ${r.setorNome}`,
    r.pedido && `Pedido: ${r.pedido}`,
    `Aberta em: ${r.dataAbertura}`,
    urlWeb && `Ficha: ${urlWeb.replace(/\/+$/, "")}/reclamacoes?ficha=${r.id}`,
  ].filter(Boolean);
  const texto = r.descricao ? corte(r.descricao, 1500) : "(sem descrição)";
  return {
    name: nome,
    markdown_description: [texto, "", ...detalhes].join("\n"),
  };
}

export type ResultadoTentativa =
  | "sem_card"
  | "criado"
  | "sem_token"
  | "sem_lista"
  | "falhou";

export class ServicoClickup {
  constructor(
    private readonly repo: RepositorioClickup,
    private readonly integr: Pick<
      ServicoIntegracoes,
      "segredo" | "config" | "listasClickup"
    >,
    private readonly http: Http = fetch,
    private readonly agora: () => Date = () => new Date(),
    private readonly urlWeb: string | undefined = process.env.WEB_BASE_URL,
  ) {}

  /**
   * Tenta criar o card. Nunca lança: sem token o card só fica pendente, e qualquer falha
   * do ClickUp vira erro registrado em `ClickupCard`, com nova tentativa mais tarde.
   */
  async tentarCard(reclamacaoId: string): Promise<ResultadoTentativa> {
    const dados = await this.repo.carregarCard(reclamacaoId);
    if (!dados) return "sem_card";
    if (dados.taskId) return "criado";

    const token = await this.integr.segredo("clickup", "token");
    if (!token) return "sem_token";

    const agora = this.agora();
    const listas = await this.integr.listasClickup();
    const cfg = await this.integr.config("clickup");
    const padrao =
      typeof cfg.listaPadraoId === "string" ? cfg.listaPadraoId : "";
    const listaId =
      (dados.reclamacao.setorRespId && listas[dados.reclamacao.setorRespId]) ||
      padrao;
    if (!listaId) {
      await this.repo.registrarFalha({
        cardId: dados.cardId,
        erro: "Sem lista para o setor e sem lista padrão no ClickUp.",
        proxima: new Date(agora.getTime() + 60 * 60_000),
        contarTentativa: false,
      });
      return "sem_lista";
    }

    try {
      const r = await this.http(
        `https://api.clickup.com/api/v2/list/${encodeURIComponent(listaId)}/task`,
        {
          method: "POST",
          headers: { Authorization: token, "Content-Type": "application/json" },
          body: JSON.stringify(montarCard(dados.reclamacao, this.urlWeb)),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const json = (await r.json().catch(() => null)) as {
        id?: unknown;
        err?: unknown;
        status?: { status?: unknown };
      } | null;
      if (r.status !== 200 || typeof json?.id !== "string") {
        const detalhe = typeof json?.err === "string" ? `: ${json.err}` : "";
        throw new Error(`O ClickUp respondeu ${r.status}${detalhe}`);
      }
      await this.repo.registrarCriado({
        cardId: dados.cardId,
        taskId: json.id,
        listaId,
        statusExterno:
          typeof json.status?.status === "string" ? json.status.status : null,
        agora,
      });
      return "criado";
    } catch (e) {
      const bruto =
        e instanceof Error && e.message.startsWith("O ClickUp respondeu")
          ? e.message
          : "Sem resposta do ClickUp.";
      await this.registrarFalha(dados.cardId, dados.tentativas, bruto, token);
      return "falhou";
    }
  }

  /** `tentativasAntes` é o que o card já tinha; esta é mais uma. Sem espera na lista, a fila para. */
  private async registrarFalha(
    cardId: string,
    tentativasAntes: number,
    erro: string,
    token: string,
  ) {
    const espera = ESPERAS_MIN[tentativasAntes];
    await this.repo.registrarFalha({
      cardId,
      erro: corte(removerSegredos(erro, [token]), 300),
      proxima: espera
        ? new Date(this.agora().getTime() + espera * 60_000)
        : null,
      contarTentativa: true,
    });
  }

  /** Passada da fila: tenta os cards cuja hora chegou. */
  async processarPendentes(limite = 20): Promise<number> {
    const ids = await this.repo.pendentes(this.agora(), limite);
    for (const id of ids) await this.tentarCard(id);
    return ids.length;
  }
}

/** Fila simples no banco: a cada intervalo, tenta de novo o que está pendente. */
export function iniciarFila(
  servico: ServicoClickup,
  intervaloMs = 60_000,
): () => void {
  let rodando = false;
  const t = setInterval(() => {
    if (rodando) return;
    rodando = true;
    servico
      .processarPendentes()
      .catch(() => undefined)
      .finally(() => {
        rodando = false;
      });
  }, intervaloMs);
  t.unref();
  return () => clearInterval(t);
}

// ---------- Webhook ----------

export class ErroWebhook extends Error {
  constructor(
    readonly status: 400 | 401,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** ClickUp assina o corpo cru com HMAC-SHA256 (hex) e manda no cabeçalho `X-Signature`. */
export function assinaturaValida(
  bruto: Buffer,
  segredo: string,
  cabecalho: string | undefined,
): boolean {
  if (!cabecalho || !/^[0-9a-fA-F]{64}$/.test(cabecalho.trim())) return false;
  const esperado = createHmac("sha256", segredo).update(bruto).digest();
  const recebido = Buffer.from(cabecalho.trim(), "hex");
  return (
    esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
  );
}

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** O status novo vem em `history_items[].after`, como texto ou como `{ status }`. */
export function statusNovo(payload: unknown): string | null {
  const itens = objeto(payload)?.history_items;
  if (!Array.isArray(itens)) return null;
  for (const item of itens) {
    const depois = objeto(item)?.after;
    if (typeof depois === "string" && depois) return depois;
    const s = objeto(depois)?.status;
    if (typeof s === "string" && s) return s;
  }
  return null;
}

export interface MudancaDeStatus {
  mudou: boolean;
  dataAcao: string | null;
  situacao: Situacao;
  motivo?: string;
}

/**
 * Traduz o status do ClickUp pelas regras do domínio: a situação continua saindo de
 * `dataAcao` e da devolução. Resolver no ClickUp põe a data de ação de hoje; reabrir limpa.
 */
export function aplicarStatusExterno(
  atual: { dataAcao: string | null; devolucao: Devolucao },
  alvo: Situacao,
  hoje: string,
): MudancaDeStatus {
  const sem = (motivo?: string): MudancaDeStatus => ({
    mudou: false,
    dataAcao: atual.dataAcao,
    situacao: situacao(atual),
    motivo,
  });
  if (alvo === "resolvida") {
    if (atual.dataAcao) return sem();
    if (atual.devolucao === "AGUARDANDO") {
      return sem(
        "Produto ainda não recebido: resolução do ClickUp não aplicada.",
      );
    }
    const dataAcao = hoje;
    return {
      mudou: true,
      dataAcao,
      situacao: situacao({ ...atual, dataAcao }),
    };
  }
  if (alvo === "tratativa") {
    if (!atual.dataAcao) return sem();
    return {
      mudou: true,
      dataAcao: null,
      situacao: situacao({ ...atual, dataAcao: null }),
    };
  }
  return sem(
    'A situação "aguardando" depende da devolução do produto: nada alterado.',
  );
}

export class ServicoWebhookClickup {
  constructor(
    private readonly repo: RepositorioClickup,
    private readonly integr: Pick<ServicoIntegracoes, "segredo" | "config">,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Confere a assinatura e guarda o evento. Quem chama responde 200 e processa depois. */
  async receber(
    bruto: Buffer | undefined,
    assinatura: string | undefined,
  ): Promise<{ id: string }> {
    const segredo = await this.integr.segredo("clickup", "segredoWebhook");
    if (!bruto || !segredo || !assinaturaValida(bruto, segredo, assinatura)) {
      throw new ErroWebhook(401, "Assinatura inválida.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(bruto.toString("utf8"));
    } catch {
      throw new ErroWebhook(400, "Corpo inválido.");
    }
    const o = objeto(payload);
    const taskId = o?.task_id;
    const tipo = o?.event;
    if (
      typeof taskId !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(taskId) ||
      typeof tipo !== "string" ||
      tipo.length > 60
    ) {
      throw new ErroWebhook(400, "Evento inválido.");
    }
    const id = await this.repo.gravarEvento({ taskId, tipo, payload });
    return { id };
  }

  async processar(eventoId: string): Promise<void> {
    const ev = await this.repo.obterEvento(eventoId);
    if (!ev || ev.processadoEm) return;
    const agora = this.agora();
    const card = await this.repo.cardPorTaskId(ev.taskId);
    const status =
      ev.tipo === "taskStatusUpdated" ? statusNovo(ev.payload) : null;

    if (!card || !status) {
      await this.repo.aplicarStatus({
        eventoId,
        cardId: card?.cardId ?? null,
        statusExterno: null,
        reclamacao: null,
        auditoria: null,
        agora,
      });
      return;
    }

    const cfg = await this.integr.config("clickup");
    const mapa = objeto(cfg.mapaStatus) ?? {};
    const alvo = mapa[status.trim().toLowerCase()];
    let reclamacao: {
      id: string;
      dataAcao: string | null;
      situacao: Situacao;
    } | null = null;
    let auditoria: AuditoriaClickup | null = null;

    if (
      card.reclamacaoId &&
      (alvo === "aguardando" || alvo === "tratativa" || alvo === "resolvida")
    ) {
      const atual = await this.repo.reclamacaoParaStatus(card.reclamacaoId);
      if (atual) {
        const m = aplicarStatusExterno(atual, alvo, hojeEmSaoPaulo(agora));
        if (m.mudou) {
          reclamacao = {
            id: card.reclamacaoId,
            dataAcao: m.dataAcao,
            situacao: m.situacao,
          };
          auditoria = {
            acao: "clickup.status",
            alvo: `Reclamação #${atual.numero}`,
            detalhe: `Atualizada pelo ClickUp: status "${status}", situação ${m.situacao}.`,
            reclamacaoId: card.reclamacaoId,
            extra: { statusExterno: status, situacao: m.situacao },
          };
        }
      }
    }
    await this.repo.aplicarStatus({
      eventoId,
      cardId: card.cardId,
      statusExterno: status,
      reclamacao,
      auditoria,
      agora,
    });
  }
}
