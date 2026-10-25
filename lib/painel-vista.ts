/**
 * Recorte do painel no navegador. Os prazos já vêm calculados pela API;
 * aqui o clique só escolhe o que entra na conta.
 */

export interface ItemAberto {
  id: string;
  numero: number;
  abertura: string;
  estado: string;
  estadoDesde: string;
  setor: string;
  motivos: string[];
  horasAteAndamento: number | null;
  dias: number;
  faixa: "ate2" | "ate7" | "ate10" | "alem";
}

export interface MovimentoPainel {
  id: string;
  reclamacaoId: string;
  numero: number;
  quando: string;
  de: string | null;
  para: string;
  setor: string;
  reabertura: boolean;
}

export interface EntradaPainel {
  id: string;
  quando: string;
  setor: string;
}

export interface PainelBruto {
  hoje: string;
  geradoEm: string;
  cortado: boolean;
  abertos: ItemAberto[];
  movimentos: MovimentoPainel[];
  entradas: EntradaPainel[];
}

export type PeriodoDias = 7 | 30 | 90;

export interface FiltroPainel {
  periodoDias: PeriodoDias;
  setor: string | null;
  motivo: string | null;
  faixa: ItemAberto["faixa"] | null;
  estado: string | null;
}

export const FILTRO_INICIAL: FiltroPainel = {
  periodoDias: 30,
  setor: null,
  motivo: null,
  faixa: null,
  estado: null,
};

export const ROTULO_MOTIVO: Record<string, string> = {
  AGUARDANDO_DIAS: "Produto parado além de 7 dias",
  TRATATIVA_META: "Tratativa além de 2 dias",
  SEM_RECEBIMENTO_SETOR: "Setor não recebeu em 24 h",
  SOLUCAO_SEM_FINALIZACAO: "Solução parada no SAC",
  PRAZO_MARKETPLACE: "Prazo do marketplace",
};

export const ROTULO_FAIXA: Record<ItemAberto["faixa"], string> = {
  ate2: "Até 2 dias",
  ate7: "3 a 7 dias",
  ate10: "8 a 10 dias",
  alem: "Mais de 10 dias",
};

export const ROTULO_ESTADO: Record<string, string> = {
  triagem: "Triagem",
  aguardando_cliente: "Aguardando cliente",
  encaminhada: "Encaminhada ao setor",
  recebida: "Recebida pelo setor",
  em_tratativa: "Em tratativa",
  resolvida_setor: "Resolvida no setor técnico",
  finalizada: "Finalizada no SAC",
};

const ORDEM_FAIXA: ItemAberto["faixa"][] = ["ate2", "ate7", "ate10", "alem"];
const DIA_MS = 864e5;
const LIMITE_LINHA = 40;
const LIMITE_URGENTES = 8;

