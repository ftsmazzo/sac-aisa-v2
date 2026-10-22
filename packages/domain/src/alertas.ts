import { custoTotal, diasEntre, type ReclamacaoLike, situacao } from "./base";
import { causaDe } from "./causas";

export type AlertTipo =
  | "AGUARDANDO_DIAS"
  | "TRATATIVA_META"
  | "CUSTO_ALTO"
  | "CAUSA_OUTROS"
  | "RASCUNHO_PENDENTE"
  | "SEM_RECEBIMENTO_SETOR"
  | "SOLUCAO_SEM_FINALIZACAO"
  | "PRAZO_MARKETPLACE";

export interface AlertConfig {
  aguardandoDias: number;
  metaDias: number;
  custoAlto: number;
  outrosDias: number;
  rascunhoHoras: number;
  /** Encaminhada e o setor ainda não recebeu. */
  recebimentoHoras: number;
  /** O setor devolveu a solução e o SAC ainda não finalizou. */
  finalizacaoHoras: number;
  /** Avisa quando faltam até estes dias para o prazo do marketplace (ou já passou). */
  prazoMarketplaceDias: number;
}

/** Valores sugeridos pelo sistema atual; o dono ainda não validou. */
export const ALERT_CONFIG_PADRAO: AlertConfig = {
  aguardandoDias: 7,
  metaDias: 2,
  custoAlto: 500,
  outrosDias: 3,
  rascunhoHoras: 24,
  recebimentoHoras: 24,
  finalizacaoHoras: 24,
  prazoMarketplaceDias: 1,
};

const HORA_MS = 3600e3;

/** Em aberto para o SAC: sem estado, vale a data de ação; com estado, só a finalização fecha. */
function emAberto(r: ReclamacaoLike): boolean {
  return r.estado ? r.estado !== "finalizada" : situacao(r) !== "resolvida";
}

export function avaliarAlertasReclamacao(
  r: ReclamacaoLike,
  cfg: AlertConfig = ALERT_CONFIG_PADRAO,
  hoje = new Date().toISOString().slice(0, 10),
  agora: Date = new Date(),
): AlertTipo[] {
  const out: AlertTipo[] = [];
  const sit = situacao(r);
  const diasAberto = r.data ? diasEntre(r.data, hoje) : null;
  const aberta = emAberto(r);
  const horasNoEstado = r.estadoDesde
    ? (agora.getTime() - new Date(r.estadoDesde).getTime()) / HORA_MS
    : null;

  if (
    sit === "aguardando" &&
    diasAberto !== null &&
    diasAberto > cfg.aguardandoDias
  ) {
    out.push("AGUARDANDO_DIAS");
  }
  // Esperar o cliente pausa o relógio interno: não conta como tratativa parada.
  if (
    sit === "tratativa" &&
    r.estado !== "aguardando_cliente" &&
    diasAberto !== null &&
    diasAberto > cfg.metaDias
  ) {
    out.push("TRATATIVA_META");
  }
  if (aberta && custoTotal(r) >= cfg.custoAlto) {
    out.push("CUSTO_ALTO");
  }
  if (
    aberta &&
    causaDe(r).id === "outros" &&
    diasAberto !== null &&
    diasAberto > cfg.outrosDias
  ) {
    out.push("CAUSA_OUTROS");
  }
  if (
    r.estado === "encaminhada" &&
    horasNoEstado !== null &&
    horasNoEstado > cfg.recebimentoHoras
  ) {
    out.push("SEM_RECEBIMENTO_SETOR");
  }
  if (
    r.estado === "resolvida_setor" &&
    horasNoEstado !== null &&
    horasNoEstado > cfg.finalizacaoHoras
  ) {
    out.push("SOLUCAO_SEM_FINALIZACAO");
  }
  // O prazo do marketplace corre mesmo com o cliente em espera.
  if (aberta && r.prazoMarketplace) {
    const restam = diasEntre(hoje, r.prazoMarketplace);
    if (restam !== null && restam <= cfg.prazoMarketplaceDias) {
      out.push("PRAZO_MARKETPLACE");
    }
  }
  return out;
}

export const ROTULO_ALERTA: Record<AlertTipo, string> = {
  AGUARDANDO_DIAS: "Produto demora a chegar",
  TRATATIVA_META: "Tratativa além da meta",
  CUSTO_ALTO: "Custo alto",
  CAUSA_OUTROS: "Causa sem classificação",
  RASCUNHO_PENDENTE: "Rascunho parado",
  SEM_RECEBIMENTO_SETOR: "Setor ainda não recebeu",
  SOLUCAO_SEM_FINALIZACAO: "Solução devolvida sem finalização",
  PRAZO_MARKETPLACE: "Prazo do marketplace",
};

export interface Urgencia {
  alertas: AlertTipo[];
  dias: number;
  custo: number;
}

/** Quanto a reclamação pede atenção: alertas disparados, dias em aberto e custo. */
export function urgenciaDe(
  r: ReclamacaoLike,
  cfg: AlertConfig = ALERT_CONFIG_PADRAO,
  hoje = new Date().toISOString().slice(0, 10),
  agora: Date = new Date(),
): Urgencia {
  return {
    alertas: avaliarAlertasReclamacao(r, cfg, hoje, agora),
    dias: (r.data ? diasEntre(r.data, hoje) : null) ?? 0,
    custo: custoTotal(r),
  };
}

/** Ordem da fila: mais alertas, depois mais dias em aberto, depois maior custo. */
export function compararUrgencia(a: Urgencia, b: Urgencia): number {
  return (
    b.alertas.length - a.alertas.length || b.dias - a.dias || b.custo - a.custo
  );
}

/** Rascunho capturado de um canal que ficou sem registro além do limite. */
export function rascunhoAtrasado(
  capturadoEm: Date,
  agora: Date = new Date(),
  cfg: AlertConfig = ALERT_CONFIG_PADRAO,
): boolean {
  return agora.getTime() - capturadoEm.getTime() > cfg.rascunhoHoras * 3600e3;
}
