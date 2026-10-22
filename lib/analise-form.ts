/** Lógica pura do formulário de análise do setor: valores em texto e corpo enviado à API. */

export interface ValoresAnalise {
  voltar: "" | "sim" | "nao";
  recebidoEm: string;
  conclusao: string;
  resultado: string;
}

export interface AnaliseDaFicha {
  produtoPrecisaVoltar: boolean;
  produtoRecebidoEm: string | null;
  conclusao: string;
  resultado: string;
}

export function valoresDaAnalise(a?: AnaliseDaFicha | null): ValoresAnalise {
  if (!a) return { voltar: "", recebidoEm: "", conclusao: "", resultado: "" };
  return {
    voltar: a.produtoPrecisaVoltar ? "sim" : "nao",
    recebidoEm: a.produtoRecebidoEm ?? "",
    conclusao: a.conclusao,
    resultado: a.resultado,
  };
}

/**
 * Cadastro leva tudo; edição leva só o que mudou. Quem decide o setor, o autor e o efeito
 * sobre a devolução da reclamação é a API.
 */
export function montarCorpoAnalise(
  v: ValoresAnalise,
  inicial: ValoresAnalise,
  criando: boolean,
):
  | { ok: true; corpo: Record<string, unknown> }
  | { ok: false; mensagem: string } {
  if (v.voltar === "") {
    return { ok: false, mensagem: "Diga se o produto precisa voltar." };
  }
  if (v.voltar === "nao" && v.recebidoEm) {
    return {
      ok: false,
      mensagem: "Sem retorno do produto, não há data de recebimento.",
    };
  }
  const corpo: Record<string, unknown> = {};
  if (criando || v.voltar !== inicial.voltar) {
    corpo.produtoPrecisaVoltar = v.voltar === "sim";
  }
  if (criando ? v.recebidoEm : v.recebidoEm !== inicial.recebidoEm) {
    corpo.produtoRecebidoEm = v.recebidoEm || null;
  }
  for (const k of ["conclusao", "resultado"] as const) {
    if (criando ? v[k].trim() : v[k] !== inicial[k]) corpo[k] = v[k];
  }
  return { ok: true, corpo };
}
