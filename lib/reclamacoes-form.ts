/**
 * Lógica pura do formulário de triagem: valores em texto, conversão e corpo enviado à API.
 * A triagem só coleta e comunica com o consumidor. Causa final, devolução, laudo, solução e
 * custo são do setor responsável e têm o próprio formulário (`solucao-form.ts`).
 */

/** Tudo como texto, do jeito que os campos da tela guardam. */
export interface ValoresForm {
  canalId: string;
  marcaId: string;
  produtoCodigo: string;
  bancadaId: string;
  setorRespId: string;
  /** Acompanha a troca de setor na auditoria; nunca vem preenchido do banco. */
  motivoTroca: string;
  dataAbertura: string;
  descricao: string;
  observacao: string;
  pedido: string;
  clienteNome: string;
  cidade: string;
  uf: string;
  transportadora: string;
  protocoloExterno: string;
}

const TEXTOS = [
  "descricao",
  "observacao",
  "pedido",
  "clienteNome",
  "cidade",
  "uf",
  "transportadora",
  "protocoloExterno",
] as const;
const ANULAVEIS = [
  "marcaId",
  "bancadaId",
  "setorRespId",
  "produtoCodigo",
] as const;

export type CorpoOuErro =
  | { ok: true; corpo: Record<string, unknown> }
  | { ok: false; mensagem: string };

/**
 * Monta o corpo só com o que mudou em relação ao valor inicial. Na criação o inicial é
 * vazio e vão todos os campos preenchidos. O setor só vai quando a pessoa mexeu nele:
 * "" volta para o encaminhamento automático, pela causa. O motivo só vai junto com um setor.
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
  if (mudou("dataAbertura")) c.dataAbertura = v.dataAbertura;

  for (const k of ANULAVEIS) {
    if (!mudou(k) || (criando && v[k] === "")) continue;
    c[k] = v[k] === "" ? null : v[k];
  }
  for (const k of TEXTOS) {
    if (!mudou(k) || (criando && v[k] === "" && k !== "descricao")) continue;
    c[k] = v[k];
  }
  if (typeof c.setorRespId === "string" && v.motivoTroca.trim()) {
    c.motivoTroca = v.motivoTroca.trim();
  }

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
    setorRespId: "",
    motivoTroca: "",
    dataAbertura: hoje,
    descricao: "",
    observacao: "",
    pedido: "",
    clienteNome: "",
    cidade: "",
    uf: "",
    transportadora: "",
    protocoloExterno: "",
  };
}

/** Os campos da ficha que a triagem edita, no mesmo formato da API de leitura. */
export interface FichaEditavel {
  canal: { id: string };
  marca: { id: string } | null;
  produto: { codigo: string } | null;
  bancada: { id: string } | null;
  setorResp: { id: string } | null;
  setorRespManual: boolean;
  dataAbertura: string | null;
  descricao: string;
  observacao: string;
  pedido: string;
  clienteNome: string;
  cidade: string;
  uf: string;
  transportadora: string;
  protocoloExterno: string | null;
}

export function valoresDaFicha(f: FichaEditavel): ValoresForm {
  return {
    canalId: f.canal.id,
    marcaId: f.marca?.id ?? "",
    produtoCodigo: f.produto?.codigo ?? "",
    bancadaId: f.bancada?.id ?? "",
    // Só aparece escolhido quando alguém o trocou à mão; senão é "automático".
    setorRespId: f.setorRespManual ? (f.setorResp?.id ?? "") : "",
    motivoTroca: "",
    dataAbertura: f.dataAbertura ?? "",
    descricao: f.descricao,
    observacao: f.observacao,
    pedido: f.pedido,
    clienteNome: f.clienteNome,
    cidade: f.cidade,
    uf: f.uf,
    transportadora: f.transportadora,
    protocoloExterno: f.protocoloExterno ?? "",
  };
}
