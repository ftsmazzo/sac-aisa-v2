"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  type EscolhaMarca,
  TODAS,
  temaDaEscolha,
  textoDaCookie,
} from "@/lib/marca-escolhida";
import { MARCAS, type MarcaId } from "@/lib/marcas";

/**
 * Seletor de marca do cabeçalho: Todas e as marcas que o perfil enxerga. Grava a cookie
 * `marca`, troca o tema na hora e pede ao servidor a página de novo já filtrada.
 */
export function SeletorMarca({
  oferecidas,
  escolha,
}: {
  oferecidas: MarcaId[];
  escolha: EscolhaMarca;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [, comecar] = useTransition();

  if (oferecidas.length === 0) return null;

  function escolher(nova: EscolhaMarca) {
    if (nova === escolha) return;
    // biome-ignore lint/suspicious/noDocumentCookie: preferência de tela, não sensível
    document.cookie = textoDaCookie(nova);
    document.documentElement.dataset.marca = temaDaEscolha(nova);
    // Um filtro de marca explícito na URL ficaria preso na marca antiga.
    const q = new URLSearchParams(params.toString());
    q.delete("marca");
    q.delete("pagina");
    const s = q.toString();
    comecar(() => router.replace(s ? `${caminho}?${s}` : caminho));
  }

  const itens: { id: EscolhaMarca; nome: string }[] = [
    { id: TODAS, nome: "Todas" },
    ...MARCAS.filter((m) => oferecidas.includes(m.id)).map((m) => ({
      id: m.id,
      nome: m.nome,
    })),
  ];

  return (
    <fieldset className="seletor-marca">
      <legend className="sr-only">Marca</legend>
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          className="seletor-marca__item"
          aria-pressed={escolha === i.id}
          onClick={() => escolher(i.id)}
        >
          {i.nome}
        </button>
      ))}
    </fieldset>
  );
}
