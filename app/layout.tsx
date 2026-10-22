import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-marca="aisa" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