export function textoDuracao(horas: number): string {
  if (horas < 24) {
    const h = Math.max(1, Math.round(horas));
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  const dias = Math.round((horas / 24) * 10) / 10;
  const texto = dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return dias === 1 ? "1 dia" : `${texto} dias`;
}

function dentroDoPeriodo(iso: string, geradoEm: string, dias: number): boolean {
  const fim = Date.parse(geradoEm);
  const inicio = Date.parse(iso);
  return Number.isFinite(fim) && inicio >= fim - dias * DIA_MS && inicio <= fim;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  const v = s.length % 2 === 1 ? s[i] : ((s[i - 1] ?? 0) + (s[i] ?? 0)) / 2;
  return Math.round(v * 10) / 10;
}

export interface LinhaSetor {
  setor: string;
  abertas: number;
  fora: number;
  medianaHoras: number | null;
  amostra: number;
  semAndamento: number;
}

export interface VistaPainel {
  abertos: number;
  foraDoPrazo: number;
  porMotivo: { motivo: string; rotulo: string; total: number }[];
  porSetor: LinhaSetor[];
  faixas: { id: ItemAberto["faixa"]; rotulo: string; total: number }[];
  movimentos: MovimentoPainel[];
  entraram: number;
  fecharam: number;
  setorComMais: { setor: string; abertas: number } | null;
  setorMaisLento: {
    setor: string;
    medianaHoras: number;
    amostra: number;
  } | null;
  urgentes: ItemAberto[];
}

function passaAberto(item: ItemAberto, filtro: FiltroPainel): boolean {
  if (filtro.setor && item.setor !== filtro.setor) return false;
  if (filtro.motivo && !item.motivos.includes(filtro.motivo)) return false;
  if (filtro.faixa && item.faixa !== filtro.faixa) return false;
  if (filtro.estado && item.estado !== filtro.estado) return false;
  return true;
}

function restringeAoAberto(filtro: FiltroPainel): boolean {
  return Boolean(filtro.motivo || filtro.faixa || filtro.estado);
}

export function vistaDoPainel(
  bruto: PainelBruto,
  filtro: FiltroPainel,
): VistaPainel {
  const abertos = bruto.abertos.filter((item) => passaAberto(item, filtro));
  const ids = new Set(abertos.map((item) => item.id));
  const porSetor = new Map<string, LinhaSetor & { horas: number[] }>();
  const motivos = new Map<string, number>();
  const faixas = new Map<ItemAberto["faixa"], number>();
  for (const id of ORDEM_FAIXA) faixas.set(id, 0);

  for (const item of abertos) {
    const linha = porSetor.get(item.setor) ?? {
      setor: item.setor,
      abertas: 0,
      fora: 0,
      medianaHoras: null,
      amostra: 0,
      semAndamento: 0,
      horas: [],
    };
    linha.abertas += 1;
    if (item.motivos.length > 0) linha.fora += 1;
    if (item.estado === "encaminhada") linha.semAndamento += 1;
    if (item.horasAteAndamento !== null)
      linha.horas.push(item.horasAteAndamento);
    porSetor.set(item.setor, linha);
    for (const motivo of item.motivos) {
      motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
    }
    faixas.set(item.faixa, (faixas.get(item.faixa) ?? 0) + 1);
  }

  const setores = [...porSetor.values()]
    .map((linha) => ({
      setor: linha.setor,
      abertas: linha.abertas,
      fora: linha.fora,
      medianaHoras: mediana(linha.horas),
      amostra: linha.horas.length,
      semAndamento: linha.semAndamento,
    }))
    .sort((a, b) => {
      if (a.setor === "Sem setor") return 1;
      if (b.setor === "Sem setor") return -1;
      return b.abertas - a.abertas || a.setor.localeCompare(b.setor, "pt-BR");
    });

  const comMais = setores.find((s) => s.setor !== "Sem setor") ?? setores[0];
  const comAmostra = setores
    .filter((s) => s.medianaHoras !== null && s.setor !== "Sem setor")
    .sort(
      (a, b) =>
        (b.medianaHoras ?? 0) - (a.medianaHoras ?? 0) || b.amostra - a.amostra,
    )[0];

  const noRecorte = (quando: string, setor: string, id?: string) => {
    if (!dentroDoPeriodo(quando, bruto.geradoEm, filtro.periodoDias)) {
      return false;
    }
    if (filtro.setor && setor !== filtro.setor) return false;
    if (restringeAoAberto(filtro)) return id ? ids.has(id) : false;
    return true;
  };

  const movimentos = bruto.movimentos
    .filter((m) => noRecorte(m.quando, m.setor, m.reclamacaoId))
    .slice(0, LIMITE_LINHA);

  return {
    abertos: abertos.length,
    foraDoPrazo: abertos.filter((item) => item.motivos.length > 0).length,
    porMotivo: [...motivos.entries()]
      .map(([motivo, total]) => ({
        motivo,
        rotulo: ROTULO_MOTIVO[motivo] ?? motivo,
        total,
      }))
      .sort(
        (a, b) =>
          b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
      ),
    porSetor: setores,
    faixas: ORDEM_FAIXA.map((id) => ({
      id,
      rotulo: ROTULO_FAIXA[id],
      total: faixas.get(id) ?? 0,
    })),
    movimentos,
    entraram: bruto.entradas.filter((e) => noRecorte(e.quando, e.setor, e.id))
      .length,
    fecharam: bruto.movimentos.filter(
      (m) =>
        m.para === "finalizada" &&
        !m.reabertura &&
        noRecorte(m.quando, m.setor, m.reclamacaoId),
    ).length,
    setorComMais: comMais
      ? { setor: comMais.setor, abertas: comMais.abertas }
      : null,
    setorMaisLento:
      comAmostra && comAmostra.medianaHoras !== null
        ? {
            setor: comAmostra.setor,
            medianaHoras: comAmostra.medianaHoras,
            amostra: comAmostra.amostra,
          }
        : null,
    urgentes: abertos
      .filter((item) => item.motivos.length > 0)
      .sort((a, b) => b.dias - a.dias || a.numero - b.numero)
      .slice(0, LIMITE_URGENTES),
  };
}

export function fraseDoPainel(v: VistaPainel, periodo: number): string {
  if (v.abertos === 0) {
    return `Nenhuma reclamação aberta neste recorte. Nos últimos ${periodo} dias entraram ${v.entraram} e fecharam ${v.fecharam}.`;
  }
  const prazo =
    v.foraDoPrazo === 0
      ? "Nenhuma aberta está fora do prazo interno."
      : v.foraDoPrazo === 1
        ? "1 aberta está fora do prazo interno."
        : `${v.foraDoPrazo} abertas estão fora do prazo interno.`;
  const volume = v.setorComMais
    ? ` ${v.setorComMais.setor} concentra ${v.setorComMais.abertas} ${v.setorComMais.abertas === 1 ? "aberta" : "abertas"}.`
    : "";
  const lento = v.setorMaisLento
    ? ` ${v.setorMaisLento.setor} é quem mais demora a dar andamento: ${textoDuracao(v.setorMaisLento.medianaHoras)} na mediana, em ${v.setorMaisLento.amostra} ${v.setorMaisLento.amostra === 1 ? "caso" : "casos"}.`
    : "";
  return `${prazo}${volume}${lento} Nos últimos ${periodo} dias entraram ${v.entraram} e fecharam ${v.fecharam}.`;
}

export function diaDoMovimento(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function horaDoMovimento(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
