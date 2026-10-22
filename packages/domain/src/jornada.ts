import type { Devolucao, ReclamacaoLike } from "./base";
import { devDe } from "./base";
import type { Perfil } from "./permissoes";

/**
 * Jornada da reclamação: da triagem do SAC à finalização. O SAC cuida do começo e do fim;
 * o setor técnico cuida do meio. Reabertura é um evento (volta a "encaminhada"), não um estado.
 */
export const ESTADOS = [
  "triagem",
  "aguardando_cliente",
  "encaminhada",
  "recebida",
  "em_tratativa",
  "resolvida_setor",
  "finalizada",
] as const;

export type Estado = (typeof ESTADOS)[number];

export const ROTULO_ESTADO: Record<Estado, string> = {
  triagem: "Triagem",
  aguardando_cliente: "Aguardando cliente",
  encaminhada: "Encaminhada ao setor",
  recebida: "Recebida pelo setor",
  em_tratativa: "Em tratativa",
  resolvida_setor: "Resolvida no setor técnico",
  finalizada: "Finalizada no SAC",
};

export function ehEstado(v: unknown): v is Estado {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v);
}

/** Estados que só o setor técnico assume. Só eles valem quando o card muda no ClickUp. */
export const ESTADOS_DO_SETOR: readonly Estado[] = [
  "recebida",
  "em_tratativa",
  "resolvida_setor",
];

/** Estados em que a reclamação está com o setor: entram na fila do setor. */
export const ESTADOS_NA_FILA_DO_SETOR: readonly Estado[] = [
  "encaminhada",
  "recebida",
  "em_tratativa",
];

export const ehEstadoDoSetor = (e: Estado) => ESTADOS_DO_SETOR.includes(e);

/** Em aberto = ainda não finalizada pelo SAC. */
export const estadoAberto = (e: Estado) => e !== "finalizada";

/** Quem age: o SAC (operação), o setor (responsável) ou quem pode tudo (gestor e administrador). */
export type PapelJornada = "sac" | "setor" | "total";

export function papelDe(perfil: Perfil): PapelJornada {
  if (perfil === "operacao") return "sac";
  if (perfil === "responsavel_setor") return "setor";
  return "total";
}

interface Aresta {
  de: Estado;
  para: Estado;
  papel: "sac" | "setor";
}

/** O fluxo normal. Quem não é gestor nem administrador só faz o que está aqui. */
export const ARESTAS: readonly Aresta[] = [
  { de: "triagem", para: "aguardando_cliente", papel: "sac" },
  { de: "aguardando_cliente", para: "triagem", papel: "sac" },
  { de: "triagem", para: "encaminhada", papel: "sac" },
  { de: "aguardando_cliente", para: "encaminhada", papel: "sac" },
  { de: "encaminhada", para: "recebida", papel: "setor" },
  { de: "recebida", para: "em_tratativa", papel: "setor" },
  { de: "em_tratativa", para: "resolvida_setor", papel: "setor" },
  { de: "resolvida_setor", para: "finalizada", papel: "sac" },
];

/** Reabrir volta para "encaminhada" e exige motivo. Só o SAC (e quem pode tudo) reabre. */
export const ESTADOS_REABRIVEIS: readonly Estado[] = [
  "resolvida_setor",
  "finalizada",
];
const PAPEL_REABRE: readonly PapelJornada[] = ["sac", "total"];

export const ehReabertura = (de: Estado, para: Estado) =>
  para === "encaminhada" && ESTADOS_REABRIVEIS.includes(de);

const aresta = (de: Estado, para: Estado) =>
  ARESTAS.find((a) => a.de === de && a.para === para);

/** Matriz de quem pode cada transição. Quem pode tudo ("total") entra em todas, com motivo fora do fluxo. */
export function quemPodeTransicionar(de: Estado, para: Estado): PapelJornada[] {
  if (de === para) return [];
  const papeis: PapelJornada[] = [];
  const a = aresta(de, para);
  if (a) papeis.push(a.papel);
  if (ehReabertura(de, para)) papeis.push("sac");
  papeis.push("total");
  return papeis;
}

export const MOTIVO_MAX = 200;

export type CodigoTransicao =
  | "igual"
  | "invalida"
  | "sem_permissao"
  | "motivo"
  | "sem_setor"
  | "produto_nao_recebido";

