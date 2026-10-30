import { ESTADOS, type Estado } from "./reclamacoes-formato";

/** Formato que a API devolve em GET /admin/integracoes. O segredo nunca vem: só a máscara. */
export type EstadoIntegracao = "pendente" | "conectado" | "erro";

export interface CampoIntegracao {
  nome: string;
  rotulo: string;
  tipo: "texto" | "segredo";
  ajuda: string;
  valor?: string;
  preenchido?: boolean;
  mascara?: string;
}

export interface Integracao {
  chave: "clickup" | "mercadolivre" | "shopee" | "openrouter" | "evolution";
  nome: string;
  resumo: string;
  passos: string[];
  estado: EstadoIntegracao;
  ultimoErro: string | null;
  testadoEm: string | null;
  campos: CampoIntegracao[];
  clickup?: {
    setores: { id: string; nome: string; listaId: string }[];
    /** Status do ClickUp que cada estado usa hoje. */
    mapaEstados: Record<Estado, string>;
    padraoEstados: Record<Estado, string>;
    /** Reclamações de treino viram cards no ClickUp configurado. */
    criarCardsTreino?: boolean;
    assistente: {
      workspaceId: string;
      spaceId: string;
      webhookAtivo: boolean;
    };
  };
}

/** Lista que já existe no ClickUp. O identificador nunca é digitado à mão. */
export interface ListaEmUso {
  id: string;
  nome: string;
  space: string;
  statuses: string[];
}

/** O mesmo texto que a fila grava quando o setor ainda não tem lista. */
export const ERRO_SEM_LISTA =
  "Sem lista para o setor e sem lista padrão no ClickUp.";

export interface PassoAssistente {
  id: string;
  rotulo: string;
  estado: "ok" | "erro" | "aviso" | "pulado";
  mensagem: string;
}

export const ROTULO_PASSO: Record<PassoAssistente["estado"], string> = {
  ok: "ok",
  erro: "erro",
  aviso: "atenção",
  pulado: "não rodou",
};

export interface PainelIntegracoes {
  gravacaoLiberada: boolean;
  integracoes: Integracao[];
}

export const ESTADO_SELO: Record<
  EstadoIntegracao,
  { rotulo: string; tom: "ok" | "atencao" | "perigo" }
> = {
  conectado: { rotulo: "Conectado", tom: "ok" },
  pendente: { rotulo: "Pendente", tom: "atencao" },
  erro: { rotulo: "Erro", tom: "perigo" },
};

export interface RascunhoIntegracao {
  /** Campo de texto: valor atual. Segredo: o que a pessoa digitou (vazio = manter). */
  campos: Record<string, string>;
  listas: Record<string, string>;
  /** Status do ClickUp por estado. Vazio = usar o padrão. */
  estados: Record<Estado, string>;
  criarCardsTreino: boolean;
}

export function rascunhoInicial(i: Integracao): RascunhoIntegracao {
  return {
    campos: Object.fromEntries(
      i.campos.map((c) => [c.nome, c.tipo === "texto" ? (c.valor ?? "") : ""]),
    ),
    listas: Object.fromEntries(
      (i.clickup?.setores ?? []).map((s) => [s.id, s.listaId]),
    ),
    criarCardsTreino: i.clickup?.criarCardsTreino === true,
    estados: Object.fromEntries(
      ESTADOS.map((e) => {
        const atual = i.clickup?.mapaEstados?.[e] ?? "";
        const padrao = i.clickup?.padraoEstados?.[e] ?? "";
        // O que é igual ao padrão fica vazio: o placeholder já o mostra.
        return [e, atual === padrao ? "" : atual];
      }),
    ) as Record<Estado, string>,
  };
}

/** Corpo do PUT: só o que o formulário controla. Estado com campo vazio volta ao padrão. */
export function montarEntrada(i: Integracao, r: RascunhoIntegracao) {
  const corpo: {
    campos: Record<string, string>;
    listas?: Record<string, string>;
    mapaEstados?: Record<string, string>;
    criarCardsTreino?: boolean;
  } = { campos: { ...r.campos } };
  if (i.chave === "clickup") {
    corpo.criarCardsTreino = r.criarCardsTreino;
    corpo.listas = r.listas;
    corpo.mapaEstados = Object.fromEntries(
      ESTADOS.map((e) => [e, (r.estados[e] ?? "").trim()]),
    );
  }
  return corpo;
}

export function mensagemIntegracao(status: number, mensagem?: string): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Só o administrador pode mexer nas integrações.";
  if (status === 502) return "Serviço indisponível no momento.";
  return mensagem || "Não foi possível concluir. Tente de novo.";
}

export function formatarQuando(iso: string | null): string {
  if (!iso) return "nunca testado";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Fila de envio ao ClickUp, como a API devolve em GET /admin/integracoes/clickup/fila. */
export type EstadoFila = "pendente" | "erro" | "esgotado";

export interface ItemFilaClickup {
  cardId: string;
  titulo: string;
  estado: EstadoFila;
  taskId: string | null;
  tentativas: number;
  ultimoErro: string | null;
  proximaTentativaEm: string | null;
  comentariosPendentes: number;
  /** Setor responsável. Ausente em fila antiga ou em card de plano. */
  setorNome?: string | null;
}

export interface FilaClickup {
  itens: ItemFilaClickup[];
  totais: Record<EstadoFila, number>;
}

export const FILA_SELO: Record<
  EstadoFila,
  { rotulo: string; tom: "ok" | "atencao" | "perigo" | "info" }
> = {
  pendente: { rotulo: "Pendente", tom: "info" },
  erro: { rotulo: "Com erro", tom: "atencao" },
  esgotado: { rotulo: "Esgotado", tom: "perigo" },
};

/** Uma frase sobre o que o item espera: criar o card, atualizar ou comentar. */
export function oQueFalta(i: ItemFilaClickup): string {
  const partes: string[] = [];
  if (!i.taskId) partes.push("criar o card");
  else partes.push("atualizar o card");
  if (i.comentariosPendentes > 0) {
    partes.push(
      i.comentariosPendentes === 1
        ? "1 comentário"
        : `${i.comentariosPendentes} comentários`,
    );
  }
  return partes.join(" e ");
}

export function proximaTentativa(i: ItemFilaClickup): string {
  if (i.estado === "esgotado") return "parou: use Tentar de novo";
  if (!i.proximaTentativaEm) return "na próxima passada";
  return formatarQuando(i.proximaTentativaEm);
}

/** O que a fila sem lista está esperando: o nome do setor, não um card novo. */
export function textoDaFilaSemLista(itens: ItemFilaClickup[]): string {
  const nomes = new Set<string>();
  let semSetor = 0;
  for (const i of itens) {
    if (i.ultimoErro !== ERRO_SEM_LISTA) continue;
    const nome = i.setorNome?.trim();
    if (nome) nomes.add(nome);
    else semSetor += 1;
  }
  const lista = [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const partes = ["Nenhum card precisa ser criado à mão no ClickUp."];
  if (lista.length > 0) {
    partes.push(
      `Falta gravar a lista que já existe para: ${lista.join(", ")}. Escolha em Lista de cada setor e clique em Gravar.`,
    );
  }
  if (semSetor > 0) {
    partes.push(
      semSetor === 1
        ? "Uma reclamação ainda não tem setor responsável."
        : `${semSetor} reclamações ainda não têm setor responsável.`,
    );
  }
  partes.push("Depois use Tentar de novo. A tentativa não foi gasta.");
  return partes.join(" ");
}
