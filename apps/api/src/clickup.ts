import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type Devolucao,
  ESTADOS,
  type Estado,
  ehEstadoDoSetor,
  ROTULO_ESTADO,
  type Situacao,
  situacao,
  validarTransicao,
} from "@sac-aisa/domain";
import type { Http, ServicoIntegracoes } from "./integracoes";
import { dataDeAcaoDoEstado } from "./jornada";
import { removerSegredos } from "./segredos";

// ---------- Card ao registrar ----------

/** Esperas, em minutos, depois de cada falha. Passou da última, a fila para e o erro fica visível. */
export const ESPERAS_MIN = [1, 5, 15, 60, 180, 720];
export const MAX_TENTATIVAS = ESPERAS_MIN.length + 1;
/** Se o status do card não pôde ser atualizado, tenta de novo daqui a tanto. */
export const ESPERA_STATUS_MIN = 5;

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
    /** Reclamação de treino: só vira card se o administrador liberar. */
    treino?: boolean;
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

/** O que o webhook muda na reclamação: o(s) estado(s) do setor, a data de ação e a situação. */
export interface MudancaPorClickup {
  id: string;
  /** Estado de onde partiu e passos percorridos, na ordem; o último é o estado novo. */
  de: Estado;
  passos: Estado[];
  dataAcao: string | null;
  situacao: Situacao;
}

