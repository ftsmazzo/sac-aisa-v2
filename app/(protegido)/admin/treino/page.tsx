import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import type { SituacaoTreino } from "@/lib/treino";
import "../../treino.css";
import { Painel } from "./painel";

export const metadata = { title: "Treino · SAC AISA" };

export default async function PaginaTreino() {
  const usuario = await obterUsuario();
  if (usuario?.perfil !== "administrador" && usuario?.perfil !== "gestor") {
    redirect("/");
  }

  const r = await buscarNaApi<SituacaoTreino>("/admin/treino");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Modo treino</h1>
        <p className="pagina__apoio">
          Dados fictícios para ensaiar e apresentar o sistema. Ficam fora da
          lista, da fila, dos alertas e dos relatórios reais, e não vão ao
          ClickUp. Siga o{" "}
          <Link href="/admin/roteiro-treino">roteiro de 10 minutos</Link> para
          apresentar ao dono.
        </p>
      </div>
      {r.ok ? (
        <Painel
          inicial={r.dados}
          administrador={usuario.perfil === "administrador"}
        />
      ) : (
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar o modo treino. Tente recarregar a página.
        </p>
      )}
    </>
  );
}