export interface PedidoTransicao {
  perfil: Perfil;
  de: Estado;
  para: Estado;
  motivo?: string | null;
  devolucao: Devolucao | string | null;
  temSetor: boolean;
}

export type ResultadoTransicao =
  | { ok: true; reabertura: boolean; excecao: boolean }
  | { ok: false; codigo: CodigoTransicao; mensagem: string };

const recusa = (
  codigo: CodigoTransicao,
  mensagem: string,
): ResultadoTransicao => ({ ok: false, codigo, mensagem });

/** Regra pura da transição: matriz de papéis, motivo, setor definido e produto recebido. */
export function validarTransicao(p: PedidoTransicao): ResultadoTransicao {
  if (p.de === p.para) {
    return recusa("igual", `A reclamação já está em "${ROTULO_ESTADO[p.de]}".`);
  }
  const papel = papelDe(p.perfil);
  const normal = aresta(p.de, p.para);
  const reabertura = ehReabertura(p.de, p.para);

  if (papel !== "total") {
    const permitida =
      (normal && normal.papel === papel) ||
      (reabertura && PAPEL_REABRE.includes(papel));
    if (!permitida) {
      return normal || reabertura
        ? recusa(
            "sem_permissao",
            "Seu perfil não faz essa mudança de estado nesta etapa.",
          )
        : recusa(
            "invalida",
            `Não há passagem de "${ROTULO_ESTADO[p.de]}" para "${ROTULO_ESTADO[p.para]}".`,
          );
    }
  }

  const excecao = !normal || reabertura;
  const motivo = (p.motivo ?? "").trim();
  if (motivo.length > MOTIVO_MAX) {
    return recusa("motivo", `O motivo passa de ${MOTIVO_MAX} caracteres.`);
  }
  if ((reabertura || (papel === "total" && excecao)) && motivo === "") {
    return recusa(
      "motivo",
      reabertura
        ? "Informe o motivo da reabertura."
        : "Informe o motivo desta mudança fora do fluxo.",
    );
  }

  if (p.para === "encaminhada" && !p.temSetor) {
    return recusa(
      "sem_setor",
      "Defina o setor responsável antes de encaminhar.",
    );
  }
  // Tratativa só depois do produto recebido, ou sem devolução.
  if (
    (p.para === "em_tratativa" ||
      p.para === "resolvida_setor" ||
      p.para === "finalizada") &&
    devDe({ devolucao: p.devolucao }) === "AGUARDANDO"
  ) {
    return recusa(
      "produto_nao_recebido",
      "O produto ainda não foi recebido: registre o recebimento antes.",
    );
  }
  return { ok: true, reabertura, excecao };
}

export interface OpcaoTransicao {
  para: Estado;
  rotulo: string;
  reabertura: boolean;
  /** A pessoa precisa informar o motivo. */
  exigeMotivo: boolean;
}

/** Os próximos estados que o perfil pode escolher a partir de `de` (a tela mostra só estes). */
export function transicoesPermitidas(
  perfil: Perfil,
  de: Estado,
): OpcaoTransicao[] {
  const papel = papelDe(perfil);
  const saida: OpcaoTransicao[] = [];
  for (const para of ESTADOS) {
    if (para === de) continue;
    const reabertura = ehReabertura(de, para);
    const normal = aresta(de, para);
    const permitida =
      papel === "total" ||
      (normal && normal.papel === papel) ||
      (reabertura && PAPEL_REABRE.includes(papel));
    if (!permitida) continue;
    saida.push({
      para,
      rotulo: ROTULO_ESTADO[para],
      reabertura,
      exigeMotivo: reabertura || (papel === "total" && !normal),
    });
  }
  return saida;
}

/**
 * Estado dos dados que ainda não tinham jornada (migração e importação). Com data de ação,
 * a reclamação já estava resolvida e passa a finalizada; aguardando produto fica recebida pelo
 * setor; o resto está em tratativa. Rascunho vira triagem.
 */
export function estadoDaSituacaoLegada(
  r: Pick<ReclamacaoLike, "dataAcao" | "devolucao"> & {
    rascunho?: boolean | null;
  },
): Estado {
  if (r.rascunho) return "triagem";
  if (r.dataAcao) return "finalizada";
  return devDe(r) === "AGUARDANDO" ? "recebida" : "em_tratativa";
}
