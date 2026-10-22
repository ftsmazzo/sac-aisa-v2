import { ALERT_CONFIG_PADRAO, type Situacao } from "@sac-aisa/domain";
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

/** Status do ClickUp que corresponde à situação, pelo mapa invertido (o primeiro que aparece). */
export function statusDaSituacao(
  mapa: Record<string, unknown>,
  alvo: Situacao,
): string | null {
  for (const [status, s] of Object.entries(mapa)) if (s === alvo) return status;
  return null;
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
