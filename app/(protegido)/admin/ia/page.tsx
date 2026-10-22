import { redirect } from "next/navigation";
import type { RespostaPerfil, RespostaPerguntas } from "@/lib/ia";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import { PerfilForm } from "./perfil-form";
import { PerguntasPainel } from "./perguntas-painel";

export const metadata = { title: "IA · SAC AISA" };

export default async function PaginaIa() {
  const usuario = await obterUsuario();
  if (
    !usuario ||
    (usuario.perfil !== "administrador" && usuario.perfil !== "gestor") ||
    !usuario.permissoes.includes("ia.gerir")
  ) {
    redirect("/");
  }

  const [perfil, perguntas] = await Promise.all([
    buscarNaApi<RespostaPerfil>("/admin/ia/perfil"),
    buscarNaApi<RespostaPerguntas>("/admin/ia/perguntas"),
  ]);

  return (
    <div className="ia-admin">
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Padrão da IA</h1>
        <p className="pagina__apoio">
          O perfil da empresa dá o tom das mensagens ao cliente. As perguntas
          obrigatórias dizem o que o SAC precisa ver respondido por tipo de
          produto e de causa. A IA só sugere: quem decide é a pessoa. Toda
          mudança fica na auditoria.
        </p>
      </div>
      {perfil.ok ? (
        <PerfilForm inicial={perfil.dados} />
      ) : (
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar o perfil da empresa.
        </p>
      )}
      {perguntas.ok ? (
        <PerguntasPainel inicial={perguntas.dados} />
      ) : (
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar as perguntas obrigatórias.
        </p>
      )}
    </div>
  );
}
