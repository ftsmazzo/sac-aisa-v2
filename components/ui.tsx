import type { ButtonHTMLAttributes, ReactNode } from "react";

function juntar(...partes: (string | false | undefined)[]) {
  return partes.filter(Boolean).join(" ");
}

export function Botao({
  variante = "primario",
  cheio = false,
  className,
  type = "button",
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario";
  cheio?: boolean;
}) {
  return (
    <button
      type={type}
      className={juntar(
        "botao",
        `botao--${variante}`,
        cheio && "botao--cheio",
        className,
      )}
      {...resto}
    />
  );
}

export function Cartao({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={juntar("cartao", className)}>{children}</div>;
}

export function Selo({
  tom = "info",
  children,
}: {
  tom?: "ok" | "atencao" | "perigo" | "info";
  children: ReactNode;
}) {
  return <span className={`selo selo--${tom}`}>{children}</span>;
}

/** Símbolo provisório: uma entrada que se divide em três saídas, o direcionamento ao setor. */
export function SimboloFluxo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M7 12h3.5c2 0 2.5-6 6-6M7 12h10M7 12h3.5c2 0 2.5 6 6 6" />
      <circle cx="18" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Símbolo e nome da marca. A logo definitiva entra no lugar do símbolo. */
export function Marca({
  nome = "SAC",
  legenda = "Reclamações e indicadores",
  sigla,
}: {
  nome?: string;
  legenda?: string;
  sigla?: string;
}) {
  return (
    <span className="marca">
      <span className="marca__simbolo" aria-hidden="true">
        {sigla ?? <SimboloFluxo />}
      </span>
      <span className="marca__texto">
        <span className="marca__nome">{nome}</span>
        <span className="marca__legenda">{legenda}</span>
      </span>
    </span>
  );
}
