import { cookies } from "next/headers";
import type { Estado, Situacao } from "@/lib/reclamacoes-formato";
import { urlDaApi } from "@/lib/sessao";

export interface ItemLista {
  id: string;
  numero: number;
  dataAbertura: string | null;
  dataAcao: string | null;
  situacao: Situacao;
  estado: Estado;
  /** Prazo do canal (AAAA-MM-DD); conta à parte e não pausa. */
  prazoMarketplace: string | null;
  devolucao: "NA" | "AGUARDANDO" | "RECEBIDO";
  marca: { id: string; nome: string } | null;
  canal: { id: string; nome: string };
  produto: { codigo: string; nome: string } | null;
  causa: { id: string; nome: string; categoria: string } | null;
  setorResp: { id: string; nome: string } | null;
  cidade: string;
  uf: string;
  resumo: string;
  custoTotal: number;
}

export interface Pagina {
  itens: ItemLista[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface TransicaoDisponivel {
  para: Estado;
  rotulo: string;
  reabertura: boolean;
  exigeMotivo: boolean;
  excepcional?: boolean;
}

/** Tempos em milissegundos, calculados pela API. */
export interface Relogios {
  porEstadoMs: Record<Estado, number>;
  /** Relógio interno: pausa em "Aguardando cliente". */
  internoMs: number;
  pausado: boolean;
  ateRecebimentoMs: number | null;
  ateRecebimentoEmCurso: boolean;
  tratativaMs: number;
  ateFinalizacaoMs: number | null;
  ateFinalizacaoEmCurso: boolean;
  marketplace: {
    prazo: string;
    diasRestantes: number;
    vencido: boolean;
    encerrado: boolean;
  } | null;
}

export interface Ficha extends ItemLista {
  estadoDesde: string;
  historicoEstados: { estado: Estado; quando: string }[];
  transicoes: TransicaoDisponivel[];
  relogios: Relogios;
  descricao: string;
  protocoloExterno: string | null;
  dataRecebimento: string | null;
  laudo: string;
  procedencia: string;
  solucao: string;
  respostaMarketplace: string;
  respostaEnviadaEm: string | null;
  acompanhamento: string;
  observacao: string;
  garantia: string;
  pedido: string;
  clienteNome: string;
  transportadora: string;
  peca: string;
  setorRespManual: boolean;
  /** Setor que a causa atual indica; pode diferir do responsável se alguém o trocou. */
  setorSugerido: { id: string; nome: string } | null;
  causaManual: boolean;
  rascunho: boolean;
  origemRegistro: string;
  criadoEm: string;
  alteradoEm: string;
  bancada: { id: string; codigo: string; nome: string } | null;
  custos: {
    freteEnvio: number;
    freteRetorno: number;
    valorPeca: number;
    estorno: number;
    desconto: number;
    guia: number;
  };
  causasExtras: { id: string; nome: string; categoria: string }[];
  analises: {
    id: string;
    setor: string;
    produtoPrecisaVoltar: boolean;
    produtoRecebidoEm: string | null;
    conclusao: string;
    resultado: string;
    criadoEm: string;
  }[];
  fotos: number;
}

export interface EventoLinha {
  id: string;
  tipo:
    | "entrada"
    | "triagem"
    | "encaminhamento"
    | "causa"
    | "analise"
    | "recebimento"
    | "solucao"
    | "resolucao"
    | "resposta"
    | "acompanhamento";
  quando: string;
  data: string | null;
  titulo: string;
  detalhe: string;
  autor: string | null;
}

export interface EtapaJornada {
  chave: string;
  rotulo: string;
  estado: "feita" | "atual" | "pendente" | "dispensada";
}

/** A jornada da reclamação: etapas, o passo seguinte e os eventos, do mais antigo ao mais novo. */
export interface LinhaDoTempo {
  eventos: EventoLinha[];
  etapas: EtapaJornada[];
  proximo: string | null;
}

export interface OpcoesFiltro {
  marcas: { id: string; nome: string }[];
  canais: { id: string; nome: string }[];
  setores: { id: string; nome: string }[];
  causas: { id: string; nome: string; categoria: string }[];
  bancadas: { id: string; codigo: string; nome: string }[];
}

export type RespostaApi<T> =
  | { ok: true; dados: T }
  | { ok: false; status: number; mensagem?: string };

/** Chama a API repassando o cookie da pessoa. Só no servidor. */
export async function buscarNaApi<T>(caminho: string): Promise<RespostaApi<T>> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) return { ok: false, status: 401 };
  try {
    const r = await fetch(`${urlDaApi()}${caminho}`, {
      headers: { cookie: `sac_sessao=${encodeURIComponent(token)}` },
      cache: "no-store",
    });
    if (!r.ok) {
      const corpo = (await r.json().catch(() => ({}))) as { message?: string };
      return { ok: false, status: r.status, mensagem: corpo.message };
    }
    return { ok: true, dados: (await r.json()) as T };
  } catch {
    return { ok: false, status: 502 };
  }
}
