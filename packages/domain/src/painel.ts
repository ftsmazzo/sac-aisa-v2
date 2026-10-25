import {
  ALERT_CONFIG_PADRAO,
  type AlertConfig,
  type AlertTipo,
  avaliarAlertasReclamacao,
} from "./alertas";
import { diasEntre, type ReclamacaoLike } from "./base";

/**
 * Prazos que mudam a decisão do SAC. Custo alto e causa sem classe
 * continuam alerta, mas não entram como "fora do prazo".
 */
export const MOTIVOS_DE_PRAZO = [
  "AGUARDANDO_DIAS",
  "TRATATIVA_META",
  "SEM_RECEBIMENTO_SETOR",
  "SOLUCAO_SEM_FINALIZACAO",
  "PRAZO_MARKETPLACE",
] as const satisfies readonly AlertTipo[];

export type MotivoPrazo = (typeof MOTIVOS_DE_PRAZO)[number];

export function motivosDePrazo(
  r: ReclamacaoLike,
  hoje: string,
  agora: Date = new Date(),
  cfg: AlertConfig = ALERT_CONFIG_PADRAO,
): MotivoPrazo[] {
  const lista = avaliarAlertasReclamacao(r, cfg, hoje, agora);
  return lista.filter((m): m is MotivoPrazo =>
    (MOTIVOS_DE_PRAZO as readonly string[]).includes(m),
  );
}

export interface MarcoEstado {
  para: string;
  quando: string;
}

/**
 * Horas da primeira encaminhada até a primeira recebida ou tratativa.
 * Sem os dois marcos, o setor ainda não deu andamento.
 */
export function horasAteAndamento(
  marcos: readonly MarcoEstado[],
): number | null {
  const inicio = marcos.find((m) => m.para === "encaminhada");
  const fim = marcos.find(
    (m) => m.para === "recebida" || m.para === "em_tratativa",
  );
  if (!inicio || !fim) return null;
  const ms = Date.parse(fim.quando) - Date.parse(inicio.quando);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 3600e3) * 10) / 10;
}

/** Mediana. A média esconde a cauda de casos lentos. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  const v = s.length % 2 === 1 ? s[i] : ((s[i - 1] ?? 0) + (s[i] ?? 0)) / 2;
  return Math.round(v * 10) / 10;
}

export function diasEmAberto(abertura: string, hoje: string): number {
  return Math.max(0, diasEntre(abertura, hoje) ?? 0);
}

export type FaixaIdade = "ate2" | "ate7" | "ate10" | "alem";

/**
 * 2 dias: meta interna de tratativa.
 * 7 dias: alerta de produto parado.
 * 10 dias: prazo de resposta do Consumidor.gov.br.
 */
export function faixaDeIdade(dias: number): FaixaIdade {
  if (dias <= 2) return "ate2";
  if (dias <= 7) return "ate7";
  if (dias <= 10) return "ate10";
  return "alem";
}
