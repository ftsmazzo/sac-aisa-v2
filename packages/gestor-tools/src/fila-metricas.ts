import {
  diasEmAberto,
  ESTADOS_NA_FILA_DO_SETOR,
  type FaixaIdade,
  faixaDeIdade,
  mediana,
} from "@sac-aisa/domain";

export type LinhaFilaGestor = {
  estado: string;
  dataAbertura: Date | string;
  estadoDesde: Date | string;
  setorNome: string | null;
};

export type ItemFilaSetor = {
  setor: string;
  encaminhada: number;
  recebida: number;
  em_tratativa: number;
  total: number;
  dias_medio: number | null;
  dias_max: number;
};

export type PendenteSac = {
  total: number;
  triagem: number;
  aguardando_cliente: number;
  dias_medio_parado: number | null;
  dias_mediana_parado: number | null;
  dias_max_parado: number;
  faixas: Record<FaixaIdade, number>;
  significado: string;
};

function ymd(v: Date | string): string {
  if (typeof v === "string") {
    return v.slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(v);
}

export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

export function ehEstadoFilaSetor(estado: string): boolean {
  return (ESTADOS_NA_FILA_DO_SETOR as readonly string[]).includes(estado);
}

/** Ainda com o SAC: triagem (não iniciou/encaminhou) ou aguardando cliente. */
export function ehPendenteSac(estado: string): boolean {
  return estado === "triagem" || estado === "aguardando_cliente";
}

export function agregarFilaSetor(
  linhas: LinhaFilaGestor[],
  hoje: string,
  filtroSetor?: (nome: string) => boolean,
): ItemFilaSetor[] {
  type Acc = {
    encaminhada: number;
    recebida: number;
    em_tratativa: number;
    dias: number[];
  };
  const map = new Map<string, Acc>();

  for (const r of linhas) {
    if (!ehEstadoFilaSetor(r.estado) || !r.setorNome) continue;
    if (filtroSetor && !filtroSetor(r.setorNome)) continue;
    const slot = map.get(r.setorNome) || {
      encaminhada: 0,
      recebida: 0,
      em_tratativa: 0,
      dias: [],
    };
    if (r.estado === "encaminhada") slot.encaminhada++;
    else if (r.estado === "recebida") slot.recebida++;
    else slot.em_tratativa++;
    slot.dias.push(diasEmAberto(ymd(r.dataAbertura), hoje));
    map.set(r.setorNome, slot);
  }

  return [...map.entries()]
    .map(([setor, v]) => {
      const total = v.encaminhada + v.recebida + v.em_tratativa;
      const soma = v.dias.reduce((a, d) => a + d, 0);
      return {
        setor,
        encaminhada: v.encaminhada,
        recebida: v.recebida,
        em_tratativa: v.em_tratativa,
        total,
        dias_medio:
          v.dias.length > 0
            ? Math.round((soma / v.dias.length) * 10) / 10
            : null,
        dias_max: v.dias.length ? Math.max(...v.dias) : 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.setor.localeCompare(b.setor));
}

export function agregarPendenteSac(
  linhas: LinhaFilaGestor[],
  hoje: string,
): PendenteSac {
  const faixas: Record<FaixaIdade, number> = {
    ate2: 0,
    ate7: 0,
    ate10: 0,
    alem: 0,
  };
  let triagem = 0;
  let aguardando_cliente = 0;
  const dias: number[] = [];

  for (const r of linhas) {
    if (!ehPendenteSac(r.estado)) continue;
    if (r.estado === "triagem") triagem++;
    else aguardando_cliente++;
    // Tempo parado no SAC: desde que entrou no estado atual (estadoDesde).
    const d = diasEmAberto(ymd(r.estadoDesde), hoje);
    dias.push(d);
    faixas[faixaDeIdade(d)]++;
  }

  const soma = dias.reduce((a, d) => a + d, 0);
  return {
    total: dias.length,
    triagem,
    aguardando_cliente,
    dias_medio_parado:
      dias.length > 0 ? Math.round((soma / dias.length) * 10) / 10 : null,
    dias_mediana_parado: mediana(dias),
    dias_max_parado: dias.length ? Math.max(...dias) : 0,
    faixas,
    significado:
      "Backlog do SAC (ainda não encaminhado ao setor). Não é fila de setor nem “(sem setor)”.",
  };
}
