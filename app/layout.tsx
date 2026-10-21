import type { ReactNode } from "react";

export const metadata = {
  title: "SAC AISA",
  description: "Reclamações, direcionamento e indicadores",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Inter, Segoe UI, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
