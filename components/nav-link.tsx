"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Link do menu que marca a página atual para quem usa leitor de tela e para o estilo. */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const caminho = usePathname();
  const atual = href === "/" ? caminho === "/" : caminho.startsWith(href);
  return (
    <Link href={href} aria-current={atual ? "page" : undefined}>
      {children}
    </Link>
  );
}
