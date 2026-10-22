import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import type { EstadoSimulacao } from "@/lib/simulacao";
import "../../treino.css";
import { Painel } from "./painel";

export const metadata = { title: "Simulação de canais · SAC AISA" };

export default async function PaginaSimulacaoCanais() {
  const usuario = await obterUsuario();
  if (usuario?.perfil !== "administrador" && usuario?.perfil !== "gestor") {
    redirect("/");
  }

  const r = await buscarNaApi<EstadoSimulacao>("/admin/simulacao");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Simulação de canais</h1>
        <p className="pagina__apoio">
          O sistema consome um Mercado Livre e uma Shopee de mentira, com o
          mesmo código que vai consumir os de verdade: autorização, aviso,
          busca, mapeamento e gravação. Cada etapa aparece no registro, e ao
          lado fica o que falta para funcionar de verdade. As reclamações
          criadas aqui são de treino (veja em{" "}
          <Link href="/admin/treino">Modo treino</Link>).
        </p>
      </div>
      {r.ok ? (
        <Painel
          inicial={r.dados}
          administrador={usuario.perfil === "administrador"}
        />
      ) : (
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar a simulação. Tente recarregar a página.
        </p>
      )}
    </>
  );
}
