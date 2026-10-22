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

/** Símbolo e nome da marca. A logo definitiva entra no lugar do símbolo. */
export function Marca({
  nome = "SAC",
  legenda = "Reclamações e indicadores",
  sigla = "S",
}: {
  nome?: string;
  legenda?: string;
  sigla?: string;
}) {
  return (
    <span className="marca">
      <span className="marca__simbolo" aria-hidden="true">
        {sigla}
      </span>
      <span className="marca__texto">
        <span className="marca__nome">{nome}</span>
        <span className="marca__legenda">{legenda}</span>
      </span>
    </span>
  );
}
