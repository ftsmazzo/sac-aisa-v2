"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * Moldura da ficha que abre na frente da lista. Leva o foco para o painel ao abrir,
 * fecha com Esc e trava a rolagem da lista por trás. O conteúdo vem pronto do servidor.
 */
export function PainelFicha({
  fechar,
  titulo,
  children,
}: {
  fechar: string;
  titulo: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const painel = useRef<HTMLElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    const trava = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(fechar, { scroll: false });
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = trava;
      anterior?.focus?.();
    };
  }, [fechar, router]);

  return (
    <div className="ficha-camada">
      <button
        type="button"
        className="ficha-camada__fundo"
        aria-label="Fechar a ficha"
        tabIndex={-1}
        onClick={() => router.push(fechar, { scroll: false })}
      />
      <aside
        ref={painel}
        className="ficha"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
      >
        {children}
      </aside>
    </div>
  );
}
