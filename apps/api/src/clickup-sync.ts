import {
  ALERT_CONFIG_PADRAO,
  type Devolucao,
  ESTADOS,
  type Estado,
  ehEstadoDoSetor,
  ROTULO_ESTADO,
  type Situacao,
  validarTransicao,
} from "@sac-aisa/domain";
import type { DadosAnalise, DadosCard } from "./clickup";

export type OrigemMudanca = "sac" | "clickup";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aguardando: "aguardando produto",
  tratativa: "em tratativa",
  resolvida: "resolvida",
};

type Rec = DadosCard["reclamacao"];

const DIA_MS = 86_400_000;

function corte(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Link da ficha no SAC; sem `WEB_BASE_URL` não há link. */
export function linkFicha(id: string, urlWeb?: string): string | null {
  if (!urlWeb) return null;
  return `${urlWeb.replace(/\/+$/, "")}/reclamacoes?ficha=${id}`;
}

// ---------- Mapa de estados ↔ status do card ----------

/**
 * Status do ClickUp que cada estado usa por padrão. O administrador troca na tela de integrações;
 * os nomes precisam existir na lista do ClickUp (o ClickUp recusa status que não conhece).
 */
export const MAPA_ESTADOS_PADRAO: Record<Estado, string> = {
  triagem: "triagem",
  aguardando_cliente: "aguardando cliente",
  encaminhada: "encaminhada ao setor",
  recebida: "recebida pelo setor",
  em_tratativa: "em tratativa",
  resolvida_setor: "resolvida no setor técnico",
  finalizada: "finalizada no sac",
};

/**
 * Nomes que o ClickUp já traz e que significam algo sem configurar nada. "Complete" é a
 * solução devolvida pelo setor técnico, nunca a finalização, que é do SAC.
 */
const APELIDOS: Record<string, Estado> = {
  complete: "resolvida_setor",
  closed: "resolvida_setor",
  "in progress": "em_tratativa",
};

const norm = (s: string) => s.trim().toLowerCase();

/** O mapa em vigor: o padrão com o que o administrador trocou por cima. */
export function mapaEstadosEfetivo(
  config: Record<string, unknown>,
): Record<Estado, string> {
  const m = config.mapaEstados;
  const salvo =
    typeof m === "object" && m !== null && !Array.isArray(m)
      ? (m as Record<string, unknown>)
      : {};
  const r = { ...MAPA_ESTADOS_PADRAO };
  for (const e of ESTADOS) {
    const v = salvo[e];
    if (typeof v === "string" && v.trim() !== "") r[e] = v.trim();
  }
  return r;
}

export function statusDoEstado(
  estado: Estado,
  mapa: Record<Estado, string>,
): string {
  return mapa[estado];
}

/** De status do ClickUp para estado: o mapa primeiro, depois os apelidos. Nome desconhecido dá null. */
export function estadoDoStatus(
  status: string,
  mapa: Record<Estado, string>,
): Estado | null {
  const s = norm(status);
  const achado = ESTADOS.find((e) => norm(mapa[e]) === s);
  return achado ?? APELIDOS[s] ?? null;
}

/** O caminho que o setor percorre; o ClickUp só anda para a frente por ele. */
const CAMINHO_DO_SETOR: readonly Estado[] = [
  "encaminhada",
  "recebida",
  "em_tratativa",
  "resolvida_setor",
];

export type DecisaoStatus =
  | { tipo: "ignorar" }
  | { tipo: "aplicar"; passos: Estado[] }
  | { tipo: "reverter"; motivo: string };

/**
 * Uma mudança do card no ClickUp só vale para os estados do setor (recebida, em tratativa,
 * resolvida no setor técnico), pelo caminho normal e com as mesmas regras do sistema.
 * Qualquer outra coisa é recusada e o card volta ao status do estado atual.
 */
export function decidirStatusExterno(
  atual: { estado: Estado; devolucao: Devolucao; temSetor: boolean },
  alvo: Estado | null,
): DecisaoStatus {
  // Status desconhecido, ou o eco da nossa própria atualização: nada a fazer.
  if (!alvo || alvo === atual.estado) return { tipo: "ignorar" };
  const reverter = (motivo: string): DecisaoStatus => ({
    tipo: "reverter",
    motivo,
  });
  if (!ehEstadoDoSetor(alvo)) {
    return reverter(
      `"${ROTULO_ESTADO[alvo]}" é um estado do SAC; o ClickUp só move o card para estados do setor.`,
    );
  }
  const de = CAMINHO_DO_SETOR.indexOf(atual.estado);
  const para = CAMINHO_DO_SETOR.indexOf(alvo);
  if (de < 0) {
    return reverter(
      `A reclamação está em "${ROTULO_ESTADO[atual.estado]}": o setor ainda não pode mexer nela.`,
    );
  }
  if (para <= de) {
    return reverter(
      `O setor não volta de "${ROTULO_ESTADO[atual.estado]}" para "${ROTULO_ESTADO[alvo]}".`,
    );
  }
  const passos: Estado[] = [];
  let cursor = atual.estado;
  for (const proximo of CAMINHO_DO_SETOR.slice(de + 1, para + 1)) {
    const v = validarTransicao({
      perfil: "responsavel_setor",
      de: cursor,
      para: proximo,
      devolucao: atual.devolucao,
      temSetor: atual.temSetor,
    });
    if (!v.ok) return reverter(v.mensagem);
    passos.push(proximo);
    cursor = proximo;
  }
  return { tipo: "aplicar", passos };
}

function diaMais(iso: string, dias: number): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d) + dias * DIA_MS;
}

/** Prazo do card: a meta de dias da tratativa (ou o limite de espera pelo produto) a partir da abertura. */
export function prazoDoCard(r: Rec): { iso: string; ms: number } {
  const dias =
    r.situacao === "aguardando"
      ? ALERT_CONFIG_PADRAO.aguardandoDias
      : ALERT_CONFIG_PADRAO.metaDias;
  const ms = diaMais(r.dataAbertura, dias);
  return { iso: new Date(ms).toISOString().slice(0, 10), ms };
}

/** Prioridade do ClickUp: 1 urgente, 2 alta, 3 normal, 4 baixa. Resolvida é baixa; prazo vencido, urgente; custo alto, alta. */
export function prioridadeDoCard(r: Rec, hoje: string): number {
  if (r.situacao === "resolvida") return 4;
  if (hoje > prazoDoCard(r).iso) return 1;
  if (r.custoTotal > ALERT_CONFIG_PADRAO.custoAlto) return 2;
  return 3;
}

export function comentarioAnalise(
  a: DadosAnalise,
  criando: boolean,
  link: string | null,
): string {
  const retorno = a.produtoPrecisaVoltar
    ? a.produtoRecebidoEm
      ? `Produto precisa voltar; recebido em ${a.produtoRecebidoEm}.`
      : "Produto precisa voltar; ainda não chegou."
    : "Produto não precisa voltar.";
  return [
    `Análise do setor ${a.setorNome} ${criando ? "registrada" : "alterada"} (reclamação #${a.numero}).`,
    retorno,
    a.conclusao && `Conclusão: ${corte(a.conclusao, 400)}`,
    a.resultado && `Resultado: ${corte(a.resultado, 400)}`,
    link && `Ficha: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function comentarioDevolucao(
  numero: number,
  link: string | null,
): string {
  return [
    `Devolução recebida (reclamação #${numero}): o produto chegou.`,
    link && `Ficha: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
}
