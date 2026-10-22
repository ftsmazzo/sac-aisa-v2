"use client";

/** Abre a janela de impressão do navegador. A folha é feita pelo CSS de impressão. */
export function BotaoImprimir({ rotulo = "Imprimir" }: { rotulo?: string }) {
  return (
    <button
      type="button"
      className="botao botao--secundario"
      onClick={() => window.print()}
    >
      {rotulo}
    </button>
  );
}
