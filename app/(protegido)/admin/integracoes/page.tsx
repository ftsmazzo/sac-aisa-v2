import { redirect } from "next/navigation";
import type { FilaClickup, PainelIntegracoes } from "@/lib/integracoes";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import { Painel } from "./painel";

export const metadata = { title: "Integrações · SAC AISA" };

export default async function PaginaIntegracoes() {
  const usuario = await obterUsuario();
  if (
    usuario?.perfil !== "administrador" ||
    !usuario.permissoes.includes("integracoes.gerir")
  ) {
    redirect("/");
  }

  const r = await buscarNaApi<PainelIntegracoes>("/admin/integracoes");
  const fila = await buscarNaApi<FilaClickup>(
    "/admin/integracoes/clickup/fila",
  );

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Integrações</h1>
        <p className="pagina__apoio">
          As conexões com ClickUp, marketplaces e IA ficam aqui. Os segredos são
          guardados cifrados e nunca voltam para a tela: você vê só os 4 últimos
          caracteres.
        </p>
      </div>
      {r.ok ? (
        <Painel inicial={r.dados} fila={fila.ok ? fila.dados : null} />
      ) : (
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar as integrações. Tente recarregar a página.
        </p>
      )}
    </>
  );
}
