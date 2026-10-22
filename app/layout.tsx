import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { temaDaEscolha } from "@/lib/marca-escolhida";
import { escolhaDaCookie } from "@/lib/marca-servidor";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--fonte-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAC AISA",
  description: "Reclamações, direcionamento e indicadores",
};

/** O tema vem da cookie `marca`, lida aqui para o HTML já sair com a cor certa, sem piscar. */
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tema = temaDaEscolha(await escolhaDaCookie());
  return (
    <html lang="pt-BR" data-marca={tema} className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
