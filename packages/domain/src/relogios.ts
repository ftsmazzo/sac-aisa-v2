import { diasEntre } from "./base";
import { ESTADOS, type Estado } from "./jornada";

/** Uma passagem da reclamação por um estado. A lista vem do histórico de estados. */
export interface PassoHistorico {
  estado: Estado;
  quando: Date | string;
}

export interface PrazoMarketplace {
  /** Data limite do canal (AAAA-MM-DD). */
  prazo: string;
  /** Dias até o prazo; negativo = estourado. Parado na data da finalização, se já finalizada. */
  diasRestantes: number;
  vencido: boolean;
  /** A reclamação já foi finalizada: o prazo deixa de contar. */
  encerrado: boolean;
}

export interface Relogios {
  /** Tempo acumulado em cada estado, em ms. Reaberta soma as passagens. */
  porEstadoMs: Record<Estado, number>;
  /** Tempo corrido até agora (ou até finalizar) sem contar "aguardando cliente". */
  internoMs: number;
  /** O relógio interno está parado: a reclamação espera o cliente. */
  pausado: boolean;
  /** Da última encaminhada até o setor receber. */
  ateRecebimentoMs: number | null;
  ateRecebimentoEmCurso: boolean;
  /** Tempo em "em tratativa". */
  tratativaMs: number;
  /** Do retorno do setor técnico até o SAC finalizar. */
  ateFinalizacaoMs: number | null;
  ateFinalizacaoEmCurso: boolean;
  /** O prazo do marketplace corre separado: não pausa em "aguardando cliente". */
  marketplace: PrazoMarketplace | null;
}

const ms = (q: Date | string) =>
  (q instanceof Date ? q : new Date(q)).getTime();

export function zerarPorEstado(): Record<Estado, number> {
  return Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<
    Estado,
    number
  >;
}

/**
 * Calcula os relógios a partir do histórico de estados. Função pura: recebe o "agora" e a
 * data de hoje, não lê relógio nem banco. O relógio interno pausa em "aguardando cliente";
 * o prazo do marketplace é outra conta, em dias corridos, e não pausa.
 */
export function calcularRelogios(args: {
  historico: PassoHistorico[];
  agora: Date;
  /** Data de hoje (AAAA-MM-DD, Brasília), para o prazo do marketplace. */
  hoje: string;
  prazoMarketplace?: string | null;
}): Relogios {
  const passos = args.historico
    .filter((p) => !Number.isNaN(ms(p.quando)))
    .sort((a, b) => ms(a.quando) - ms(b.quando));
  const agora = args.agora.getTime();
  const porEstadoMs = zerarPorEstado();
  let internoMs = 0;

  passos.forEach((p, i) => {
    // Finalizada é ponto de chegada: o tempo depois dela não conta em nada.
    if (p.estado === "finalizada") return;
    const fim = i + 1 < passos.length ? ms(passos[i + 1].quando) : agora;
    const dur = Math.max(0, fim - ms(p.quando));
    porEstadoMs[p.estado] += dur;
    if (p.estado !== "aguardando_cliente") internoMs += dur;
  });

  const ultimo = passos.at(-1);
  const estadoAtual = ultimo?.estado ?? null;

  const ultimoIndice = (estado: Estado) =>
    passos.map((p) => p.estado).lastIndexOf(estado);
  const primeiroDepois = (de: number, estado: Estado) =>
    passos.slice(de + 1).find((p) => p.estado === estado);

  let ateRecebimentoMs: number | null = null;
  let ateRecebimentoEmCurso = false;
  const enc = ultimoIndice("encaminhada");
  if (enc >= 0) {
    const rec = primeiroDepois(enc, "recebida");
    if (rec) {
      ateRecebimentoMs = Math.max(0, ms(rec.quando) - ms(passos[enc].quando));
    } else if (estadoAtual === "encaminhada") {
      ateRecebimentoMs = Math.max(0, agora - ms(passos[enc].quando));
      ateRecebimentoEmCurso = true;
    }
  }

  let ateFinalizacaoMs: number | null = null;
  let ateFinalizacaoEmCurso = false;
  const res = ultimoIndice("resolvida_setor");
  if (res >= 0) {
    const fin = primeiroDepois(res, "finalizada");
    if (fin) {
      ateFinalizacaoMs = Math.max(0, ms(fin.quando) - ms(passos[res].quando));
    } else if (estadoAtual === "resolvida_setor") {
      ateFinalizacaoMs = Math.max(0, agora - ms(passos[res].quando));
      ateFinalizacaoEmCurso = true;
    }
  }

  let marketplace: PrazoMarketplace | null = null;
  if (args.prazoMarketplace) {
    const encerrado = estadoAtual === "finalizada";
    const ref =
      encerrado && ultimo
        ? new Date(ms(ultimo.quando)).toISOString().slice(0, 10)
        : args.hoje;
    const dias = diasEntre(ref, args.prazoMarketplace) ?? 0;
    marketplace = {
      prazo: args.prazoMarketplace,
      diasRestantes: dias,
      vencido: dias < 0,
      encerrado,
    };
  }

  return {
    porEstadoMs,
    internoMs,
    pausado: estadoAtual === "aguardando_cliente",
    ateRecebimentoMs,
    ateRecebimentoEmCurso,
    tratativaMs: porEstadoMs.em_tratativa,
    ateFinalizacaoMs,
    ateFinalizacaoEmCurso,
    marketplace,
  };
}
