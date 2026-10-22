import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BotaoSair } from "@/components/botao-sair";
import { Marca, Selo } from "@/components/ui";
import { obterUsuario } from "@/lib/sessao";

const PERFIL: Record<string, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  operacao: "Operação",
  responsavel_setor: "Responsável de setor",
};

/** Tudo dentro deste grupo exige login. A API confere de novo em cada ação. */
export default async function LayoutProtegido({
  children,
}: {
  children: ReactNode;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  return (
    <>
      <header className="casca__topo">
        <div className="casca__topo-interno">
          <Marca nome="SAC" legenda="Reclamações e indicadores" />
          <nav className="casca__nav" aria-label="Principal">
            <Link href="/">Início</Link>
            {usuario.permissoes.includes("dados.importar") && (
              <Link href="/admin/importacao">Importação</Link>
            )}
          </nav>
          <span className="casca__espaco" />
          <div className="casca__usuario">
            <span>{usuario.nome}</span>
            <Selo>{PERFIL[usuario.perfil] ?? usuario.perfil}</Selo>
            <BotaoSair />
          </div>
        </div>
      </header>
      <main className="casca__conteudo">{children}</main>
    </>
  );
}
