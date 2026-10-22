import { redirect } from "next/navigation";
import { obterUsuario } from "@/lib/sessao";
import { Formulario } from "./formulario";

export const metadata = { title: "Importação · SAC AISA" };

export default async function PaginaImportacao() {
  const usuario = await obterUsuario();
  if (!usuario?.permissoes.includes("dados.importar")) redirect("/");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Importar backup do sistema antigo</h1>
        <p className="pagina__apoio">
          Traz as reclamações, as vendas por dia e os usuários do sac-renato.
          Primeiro você confere, depois grava.
        </p>
      </div>
      <Formulario />
    </>
  );
}
