/** Formatos que a API devolve nas rotas de IA. Espelham apps/api/src/ia/ia.ts. */
export type AceiteIa = "aceita" | "alterada" | "recusada";
export type EstadoPergunta = "respondida" | "dispensada" | "sugerida" | "falta";
export type TipoPergunta =
  | "texto"
  | "escolha"
  | "numero"
  | "sim_nao"
  | "foto"
  | "data";

export interface ConsumoIa {
  chamadas: number;
  custoUsd: number;
  limiteChamadas: number;
  limiteCustoUsd: number;
  limiteAtingido: boolean;
}

export interface PerguntaVisao {
  chave: string;
  texto: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
  exemplo: string;
  categoria: string;
  estado: EstadoPergunta;
  valor: string;
  sugestaoIa: string;
}

export interface AnaliseVisao {
  registroId: string;
  registroPerguntaId: string | null;
  fonte: "ia" | "regras";
  sintese: string;
  causa: { id: string; nome: string; categoria: string } | null;
  setor: { id: string; nome: string } | null;
  confianca: number | null;
  aceite: AceiteIa | null;
  causaEscolhidaId: string | null;
  mensagem: string | null;
  mensagemAceite: AceiteIa | null;
  avisos: string[];
  criadoEm: string;
}

export interface VisaoIa {
  configurada: boolean;
  modelo: string;
  consumo: ConsumoIa;
  aviso: string | null;
  analise: AnaliseVisao | null;
  perguntas: PerguntaVisao[];
  causas: { id: string; nome: string; categoria: string; setor: string }[];
}

export const ROTULO_ACEITE: Record<AceiteIa, string> = {
  aceita: "Aceita como sugerida",
  alterada: "Aceita com troca ou edição",
  recusada: "Ignorada",
};

export const ROTULO_ESTADO_PERGUNTA: Record<EstadoPergunta, string> = {
  respondida: "Respondida",
  dispensada: "Dispensada",
  sugerida: "A IA achou no texto",
  falta: "Falta",
};

export const ROTULO_CATEGORIA: Record<string, string> = {
  eletrica: "Elétrica",
  embalagem: "Embalagem",
  montagem: "Montagem",
  peca_faltante: "Peça faltante",
  transporte: "Transporte",
};

export const percentual = (v: number | null) =>
  v === null ? "—" : `${Math.round(v * 100)}%`;

export const dolar = (v: number) =>
  `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export interface RegraPergunta {
  familias?: string[];
  causaIds?: string[];
  causaCategorias?: string[];
}

export interface PerguntaAdmin {
  id: string;
  chave: string;
  categoria: string;
  texto: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
  exemplo: string;
  ordem: number;
  ativa: boolean;
  regras: RegraPergunta[];
  padrao: boolean;
}

export interface PerfilAdmin {
  versao: number;
  descricao: string;
  missao: string;
  valores: string;
  metas: string;
  tomDeVoz: string;
  dizer: string;
  evitar: string;
  assinatura: string;
  exemplos: { situacao: string; resposta: string }[];
  padrao: boolean;
  nota: string;
  publicadaEm: string;
  publicadaPorNome: string;
}

export interface RespostaPerfil {
  perfil: PerfilAdmin | null;
  versoes: {
    versao: number;
    publicadaEm: string;
    publicadaPorNome: string;
    padrao: boolean;
  }[];
}

export interface RespostaPerguntas {
  perguntas: PerguntaAdmin[];
  causas: { id: string; nome: string; categoria: string }[];
}

export const TIPOS: { valor: TipoPergunta; rotulo: string }[] = [
  { valor: "texto", rotulo: "Texto" },
  { valor: "escolha", rotulo: "Escolha" },
  { valor: "numero", rotulo: "Número" },
  { valor: "sim_nao", rotulo: "Sim ou não" },
  { valor: "foto", rotulo: "Foto" },
  { valor: "data", rotulo: "Data" },
];

/** "a, b ,c" vira ["a", "b", "c"]. */
export const listaDeTexto = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const aoContrario = (l: string[] | undefined) => (l ?? []).join(", ");

export async function chamarAdminIa(
  caminho: string,
  metodo: "GET" | "POST",
  corpo?: unknown,
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const r = await fetch(`/api/admin/ia${caminho}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = ((await r.json().catch(() => null)) ?? {}) as Record<
    string,
    unknown
  >;
  return { ok: r.ok, status: r.status, dados };
}

export const mensagemAdminIa = (
  r: { ok: boolean; status: number; dados: Record<string, unknown> },
  padrao = "Não foi possível agora. Tente de novo.",
) =>
  r.status === 403
    ? "Você não tem permissão para esta ação."
    : typeof r.dados.message === "string" && r.status === 400
      ? r.dados.message
      : padrao;
