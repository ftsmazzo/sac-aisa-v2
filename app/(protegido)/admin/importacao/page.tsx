import { redirect } from "next/navigation";
import { obterUsuario } from "@/lib/sessao";
import { Formulario } from "./formulario";

export const metadata = { title: "Importação · SAC AISA" };

export default async function PaginaImportacao() {
  const usuario = await obterUsuario();
  if (!usuario?.permissoes.includes("dados.importar")) redirect("/");

  return (
    <>
      <div>
        <h1>Importar backup do sistema antigo</h1>
        <p style={{ color: "var(--cor-suave)", marginTop: 4 }}>
          Traz as reclamações, as vendas por dia e os usuários do sac-renato.
          Primeiro você confere, depois grava.
        </p>
      </div>
      <Formulario />
    </>
  );
}
