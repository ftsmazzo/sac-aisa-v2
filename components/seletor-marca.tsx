"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  type EscolhaMarca,
  TODAS,
  temaDaEscolha,
  textoDaCookie,
} from "@/lib/marca-escolhida";
import { MARCAS, type MarcaId } from "@/lib/marcas";
import { LogoMarca, SimboloFluxo } from "./ui";

interface MarcaNaTela {
  atual: EscolhaMarca;
  oferecidas: MarcaId[];
  escolher: (nova: EscolhaMarca) => void;
}

const MarcaNaTelaCtx = createContext<MarcaNaTela | null>(null);

function usarMarcaNaTela() {
  const ctx = useContext(MarcaNaTelaCtx);
  if (!ctx) throw new Error("Seletor de marca fora do cabeçalho.");
  return ctx;
}

/**
 * A escolha do cabeçalho. O `<html>` do servidor não troca de atributo numa navegação
 * interna, então a cor e a logo ficam neste estado e são reaplicadas se o Next
 * devolver o tema antigo.
 */
export function ProvedorMarca({
  escolha,
  oferecidas,
  children,
}: {
  escolha: EscolhaMarca;
  oferecidas: MarcaId[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [, comecar] = useTransition();
  const [atual, setAtual] = useState(escolha);
  const pedido = useRef(escolha);

  useEffect(() => {
    if (escolha === pedido.current) setAtual(escolha);
  }, [escolha]);

  useEffect(() => {
    for (const m of MARCAS) {
      const img = new Image();
      img.src = m.logo;
    }
  }, []);

  useLayoutEffect(() => {
    const html = document.documentElement;
    const tema = temaDaEscolha(atual);
    const aplicar = () => {
      if (html.dataset.marca !== tema) html.dataset.marca = tema;
    };
    aplicar();
    const obs = new MutationObserver(aplicar);
    obs.observe(html, { attributes: true, attributeFilter: ["data-marca"] });
    return () => obs.disconnect();
  }, [atual]);

  function escolher(nova: EscolhaMarca) {
    if (nova === atual) return;
    pedido.current = nova;
    setAtual(nova);
    // biome-ignore lint/suspicious/noDocumentCookie: preferência de tela, não sensível
    document.cookie = textoDaCookie(nova);
    const url = new URL(window.location.href);
    url.searchParams.delete("marca");
    url.searchParams.delete("pagina");
    const s = url.searchParams.toString();
    comecar(() => {
      router.replace(s ? `${url.pathname}?${s}` : url.pathname);
      router.refresh();
    });
  }

  return (
    <MarcaNaTelaCtx.Provider value={{ atual, oferecidas, escolher }}>
      {children}
    </MarcaNaTelaCtx.Provider>
  );
}

/** Logo do cabeçalho. Troca no clique, sem esperar o servidor redesenhar a casca. */
export function LogoDaMarcaAtiva() {
  const { atual } = usarMarcaNaTela();
  return (
    <span className="marca">
      <span className="marca__emblema">
        {atual === TODAS ? (
          <span className="marca__simbolo" aria-hidden="true">
            <SimboloFluxo />
          </span>
        ) : (
          <LogoMarca marca={atual} altura={34} />
        )}
      </span>
      <span className="marca__texto">
        <span className="marca__nome">SAC</span>
        <span className="marca__legenda">Reclamações e indicadores</span>
      </span>
    </span>
  );
}

/** Seletor de marca do cabeçalho: Todas e as marcas que o perfil enxerga. */
export function SeletorMarca() {
  const { atual, oferecidas, escolher } = usarMarcaNaTela();
  if (oferecidas.length === 0) return null;

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
          aria-pressed={atual === i.id}
          onClick={() => escolher(i.id)}
        >
          {i.nome}
        </button>
      ))}
    </fieldset>
  );
}
