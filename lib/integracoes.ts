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
  chave: "clickup" | "mercadolivre" | "shopee" | "openrouter";
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
    assistente: {
      workspaceId: string;
      spaceId: string;
      webhookAtivo: boolean;
    };
  };
}

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
}

export function rascunhoInicial(i: Integracao): RascunhoIntegracao {
  return {
    campos: Object.fromEntries(
      i.campos.map((c) => [c.nome, c.tipo === "texto" ? (c.valor ?? "") : ""]),
    ),
    listas: Object.fromEntries(
      (i.clickup?.setores ?? []).map((s) => [s.id, s.listaId]),
    ),
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
  } = { campos: { ...r.campos } };
  if (i.chave === "clickup") {
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
