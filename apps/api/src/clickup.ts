import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type Devolucao,
  type Estado,
  ROTULO_ESTADO,
  type Situacao,
  situacao,
} from "@sac-aisa/domain";
import {
  comentarioAnalise,
  comentarioDevolucao,
  decidirStatusExterno,
  estadoDoStatus,
  linkFicha,
  mapaEstadosEfetivo,
  type OrigemMudanca,
  prazoDoCard,
  prioridadeDoCard,
  ROTULO_SITUACAO,
  statusDoEstado,
} from "./clickup-sync";
import type { Http, ServicoIntegracoes } from "./integracoes";
import { dataDeAcaoDoEstado } from "./jornada";
import { removerSegredos } from "./segredos";

export {
  type DecisaoStatus,
  decidirStatusExterno,
  estadoDoStatus,
  MAPA_ESTADOS_PADRAO,
  mapaEstadosEfetivo,
  statusDoEstado,
} from "./clickup-sync";

// ---------- Card ao registrar ----------

/** Esperas, em minutos, depois de cada falha. Passou da última, a fila para e o erro fica visível. */
export const ESPERAS_MIN = [1, 5, 15, 60, 180, 720];
export const MAX_TENTATIVAS = ESPERAS_MIN.length + 1;

export interface DadosCard {
  cardId: string;
  taskId: string | null;
  listaId: string | null;
  statusExterno: string | null;
  tentativas: number;
  precisaSync: boolean;
  /** Comentários ainda não postados, do mais antigo ao mais novo. */
  comentarios: { id: string; texto: string }[];
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
    situacao: Situacao;
    /** Estado da jornada: é ele que escolhe o status do card. */
    estado: Estado;
    devolucao: Devolucao;
    custoTotal: number;
    /** Reclamação de treino: só vira card se o administrador liberar. */
    treino?: boolean;
  };
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

export interface DadosAnalise {
  reclamacaoId: string;
  numero: number;
  setorNome: string;
  produtoPrecisaVoltar: boolean;
  produtoRecebidoEm: string | null;
  conclusao: string;
  resultado: string;
}

export type EstadoFila = "pendente" | "erro" | "esgotado";

export interface ItemFila {
  cardId: string;
  /** "Reclamação #12" ou o título do plano. */
  titulo: string;
  estado: EstadoFila;
  taskId: string | null;
  tentativas: number;
  ultimoErro: string | null;
  proximaTentativaEm: string | null;
  comentariosPendentes: number;
}

