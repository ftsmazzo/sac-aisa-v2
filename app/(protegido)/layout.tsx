import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BotaoSair } from "@/components/botao-sair";
import { NavLink } from "@/components/nav-link";
import { SeletorMarca } from "@/components/seletor-marca";
import { LogoMarca, Marca, Selo } from "@/components/ui";
import type { RespostaAlertas } from "@/lib/fila-alertas";
import { consultaDeMarca, TODAS } from "@/lib/marca-escolhida";
import { marcaAtiva } from "@/lib/marca-servidor";
import { buscarNaApi } from "@/lib/reclamacoes";
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

  const podeAlertas = usuario.permissoes.includes("alertas.ver");
  const marca = await marcaAtiva();
  // Se a API falhar, o menu segue sem o número em vez de derrubar a página.
  const alertas = podeAlertas
    ? await buscarNaApi<RespostaAlertas>(
        `/alertas${consultaDeMarca(marca.idNoCadastro)}`,
      )
    : null;
  const totalAlertas = alertas?.ok ? alertas.dados.total : 0;

  return (
    <>
      <header className="casca__topo">
        <div className="casca__topo-interno">
          {marca.escolha === TODAS ? (
            <Marca nome="SAC" legenda="Reclamações e indicadores" />
          ) : (
            <span className="marca">
              <LogoMarca marca={marca.escolha} altura={34} />
              <span className="marca__texto">
                <span className="marca__nome">SAC</span>
                <span className="marca__legenda">
                  Reclamações e indicadores
                </span>
              </span>
            </span>
          )}
          <nav className="casca__nav" aria-label="Principal">
            <NavLink href="/">Início</NavLink>
            {usuario.permissoes.includes("reclamacoes.ver") && (
              <NavLink href="/reclamacoes">Reclamações</NavLink>
            )}
            {usuario.permissoes.includes("reclamacoes.analisar") && (
              <NavLink href="/fila">Fila do setor</NavLink>
            )}
            {podeAlertas && (
              <NavLink href="/alertas">
                Alertas
                {totalAlertas > 0 && (
                  <span
                    className="nav-contagem"
                    role="img"
                    aria-label={`${totalAlertas} em aberto`}
                  >
                    {totalAlertas > 99 ? "99+" : totalAlertas}
                  </span>
                )}
              </NavLink>
            )}
            {usuario.permissoes.includes("dados.importar") && (
              <NavLink href="/admin/importacao">Importação</NavLink>
            )}
          </nav>
          <span className="casca__espaco" />
          <SeletorMarca oferecidas={marca.oferecidas} escolha={marca.escolha} />
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
