/** Formato que a API devolve em GET /admin/simulacao. */

export type CanalId = "mercadolivre" | "shopee";

export interface PassoRegistro {
  seq: number;
  quando: string;
  canal: CanalId | "sistema";
  etapa: string;
  detalhe: string;
  ok: boolean;
  ms: number | null;
}

export interface ItemFalta {
  item: string;
  /** Verdadeiro, falso, ou nulo quando só dá para conferir no painel do canal. */
  feito: boolean | null;
  como: string;
}

export interface PainelCanal {
  canal: CanalId;
  baseUrl: string;
  simulado: boolean;
  casosNoCanal: number | null;
  falta: ItemFalta[];
}

export interface EstadoSimulacao {
  ativo: boolean;
  forcadoPorAmbiente: boolean;
  canais: PainelCanal[];
  reclamacoesCapturadas: number;
  registro: PassoRegistro[];
}

export const NOME_CANAL: Record<CanalId | "sistema", string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  sistema: "Sistema",
};

export interface BotaoCenario {
  cenario:
    | "novo_caso"
    | "atualizacao"
    | "aviso_duplicado"
    | "aviso_perdido"
    | "busca";
  rotulo: string;
  ajuda: string;
}

/** Os botões de cada canal. O texto muda só no primeiro (caso novo ou devolução nova). */
export function botoesDoCanal(canal: CanalId): BotaoCenario[] {
  return [
    {
      cenario: "novo_caso",
      rotulo:
        canal === "mercadolivre"
          ? "Novo caso do Mercado Livre"
          : "Nova devolução da Shopee",
      ajuda:
        "O canal avisa, o sistema busca o caso inteiro e cria a reclamação em Triagem.",
    },
    {
      cenario: "atualizacao",
      rotulo: "Atualização de status",
      ajuda:
        "O caso muda no canal (texto e prazo) e o sistema atualiza a reclamação, sem duplicar.",
    },
    {
      cenario: "aviso_duplicado",
      rotulo: "Aviso duplicado",
      ajuda: "O mesmo aviso chega duas vezes. Nada é duplicado.",
    },
    {
      cenario: "aviso_perdido",
      rotulo: "Aviso perdido",
      ajuda:
        "O canal abre um caso e o aviso se perde. A busca periódica recupera.",
    },
    {
      cenario: "busca",
      rotulo: "Rodar a busca agora",
      ajuda:
        "Busca no canal tudo o que ainda não está gravado (traz os 12 casos iniciais).",
    },
  ];
}

export function mensagemSimulacao(status: number, mensagem?: string): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Sem permissão para esta ação.";
  if (status === 502) return "Serviço indisponível no momento.";
  return mensagem || "Não foi possível concluir. Tente de novo.";
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatarMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

export function simboloDoItem(feito: boolean | null): {
  texto: string;
  rotulo: string;
} {
  if (feito === true) return { texto: "✓", rotulo: "Feito" };
  if (feito === false) return { texto: "✗", rotulo: "Falta" };
  return { texto: "?", rotulo: "Conferir no painel do canal" };
}