/** O card como está hoje, para saber se o status dele precisa acompanhar o estado. */
export interface SincroniaCard {
  cardId: string;
  taskId: string | null;
  estado: Estado;
  statusExterno: string | null;
  statusPendente: boolean;
  treino?: boolean;
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
  pendentes(
    agora: Date,
    limite: number,
    incluirTreino?: boolean,
  ): Promise<string[]>;
  /** Reclamações cujo card existe mas ainda não recebeu o status do estado atual. */
  statusPendentes(
    agora: Date,
    limite: number,
    incluirTreino?: boolean,
  ): Promise<string[]>;
  carregarSincronia(reclamacaoId: string): Promise<SincroniaCard | null>;
  registrarStatusSincronizado(args: {
    cardId: string;
    statusExterno: string;
    agora: Date;
  }): Promise<void>;
  registrarFalhaStatus(args: {
    cardId: string;
    erro: string;
    proxima: Date;
  }): Promise<void>;
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
    estado: Estado;
    dataAbertura: string;
    dataAcao: string | null;
    devolucao: Devolucao;
    temSetor: boolean;
  } | null>;
  /**
   * Grava, numa transação: o status do card, a mudança de estado da reclamação (se houver, com
   * uma linha de histórico por passo), a auditoria e o evento como processado.
   * `corrigirCard` marca o card para voltar ao status certo (o ClickUp o moveu para onde não podia).
   */
  aplicarStatus(args: {
    eventoId: string;
    cardId: string | null;
    statusExterno: string | null;
    reclamacao: MudancaPorClickup | null;
    auditoria: AuditoriaClickup | null;
    corrigirCard: boolean;
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

// ---------- Mapa de estados ↔ status do card ----------

/**
 * Status do ClickUp que cada estado usa por padrão. O administrador troca na tela de integrações;
 * os nomes precisam existir na lista do ClickUp (o ClickUp recusa status que não conhece).
 */
export const MAPA_ESTADOS_PADRAO: Record<Estado, string> = {
  triagem: "triagem",
  aguardando_cliente: "aguardando cliente",
  encaminhada: "encaminhada ao setor",
  recebida: "recebida pelo setor",
  em_tratativa: "em tratativa",
  resolvida_setor: "resolvida no setor técnico",
  finalizada: "finalizada no sac",
};

/**
 * Nomes que o ClickUp já traz e que significam algo sem configurar nada. "Complete" é a
 * solução devolvida pelo setor técnico, nunca a finalização, que é do SAC.
 */
const APELIDOS: Record<string, Estado> = {
  complete: "resolvida_setor",
  closed: "resolvida_setor",
  "in progress": "em_tratativa",
};

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** O mapa em vigor: o padrão com o que o administrador trocou por cima. */
export function mapaEstadosEfetivo(
  config: Record<string, unknown>,
): Record<Estado, string> {
  const salvo = objeto(config.mapaEstados) ?? {};
  const r = { ...MAPA_ESTADOS_PADRAO };
  for (const e of ESTADOS) {
    const v = salvo[e];
    if (typeof v === "string" && v.trim() !== "") r[e] = v.trim();
  }
  return r;
}

export function statusDoEstado(
  estado: Estado,
  mapa: Record<Estado, string>,
): string {
  return mapa[estado];
}

/** De status do ClickUp para estado: o mapa primeiro, depois os apelidos. Nome desconhecido dá null. */
export function estadoDoStatus(
  status: string,
  mapa: Record<Estado, string>,
): Estado | null {
  const s = norm(status);
  const achado = ESTADOS.find((e) => norm(mapa[e]) === s);
  return achado ?? APELIDOS[s] ?? null;
}

/** O caminho que o setor percorre; o ClickUp só anda para a frente por ele. */
const CAMINHO_DO_SETOR: readonly Estado[] = [
  "encaminhada",
  "recebida",
  "em_tratativa",
  "resolvida_setor",
];

export type DecisaoStatus =
  | { tipo: "ignorar" }
  | { tipo: "aplicar"; passos: Estado[] }
  | { tipo: "reverter"; motivo: string };

/**
 * Uma mudança do card no ClickUp só vale para os estados do setor (recebida, em tratativa,
 * resolvida no setor técnico), pelo caminho normal e com as mesmas regras do sistema.
 * Qualquer outra coisa é recusada e o card volta ao status do estado atual.
 */
export function decidirStatusExterno(
  atual: { estado: Estado; devolucao: Devolucao; temSetor: boolean },
  alvo: Estado | null,
): DecisaoStatus {
  // Status desconhecido, ou o eco da nossa própria atualização: nada a fazer.
  if (!alvo || alvo === atual.estado) return { tipo: "ignorar" };
  const reverter = (motivo: string): DecisaoStatus => ({
    tipo: "reverter",
    motivo,
  });
  if (!ehEstadoDoSetor(alvo)) {
    return reverter(
      `"${ROTULO_ESTADO[alvo]}" é um estado do SAC; o ClickUp só move o card para estados do setor.`,
    );
  }
  const de = CAMINHO_DO_SETOR.indexOf(atual.estado);
  const para = CAMINHO_DO_SETOR.indexOf(alvo);
  if (de < 0) {
    return reverter(
      `A reclamação está em "${ROTULO_ESTADO[atual.estado]}": o setor ainda não pode mexer nela.`,
    );
  }
  if (para <= de) {
    return reverter(
      `O setor não volta de "${ROTULO_ESTADO[atual.estado]}" para "${ROTULO_ESTADO[alvo]}".`,
    );
  }
  const passos: Estado[] = [];
  let cursor = atual.estado;
  for (const proximo of CAMINHO_DO_SETOR.slice(de + 1, para + 1)) {
    const v = validarTransicao({
      perfil: "responsavel_setor",
      de: cursor,
      para: proximo,
      devolucao: atual.devolucao,
      temSetor: atual.temSetor,
    });
    if (!v.ok) return reverter(v.mensagem);
    passos.push(proximo);
    cursor = proximo;
  }
  return { tipo: "aplicar", passos };
}

export type ResultadoTentativa =
  | "sem_card"
  | "criado"
  | "sem_token"
  | "sem_lista"
  | "treino_bloqueado"
  | "falhou";

export type ResultadoSincronia =
  | "sem_card"
  | "sem_task"
  | "sem_pendencia"
  | "treino_bloqueado"
  | "sem_token"
  | "em_dia"
  | "atualizado"
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

  /** Reclamação de treino só chega ao ClickUp com "Criar cards para reclamações de treino" ligado. */
  private async treinoLiberado(): Promise<boolean> {
    const cfg = await this.integr.config("clickup");
    return cfg.criarCardsTreino === true;
  }

  /**
   * Tenta criar o card. Nunca lança: sem token o card só fica pendente, e qualquer falha
   * do ClickUp vira erro registrado em `ClickupCard`, com nova tentativa mais tarde.
   */
  async tentarCard(reclamacaoId: string): Promise<ResultadoTentativa> {
    const dados = await this.repo.carregarCard(reclamacaoId);
    if (!dados) return "sem_card";
    if (dados.taskId) return "criado";
    if (dados.reclamacao.treino && !(await this.treinoLiberado())) {
      return "treino_bloqueado";
    }

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
      // O card nasce no status padrão da lista; o do estado atual vem logo em seguida.
      await this.sincronizarEstado(reclamacaoId).catch(() => undefined);
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

  /**
   * Põe no card o status do estado atual da reclamação. Só age quando o card está marcado como
   * pendente (a gravação do estado marca) e já tem task. Nunca lança: falha vira erro registrado
   * no card e nova tentativa em alguns minutos, sem derrubar quem mudou o estado.
   */
  async sincronizarEstado(reclamacaoId: string): Promise<ResultadoSincronia> {
    const c = await this.repo.carregarSincronia(reclamacaoId);
    if (!c) return "sem_card";
    if (!c.taskId) return "sem_task";
    if (!c.statusPendente) return "sem_pendencia";
    if (c.treino && !(await this.treinoLiberado())) return "treino_bloqueado";

    const token = await this.integr.segredo("clickup", "token");
    if (!token) return "sem_token";

    const agora = this.agora();
    const mapa = mapaEstadosEfetivo(await this.integr.config("clickup"));
    const status = statusDoEstado(c.estado, mapa);
    if (c.statusExterno && norm(c.statusExterno) === norm(status)) {
      await this.repo.registrarStatusSincronizado({
        cardId: c.cardId,
        statusExterno: c.statusExterno,
        agora,
      });
      return "em_dia";
    }

    try {
      const r = await this.http(
        `https://api.clickup.com/api/v2/task/${encodeURIComponent(c.taskId)}`,
        {
          method: "PUT",
          headers: { Authorization: token, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (r.status !== 200) {
        const json = (await r.json().catch(() => null)) as {
          err?: unknown;
        } | null;
        const detalhe = typeof json?.err === "string" ? `: ${json.err}` : "";
        throw new Error(
          `O ClickUp não aceitou o status "${status}" (${r.status}${detalhe}). Confira o nome do status na lista.`,
        );
      }
      await this.repo.registrarStatusSincronizado({
        cardId: c.cardId,
        statusExterno: status,
        agora,
      });
      return "atualizado";
    } catch (e) {
      const bruto =
        e instanceof Error && e.message.startsWith("O ClickUp não aceitou")
          ? e.message
          : "Sem resposta do ClickUp ao atualizar o status.";
      await this.repo.registrarFalhaStatus({
        cardId: c.cardId,
        erro: corte(removerSegredos(bruto, [token]), 300),
        proxima: new Date(agora.getTime() + ESPERA_STATUS_MIN * 60_000),
      });
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

  /** Passada da fila: tenta os cards cuja hora chegou e atualiza o status dos que ficaram para trás. */
  async processarPendentes(limite = 20): Promise<number> {
    const agora = this.agora();
    const incluirTreino = await this.treinoLiberado();
    const ids = await this.repo.pendentes(agora, limite, incluirTreino);
    for (const id of ids) await this.tentarCard(id);
    const status = await this.repo.statusPendentes(
      agora,
      limite,
      incluirTreino,
    );
    for (const id of status) await this.sincronizarEstado(id);
    return ids.length + status.length;
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
 * Regra antiga, mantida para quem ainda a usa: resolver põe a data de ação de hoje e reabrir a
 * limpa. O webhook agora decide por estado (`decidirStatusExterno`).
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
    /** Devolve o card ao status certo quando o ClickUp o moveu para onde não podia. */
    private readonly corrigirCard?: (reclamacaoId: string) => Promise<unknown>,
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
        corrigirCard: false,
        agora,
      });
      return;
    }

    const cfg = await this.integr.config("clickup");
    const mapa = mapaEstadosEfetivo(cfg);
    const alvo = estadoDoStatus(status, mapa);
    let reclamacao: MudancaPorClickup | null = null;
    let auditoria: AuditoriaClickup | null = null;
    let corrigirCard = false;

    if (card.reclamacaoId && alvo) {
      const atual = await this.repo.reclamacaoParaStatus(card.reclamacaoId);
      if (atual) {
        const decisao = decidirStatusExterno(
          {
            estado: atual.estado,
            devolucao: atual.devolucao,
            temSetor: atual.temSetor,
          },
          alvo,
        );
        if (decisao.tipo === "aplicar") {
          const novo = decisao.passos[decisao.passos.length - 1];
          const dataAcao = dataDeAcaoDoEstado(
            novo,
            { dataAcao: atual.dataAcao, dataAbertura: atual.dataAbertura },
            hojeEmSaoPaulo(agora),
          );
          reclamacao = {
            id: card.reclamacaoId,
            de: atual.estado,
            passos: decisao.passos,
            dataAcao,
            situacao: situacao({ dataAcao, devolucao: atual.devolucao }),
          };
          auditoria = {
            acao: "clickup.status",
            alvo: `Reclamação #${atual.numero}`,
            detalhe: `Atualizada pelo ClickUp: status "${status}", ${ROTULO_ESTADO[atual.estado]} → ${ROTULO_ESTADO[novo]}.`,
            reclamacaoId: card.reclamacaoId,
            extra: {
              statusExterno: status,
              de: atual.estado,
              para: novo,
              passos: decisao.passos,
            },
          };
        } else if (decisao.tipo === "reverter") {
          corrigirCard = true;
          auditoria = {
            acao: "clickup.status",
            alvo: `Reclamação #${atual.numero}`,
            detalhe: `ClickUp recusado: card movido para "${status}". ${decisao.motivo} O card volta ao status do estado atual.`,
            reclamacaoId: card.reclamacaoId,
            extra: {
              statusExterno: status,
              recusado: true,
              estado: atual.estado,
            },
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
      corrigirCard,
      agora,
    });
    if (corrigirCard && card.reclamacaoId && this.corrigirCard) {
      await this.corrigirCard(card.reclamacaoId).catch(() => undefined);
    }
  }
}
