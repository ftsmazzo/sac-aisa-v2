import { redirect } from "next/navigation";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import type { PainelUsuarios } from "@/lib/usuarios";
import { Painel } from "./painel";

export const metadata = { title: "Usuários · SAC AISA" };

export default async function PaginaUsuarios() {
  const usuario = await obterUsuario();
  if (
    usuario?.perfil !== "administrador" ||
    !usuario.permissoes.includes("usuarios.gerir")
  ) {
    redirect("/");
  }

  const r = await buscarNaApi<PainelUsuarios>("/admin/usuarios");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Usuários</h1>
        <p className="pagina__apoio">
          Quem entra no sistema, com qual perfil e, para o responsável de setor,
          de quais setores e marcas. A senha nunca é mostrada.
        </p>
      </div>
      {r.ok ? (
        <Painel inicial={r.dados} />
      ) : (
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar os usuários. Tente recarregar a página.
        </p>
      )}
    </>
  );
}
