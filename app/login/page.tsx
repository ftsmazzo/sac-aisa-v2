import { redirect } from "next/navigation";
import { LogoMarca, Marca } from "@/components/ui";
import { MARCAS } from "@/lib/marcas";
import { obterUsuario } from "@/lib/sessao";
import { Formulario } from "./formulario";

export const metadata = { title: "Entrar · SAC AISA" };

const DESTINOS = ["Fabricação", "Transporte", "Prazo e entrega"];

/** A reclamação entra e a causa escolhe o caminho até o setor. Só ilustra, não é dado. */
function Fluxo() {
  return (
    <svg
      className="login__fluxo"
      viewBox="0 0 460 190"
      fill="none"
      aria-hidden="true"
    >
      {DESTINOS.map((nome, i) => {
        const y = 24 + i * 71;
        const escolhido = i === 1;
        return (
          <g key={nome}>
            <path
              d={`M128 95 C 210 95, 210 ${y}, 292 ${y}`}
              stroke="#fff"
              strokeOpacity={escolhido ? 0.95 : 0.28}
              strokeWidth={escolhido ? 2.5 : 1.5}
            />
            <rect
              x="292"
              y={y - 17}
              width="168"
              height="34"
              rx="10"
              fill="#fff"
              fillOpacity={escolhido ? 0.2 : 0.07}
              stroke="#fff"
              strokeOpacity={escolhido ? 0.6 : 0.22}
            />
            <text
              x="310"
              y={y + 5}
              fill="#fff"
              fillOpacity={escolhido ? 1 : 0.78}
              fontSize="14"
              fontWeight="600"
            >
              {nome}
            </text>
          </g>
        );
      })}
      <rect
        x="0"
        y="76"
        width="128"
        height="38"
        rx="11"
        fill="#fff"
        fillOpacity="0.16"
        stroke="#fff"
        strokeOpacity="0.5"
      />
      <text x="18" y="100" fill="#fff" fontSize="14" fontWeight="700">
        Reclamação
      </text>
    </svg>
  );
}

export default async function PaginaLogin() {
  if (await obterUsuario()) redirect("/");

  return (
    <main className="login">
      <section className="login__painel" aria-hidden="true">
        <Marca nome="SAC" legenda="AISA · ARTMAQ · ARAUCA" />
        <div>
          <Fluxo />
          <h2 className="login__chamada">
            Cada reclamação no setor certo, no tempo certo.
          </h2>
          <p className="login__apoio">
            Registro assistido, acompanhamento no ClickUp e indicadores para
            decidir com dados.
          </p>
        </div>
        <div className="marcas-faixa">
          <p className="marcas-faixa__titulo">Marcas atendidas</p>
          {MARCAS.map((m) => (
            <LogoMarca key={m.id} marca={m.id} altura={44} />
          ))}
        </div>
      </section>

      <section className="login__lado">
        <div className="login__conteudo">
          <div className="login__mobile-marca">
            <Marca nome="SAC" legenda="AISA · ARTMAQ · ARAUCA" />
          </div>
          <div>
            <h1 className="login__titulo">Entrar</h1>
            <p className="login__subtitulo">
              Use o usuário e a senha que o administrador criou para você.
            </p>
          </div>
          <Formulario />
          <p className="login__rodape">
            Esqueceu a senha? Fale com o administrador do sistema.
          </p>
          <div className="marcas-faixa login__logos-mobile">
            <p className="marcas-faixa__titulo">Marcas atendidas</p>
            {MARCAS.map((m) => (
              <LogoMarca key={m.id} marca={m.id} altura={32} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
