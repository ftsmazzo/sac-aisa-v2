/** Formatação de tempo e de prazo da jornada. Funções puras, sem dependência de servidor. */

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Milissegundos em texto curto: "2 d 3 h", "5 h 10 min", "45 min". Negativo vale zero. */
export function formatarDuracao(ms: number): string {
  const v = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (v < MIN) return v === 0 ? "0 min" : "menos de 1 min";
  const dias = Math.floor(v / DIA);
  const horas = Math.floor((v % DIA) / HORA);
  const min = Math.floor((v % HORA) / MIN);
  if (dias > 0) return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  if (horas > 0) return min > 0 ? `${horas} h ${min} min` : `${horas} h`;
  return `${min} min`;
}

export interface PrazoMarketplace {
  prazo: string;
  diasRestantes: number;
  vencido: boolean;
  encerrado: boolean;
}

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** "vence em 2 dias", "vence hoje", "estourou há 1 dia" ou "encerrado". */
export function formatarPrazo(p: PrazoMarketplace): string {
  if (p.encerrado) return "encerrado";
  if (p.vencido || p.diasRestantes < 0) {
    return `estourou há ${dias(Math.abs(p.diasRestantes))}`;
  }
  if (p.diasRestantes === 0) return "vence hoje";
  return `vence em ${dias(p.diasRestantes)}`;
}
