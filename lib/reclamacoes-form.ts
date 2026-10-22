/** Lógica pura do formulário de reclamação: valores em texto, conversão e corpo enviado à API. */

export const CAMPOS_CUSTO = [
  ["freteEnvio", "Frete de envio"],
  ["freteRetorno", "Frete de retorno"],
  ["valorPeca", "Peça"],
  ["estorno", "Estorno"],
  ["desconto", "Desconto"],
  ["guia", "Guia"],
] as const;
export type CampoCusto = (typeof CAMPOS_CUSTO)[number][0];

/** Tudo como texto, do jeito que os campos da tela guardam. */
export interface ValoresForm {
  canalId: string;
  marcaId: string;
  produtoCodigo: string;
  bancadaId: string;
  causaId: string;
  setorRespId: string;
  devolucao: string;
  dataAbertura: string;
  dataRecebimento: string;
  dataAcao: string;
  descricao: string;
  laudo: string;
  solucao: string;
  observacao: string;
  pedido: string;
  clienteNome: string;
  cidade: string;
  uf: string;
  transportadora: string;
  peca: string;
  garantia: string;
  procedencia: string;
  protocoloExterno: string;
  custos: Record<CampoCusto, string>;
}

const TEXTOS = [
  "descricao",
  "laudo",
  "solucao",
  "observacao",
  "pedido",
  "clienteNome",
  "cidade",
  "uf",
  "transportadora",
  "peca",
  "garantia",
  "procedencia",
  "protocoloExterno",
] as const;
const ANULAVEIS = [
  "marcaId",
  "bancadaId",
  "causaId",
  "setorRespId",
  "produtoCodigo",
  "dataRecebimento",
  "dataAcao",
] as const;

/** "1.234,56", "12,5" e "12.5" viram número. Vazio vale zero; lixo devolve null. */
export function paraNumero(s: string): number | null {
  const t = s.replace(/R\$|\s/g, "");
  if (t === "") return 0;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Number(normal);
}

export type CorpoOuErro =
  | { ok: true; corpo: Record<string, unknown> }
  | { ok: false; mensagem: string };

/**
 * Monta o corpo só com o que mudou em relação ao valor inicial. Na criação o inicial é
 * vazio e vão todos os campos preenchidos. Setor e causa só vão quando a pessoa mexeu
 * neles: "" volta para o cálculo automático.
 */
export function montarCorpo(
  v: ValoresForm,
  inicial: ValoresForm,
  criando: boolean,
): CorpoOuErro {
  const c: Record<string, unknown> = {};
  const mudou = (k: keyof ValoresForm) => criando || v[k] !== inicial[k];

  if (criando && !v.canalId) return { ok: false, mensagem: "Escolha o canal." };
  if (criando && !v.descricao.trim()) {
    return { ok: false, mensagem: "Descreva o que aconteceu." };
  }
  if (!v.dataAbertura) {
    return { ok: false, mensagem: "Informe a data de abertura." };
  }

  if (mudou("canalId")) c.canalId = v.canalId;
  if (mudou("devolucao")) c.devolucao = v.devolucao;
  if (mudou("dataAbertura")) c.dataAbertura = v.dataAbertura;

  for (const k of ANULAVEIS) {
    if (!mudou(k) || (criando && v[k] === "")) continue;
    c[k] = v[k] === "" ? null : v[k];
  }
  for (const k of TEXTOS) {
    if (!mudou(k) || (criando && v[k] === "" && k !== "descricao")) continue;
    c[k] = v[k];
  }

  const custos: Record<string, number> = {};
  for (const [k, rotulo] of CAMPOS_CUSTO) {
    if (!criando && v.custos[k] === inicial.custos[k]) continue;
    const n = paraNumero(v.custos[k]);
    if (n === null) {
      return { ok: false, mensagem: `Valor inválido em ${rotulo}.` };
    }
    if (criando && n === 0) continue;
    custos[k] = n;
  }
  if (Object.keys(custos).length > 0) c.custos = custos;

  if (Object.keys(c).length === 0) {
    return { ok: false, mensagem: "Nenhuma alteração para salvar." };
  }
  return { ok: true, corpo: c };
}

export function valoresVazios(hoje: string): ValoresForm {
  return {
    canalId: "",
    marcaId: "",
    produtoCodigo: "",
    bancadaId: "",
    causaId: "",
    setorRespId: "",
    devolucao: "NA",
    dataAbertura: hoje,
    dataRecebimento: "",
    dataAcao: "",
    descricao: "",
    laudo: "",
    solucao: "",
    observacao: "",
    pedido: "",
    clienteNome: "",
    cidade: "",
    uf: "",
    transportadora: "",
    peca: "",
    garantia: "",
    procedencia: "",
    protocoloExterno: "",
    custos: {
      freteEnvio: "",
      freteRetorno: "",
      valorPeca: "",
      estorno: "",
      desconto: "",
      guia: "",
    },
  };
}

/** Os campos da ficha que o formulário edita, no mesmo formato da API de leitura. */
export interface FichaEditavel {
  canal: { id: string };
  marca: { id: string } | null;
  produto: { codigo: string } | null;
  bancada: { id: string } | null;
  causa: { id: string } | null;
  causaManual: boolean;
  setorResp: { id: string } | null;
  setorRespManual: boolean;
  devolucao: string;
  dataAbertura: string | null;
  dataRecebimento: string | null;
  dataAcao: string | null;
  descricao: string;
  laudo: string;
  solucao: string;
  observacao: string;
  pedido: string;
  clienteNome: string;
  cidade: string;
  uf: string;
  transportadora: string;
  peca: string;
  garantia: string;
  procedencia: string;
  protocoloExterno: string | null;
  custos: Record<CampoCusto, number>;
}

const comoTexto = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

export function valoresDaFicha(f: FichaEditavel): ValoresForm {
  return {
    canalId: f.canal.id,
    marcaId: f.marca?.id ?? "",
    produtoCodigo: f.produto?.codigo ?? "",
    bancadaId: f.bancada?.id ?? "",
    // Só aparece escolhida quando alguém a definiu à mão; senão é "automática".
    causaId: f.causaManual ? (f.causa?.id ?? "") : "",
    setorRespId: f.setorRespManual ? (f.setorResp?.id ?? "") : "",
    devolucao: f.devolucao,
    dataAbertura: f.dataAbertura ?? "",
    dataRecebimento: f.dataRecebimento ?? "",
    dataAcao: f.dataAcao ?? "",
    descricao: f.descricao,
    laudo: f.laudo,
    solucao: f.solucao,
    observacao: f.observacao,
    pedido: f.pedido,
    clienteNome: f.clienteNome,
    cidade: f.cidade,
    uf: f.uf,
    transportadora: f.transportadora,
    peca: f.peca,
    garantia: f.garantia,
    procedencia: f.procedencia,
    protocoloExterno: f.protocoloExterno ?? "",
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
