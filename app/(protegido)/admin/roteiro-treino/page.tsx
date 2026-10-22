import Link from "next/link";
import { redirect } from "next/navigation";
import { Cartao } from "@/components/ui";
import { obterUsuario } from "@/lib/sessao";
import { MINUTOS_DO_ROTEIRO, ROTEIRO } from "@/lib/treino";
import "../../treino.css";

export const metadata = { title: "Roteiro de treino · SAC AISA" };

export default async function PaginaRoteiroTreino() {
  const usuario = await obterUsuario();
  if (usuario?.perfil !== "administrador" && usuario?.perfil !== "gestor") {
    redirect("/");
  }

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">
          Roteiro de {MINUTOS_DO_ROTEIRO} minutos
        </h1>
        <p className="pagina__apoio">
          Passo a passo para apresentar o sistema ao dono, com dados fictícios.
          Antes de começar, ligue o “Modo treino” no topo e carregue os dados em{" "}
          <Link href="/admin/treino">Modo treino</Link>.
        </p>
      </div>
      <ol className="roteiro">
        {ROTEIRO.map((p) => (
          <li key={p.titulo}>
            <Cartao className="roteiro__passo">
              <h2 className="roteiro__titulo">
                {p.titulo}
                <span className="roteiro__tempo">{p.minutos} min</span>
              </h2>
              <p className="roteiro__texto">{p.fazer}</p>
              <p className="roteiro__dizer">Diga: {p.dizer}</p>
              <Link className="roteiro__link" href={p.href}>
                {p.rotulo} →
              </Link>
            </Cartao>
          </li>
        ))}
      </ol>
    </>
  );
}
