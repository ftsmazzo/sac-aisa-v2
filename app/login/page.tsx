import { redirect } from "next/navigation";
import { Marca } from "@/components/ui";
import { obterUsuario } from "@/lib/sessao";
import { Formulario } from "./formulario";

export const metadata = { title: "Entrar · SAC AISA" };

export default async function PaginaLogin() {
  if (await obterUsuario()) redirect("/");

  return (
    <main className="login">
      <section className="login__painel" aria-hidden="true">
        <Marca nome="SAC" legenda="AISA · ARTMAQ · ARAUCA" />
        <div>
          <h2 className="login__chamada">
            Cada reclamação no setor certo, no tempo certo.
          </h2>
          <p className="login__apoio">
            Registro assistido, acompanhamento no ClickUp e indicadores para
            decidir com dados.
          </p>
        </div>
        <p className="marca__legenda">Reclamações e indicadores</p>
      </section>

      <section className="login__lado">
        <div className="cartao login__cartao">
          <Marca nome="SAC" legenda="Entre para continuar" />
          <Formulario />
          <p className="login__rodape">
            Esqueceu a senha? Fale com o administrador do sistema.
          </p>
        </div>
      </section>
    </main>
  );
}
