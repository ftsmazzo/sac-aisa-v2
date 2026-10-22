import { custoTotal, diasEntre, type ReclamacaoLike, situacao } from "./base";
import { causaDe } from "./causas";

export type AlertTipo =
  | "AGUARDANDO_DIAS"
  | "TRATATIVA_META"
  | "CUSTO_ALTO"
  | "CAUSA_OUTROS"
  | "RASCUNHO_PENDENTE";

export interface AlertConfig {
  aguardandoDias: number;
  metaDias: number;
  custoAlto: number;
  outrosDias: number;
  rascunhoHoras: number;
}

/** Valores sugeridos pelo sistema atual; o dono ainda não validou. */
export const ALERT_CONFIG_PADRAO: AlertConfig = {
  aguardandoDias: 7,
  metaDias: 2,
  custoAlto: 500,
  outrosDias: 3,
  rascunhoHoras: 24,
};

export function avaliarAlertasReclamacao(
  r: ReclamacaoLike,
  cfg: AlertConfig = ALERT_CONFIG_PADRAO,
  hoje = new Date().toISOString().slice(0, 10),
): AlertTipo[] {
  const out: AlertTipo[] = [];
  const sit = situacao(r);
  const diasAberto = r.data ? diasEntre(r.data, hoje) : null;

  if (
    sit === "aguardando" &&
    diasAberto !== null &&
    diasAberto > cfg.aguardandoDias
  ) {
    out.push("AGUARDANDO_DIAS");
  }
  if (sit === "tratativa" && diasAberto !== null && diasAberto > cfg.metaDias) {
    out.push("TRATATIVA_META");
  }
  if (sit !== "resolvida" && custoTotal(r) >= cfg.custoAlto) {
    out.push("CUSTO_ALTO");
  }
  if (
    sit !== "resolvida" &&
    causaDe(r).id === "outros" &&
    diasAberto !== null &&
    diasAberto > cfg.outrosDias
  ) {
    out.push("CAUSA_OUTROS");
  }
  return out;
}

/** Rascunho capturado de um canal que ficou sem registro além do limite. */
export function rascunhoAtrasado(
  capturadoEm: Date,
  agora: Date = new Date(),
  cfg: AlertConfig = ALERT_CONFIG_PADRAO,
): boolean {
  return agora.getTime() - capturadoEm.getTime() > cfg.rascunhoHoras * 3600e3;
}
