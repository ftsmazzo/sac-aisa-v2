/**
 * Lógica pura do formulário de solução do setor responsável: causa final, laudo, solução,
 * procedência, garantia, peça, custo e a data de ação, que resolve a reclamação.
 * Quem confere a permissão e o escopo é a API.
 */

export const CAMPOS_CUSTO = [
  ["freteEnvio", "Frete de envio"],
  ["freteRetorno", "Frete de retorno"],
  ["valorPeca", "Peça"],
  ["estorno", "Estorno"],
  ["desconto", "Desconto"],
  ["guia", "Guia"],
] as const;
export type CampoCusto = (typeof CAMPOS_CUSTO)[number][0];

export interface ValoresSolucao {
  /** Vazio = manter a causa sugerida pelo texto. */
  causaId: string;
  laudo: string;
  solucao: string;
  procedencia: string;
  garantia: string;
  peca: string;
  dataAcao: string;
  custos: Record<CampoCusto, string>;
}

/** O que a ficha tem do trabalho do setor, no formato da API de leitura. */
export interface FichaDoSetor {
  causa: { id: string } | null;
  causaManual: boolean;
  laudo: string;
  solucao: string;
  procedencia: string;
  garantia: string;
  peca: string;
  dataAcao: string | null;
  custos: Record<CampoCusto, number>;
}

const TEXTOS = ["laudo", "solucao", "procedencia", "garantia", "peca"] as const;

/** "1.234,56", "12,5" e "12.5" viram número. Vazio vale zero; lixo devolve null. */
export function paraNumero(s: string): number | null {
  const t = s.replace(/R\$|\s/g, "");
  if (t === "") return 0;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Number(normal);
}

const comoTexto = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

export function valoresDaSolucao(f: FichaDoSetor): ValoresSolucao {
  return {
    // Só aparece escolhida quando alguém a definiu; senão vale a sugerida pelo texto.
    causaId: f.causaManual ? (f.causa?.id ?? "") : "",
    laudo: f.laudo,
    solucao: f.solucao,
    procedencia: f.procedencia,
    garantia: f.garantia,
    peca: f.peca,
    dataAcao: f.dataAcao ?? "",
    custos: {
      freteEnvio: comoTexto(f.custos.freteEnvio),
      freteRetorno: comoTexto(f.custos.freteRetorno),
      valorPeca: comoTexto(f.custos.valorPeca),
      estorno: comoTexto(f.custos.estorno),
      desconto: comoTexto(f.custos.desconto),
      guia: comoTexto(f.custos.guia),
    },
  };
}

export type CorpoOuErro =
  | { ok: true; corpo: Record<string, unknown> }
  | { ok: false; mensagem: string };

/** Leva só o que mudou. Causa vazia volta para a sugerida; data vazia reabre a reclamação. */
export function montarCorpoSolucao(
  v: ValoresSolucao,
  inicial: ValoresSolucao,
): CorpoOuErro {
  const c: Record<string, unknown> = {};

  if (v.causaId !== inicial.causaId) c.causaId = v.causaId || null;
  if (v.dataAcao !== inicial.dataAcao) c.dataAcao = v.dataAcao || null;
  for (const k of TEXTOS) if (v[k] !== inicial[k]) c[k] = v[k];

  const custos: Record<string, number> = {};
  for (const [k, rotulo] of CAMPOS_CUSTO) {
    if (v.custos[k] === inicial.custos[k]) continue;
    const n = paraNumero(v.custos[k]);
    if (n === null) {
      return { ok: false, mensagem: `Valor inválido em ${rotulo}.` };
    }
    custos[k] = n;
  }
  if (Object.keys(custos).length > 0) c.custos = custos;

  if (Object.keys(c).length === 0) {
    return { ok: false, mensagem: "Nenhuma alteração para salvar." };
  }
  return { ok: true, corpo: c };
}
