import { LogoMarca } from "@/components/ui";
import { marcaVisual } from "@/lib/marca-escolhida";

/** Marca de uma reclamação: a logo pequena (com `alt` do nome) ou, sem logo, o nome em texto. */
export function MarcaDoCadastro({
  nome,
  altura = 20,
}: {
  nome: string | null | undefined;
  altura?: number;
}) {
  if (!nome) return null;
  const id = marcaVisual(nome);
  return id ? <LogoMarca marca={id} altura={altura} /> : <span>{nome}</span>;
}