export interface FilaDoClickup {
  itens: ItemFila[];
  totais: Record<EstadoFila, number>;
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
  /** Reclamações cujo card tem trabalho na fila (criar, atualizar ou comentar) e cuja hora chegou. */
  pendentes(
    agora: Date,
    limite: number,
    incluirTreino?: boolean,
  ): Promise<string[]>;
  /** Marca o card para atualizar e, se vier texto, enfileira o comentário. Sem card, não faz nada. */
  marcarSync(args: {
    reclamacaoId: string;
    comentarios: string[];
    agora: Date;
  }): Promise<void>;
  comentarioEnviado(id: string, agora: Date): Promise<void>;
  /** Card atualizado: limpa a marca, o erro e as tentativas. */
  registrarSincronizado(args: {
    cardId: string;
    listaId: string | null;
    statusExterno: string | null;
    agora: Date;
  }): Promise<void>;
  carregarAnalise(analiseId: string): Promise<DadosAnalise | null>;
  fila(): Promise<FilaDoClickup>;
  /** Devolve à fila o que está com erro ou esgotado (um card ou todos). Devolve quantos. */
  reenviar(cardId: string | null, agora: Date): Promise<number>;
  /** Mesma chave já recebida: conta a repetição e devolve `duplicado`. */
  gravarEvento(e: {
    taskId: string;
    tipo: string;
    payload: unknown;
    chave: string | null;
  }): Promise<{ id: string; duplicado: boolean }>;
  obterEvento(id: string): Promise<EventoGravado | null>;
  cardPorTaskId(taskId: string): Promise<{
    cardId: string;
    reclamacaoId: string | null;
    statusExterno: string | null;
  } | null>;
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
    `Estado: ${ROTULO_ESTADO[r.estado]}`,
    `Situação: ${ROTULO_SITUACAO[r.situacao]}`,
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

/** Corpo do PUT /task/{id}: o estado atual da reclamação. O status só sai se o card ainda não está no status do estado. */
export function montarAtualizacao(
  r: DadosCard["reclamacao"],
  args: {
    mapa: Record<Estado, string>;
    statusAtual: string | null;
    hoje: string;
    urlWeb?: string;
  },
) {
  const card = montarCard(r, args.urlWeb);
  const alvo = statusDoEstado(r.estado, args.mapa);
  const jaNoStatus =
    args.statusAtual !== null &&
    args.statusAtual.trim().toLowerCase() === alvo.trim().toLowerCase();
  const status = jaNoStatus ? null : alvo;
  return {
    name: card.name,
    markdown_content: card.markdown_description,
    ...(status ? { status } : {}),
    due_date: prazoDoCard(r).ms,
    due_date_time: false,
    priority: prioridadeDoCard(r, args.hoje),
  };
}

export type ResultadoTentativa =
  | "sem_card"
  | "criado"
  | "sem_token"
  | "sem_lista"
  | "treino_bloqueado"
  | "falhou";

export type ResultadoSync =
  | "nada"
  | "sincronizado"
  | "treino_bloqueado"
  | "sem_token"
  | "sem_workspace"
  | "falhou";

const API = "https://api.clickup.com/api";

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
    const ids = await this.repo.pendentes(
      this.agora(),
      limite,
      await this.treinoLiberado(),
    );
    for (const id of ids) await this.trabalhar(id).catch(() => undefined);
    return ids.length;
  }

  /** Cria o card se ainda não existe; com o card criado, manda o que mudou no SAC. */
  async trabalhar(
    reclamacaoId: string,
  ): Promise<ResultadoTentativa | ResultadoSync> {
    const r = await this.tentarCard(reclamacaoId);
    return r === "criado" ? this.sincronizar(reclamacaoId) : r;
  }

  // ---------- Atualização do card ----------

  /**
   * A reclamação mudou no SAC: marca o card para atualizar e já tenta enviar. Nunca lança.
   * Mudança que veio do próprio ClickUp (`origem: "clickup"`) não volta para lá: evita o laço.
   */
  async reclamacaoMudou(
    reclamacaoId: string,
    opcoes: { origem?: OrigemMudanca; comentarios?: string[] } = {},
  ): Promise<void> {
    if (opcoes.origem === "clickup") return;
    try {
      await this.repo.marcarSync({
        reclamacaoId,
        comentarios: opcoes.comentarios ?? [],
        agora: this.agora(),
      });
      await this.trabalhar(reclamacaoId);
    } catch {
      // A gravação do SAC já está feita; a fila tenta de novo.
    }
  }

  /** Depois de editar a reclamação: atualiza o card e, se o produto chegou, comenta a devolução. */
  async aposEdicao(
    reclamacaoId: string,
    r: { numero: number; devolucaoRecebida: boolean },
  ): Promise<void> {
    await this.reclamacaoMudou(reclamacaoId, {
      comentarios: r.devolucaoRecebida
        ? [comentarioDevolucao(r.numero, linkFicha(reclamacaoId, this.urlWeb))]
        : [],
    });
  }

  /** Depois da análise do setor: comenta a análise (com a decisão de retorno) e a devolução recebida. */
  async aposAnalise(
    reclamacaoId: string,
    r: { id: string; criando: boolean; devolucaoRecebida: boolean },
  ): Promise<void> {
    const comentarios: string[] = [];
    try {
      const a = await this.repo.carregarAnalise(r.id);
      const link = linkFicha(reclamacaoId, this.urlWeb);
      if (a) comentarios.push(comentarioAnalise(a, r.criando, link));
      if (a && r.devolucaoRecebida) {
        comentarios.push(comentarioDevolucao(a.numero, link));
      }
    } catch {
      // Sem o texto, ainda atualiza o card.
    }
    await this.reclamacaoMudou(reclamacaoId, { comentarios });
  }

  private async enviar(
    token: string,
    metodo: "PUT" | "POST",
    url: string,
    corpo: unknown,
  ): Promise<{ status?: { status?: unknown } } | null> {
    const r = await this.http(url, {
      method: metodo,
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await r.json().catch(() => null)) as {
      err?: unknown;
      status?: { status?: unknown };
    } | null;
    if (r.status !== 200) {
      const detalhe = typeof json?.err === "string" ? `: ${json.err}` : "";
      throw new Error(`O ClickUp respondeu ${r.status}${detalhe}`);
    }
    return json;
  }

  /**
   * Manda ao card o estado atual: lista do setor (se mudou), título, descrição, status, prazo e
   * prioridade, e depois os comentários na ordem. Falha vira `ultimoErro` e nova tentativa.
   */
  async sincronizar(reclamacaoId: string): Promise<ResultadoSync> {
    const dados = await this.repo.carregarCard(reclamacaoId);
    if (!dados?.taskId) return "nada";
    if (!dados.precisaSync && dados.comentarios.length === 0) return "nada";
    if (dados.reclamacao.treino && !(await this.treinoLiberado())) {
      return "treino_bloqueado";
    }
    const token = await this.integr.segredo("clickup", "token");
    if (!token) return "sem_token";

    const agora = this.agora();
    const cfg = await this.integr.config("clickup");
    const listas = await this.integr.listasClickup();
    const mapa = mapaEstadosEfetivo(cfg);
    const padrao =
      typeof cfg.listaPadraoId === "string" ? cfg.listaPadraoId : "";
    const alvoLista =
      (dados.reclamacao.setorRespId && listas[dados.reclamacao.setorRespId]) ||
      padrao;
    const workspace =
      typeof cfg.workspaceId === "string" ? cfg.workspaceId.trim() : "";
    const taskId = encodeURIComponent(dados.taskId);
    let listaAtual = dados.listaId;
    let statusExterno: string | null = null;
    let semWorkspace = false;

    try {
      if (dados.precisaSync) {
        // Mover primeiro: o status é o da lista nova.
        if (alvoLista && listaAtual && alvoLista !== listaAtual) {
          if (!workspace) {
            semWorkspace = true;
          } else {
            await this.enviar(
              token,
              "PUT",
              `${API}/v3/workspaces/${encodeURIComponent(workspace)}/tasks/${taskId}/home_list/${encodeURIComponent(alvoLista)}`,
              {},
            );
            listaAtual = alvoLista;
          }
        }
        const j = await this.enviar(
          token,
          "PUT",
          `${API}/v2/task/${taskId}`,
          montarAtualizacao(dados.reclamacao, {
            mapa,
            statusAtual: dados.statusExterno,
            hoje: hojeEmSaoPaulo(agora),
            urlWeb: this.urlWeb,
          }),
        );
        if (typeof j?.status?.status === "string") {
          statusExterno = j.status.status;
        }
      }
      for (const c of dados.comentarios) {
        await this.enviar(token, "POST", `${API}/v2/task/${taskId}/comment`, {
          comment_text: c.texto,
          notify_all: false,
        });
        await this.repo.comentarioEnviado(c.id, agora);
      }
      if (semWorkspace) {
        await this.repo.registrarFalha({
          cardId: dados.cardId,
          erro: "Informe o ID do workspace do ClickUp nas integrações para mover o card de lista.",
          proxima: new Date(agora.getTime() + 60 * 60_000),
          contarTentativa: false,
        });
        return "sem_workspace";
      }
      await this.repo.registrarSincronizado({
        cardId: dados.cardId,
        listaId: listaAtual,
        statusExterno,
        agora,
      });
      return "sincronizado";
    } catch (e) {
      const bruto =
        e instanceof Error && e.message.startsWith("O ClickUp respondeu")
          ? e.message
          : "Sem resposta do ClickUp.";
      await this.registrarFalha(dados.cardId, dados.tentativas, bruto, token);
      return "falhou";
    }
  }

  // ---------- Fila (tela do administrador) ----------

  fila(): Promise<FilaDoClickup> {
    return this.repo.fila();
  }

  /** "Tentar de novo": devolve à fila o que está com erro ou esgotado e já processa. */
  async reenviar(cardId: string | null): Promise<number> {
    const n = await this.repo.reenviar(cardId, this.agora());
    void this.processarPendentes().catch(() => undefined);
    return n;
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

/** `{webhook_id}:{history_item_id}`: identifica a entrega, que o ClickUp pode repetir. Sem os dois, sem chave. */
export function chaveDoEvento(payload: unknown): string | null {
  const o = objeto(payload);
  const webhook = o?.webhook_id;
  const itens = o?.history_items;
  const item = Array.isArray(itens) ? objeto(itens[0])?.id : undefined;
  const ok = (v: unknown): v is string | number =>
    (typeof v === "string" && v !== "") || typeof v === "number";
  return ok(webhook) && ok(item) ? `${webhook}:${item}`.slice(0, 200) : null;
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
  ): Promise<{ id: string; duplicado: boolean }> {
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
    const r = await this.repo.gravarEvento({
      taskId,
      tipo,
      payload,
      chave: chaveDoEvento(payload),
    });
    return r;
  }

  async processar(eventoId: string): Promise<void> {
    const ev = await this.repo.obterEvento(eventoId);
    if (!ev || ev.processadoEm) return;
    const agora = this.agora();
    const card = await this.repo.cardPorTaskId(ev.taskId);
    const status =
      ev.tipo === "taskStatusUpdated" ? statusNovo(ev.payload) : null;

    // Eco do que o próprio SAC acabou de mandar ao card: não há o que aplicar de volta.
    const eco =
      card?.statusExterno &&
      status &&
      card.statusExterno.trim().toLowerCase() === status.trim().toLowerCase();

    if (!card || !status || eco) {
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
    const alvo = estadoDoStatus(status, mapaEstadosEfetivo(cfg));
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
