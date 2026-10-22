import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--fonte-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAC AISA",
  description: "Reclamações, direcionamento e indicadores",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-marca="aisa" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
