import Link from "next/link";
import { Selo } from "@/components/ui";
import { valoresDaAnalise } from "@/lib/analise-form";
import type { Ficha } from "@/lib/reclamacoes";
import {
  data,
  ROTULO_SITUACAO,
  tomDaSituacao,
} from "@/lib/reclamacoes-formato";
import { FormularioAnalise } from "./analise";
import { AbasFicha } from "./ficha";

function ResumoAnalise({ a }: { a: Ficha["analises"][number] }) {
  return (
    <>
      <strong>{a.setor}</strong> · {data(a.criadoEm)}
      <br />
      {a.produtoPrecisaVoltar
        ? a.produtoRecebidoEm
          ? `Produto precisava voltar; recebido em ${data(a.produtoRecebidoEm)}.`
          : "Produto precisa voltar."
        : "Produto não precisa voltar."}
      {a.conclusao && ` ${a.conclusao}`}
    </>
  );
}

/** Aba de análise da ficha: o formulário do setor atual e, abaixo, o histórico de outros setores. */
export function PainelAnalise({
  ficha,
  fechar,
  hrefFicha,
  hrefAnalise,
  podeAnalisar,
}: {
  ficha: Ficha;
  fechar: string;
  hrefFicha: string;
  hrefAnalise: string;
  podeAnalisar: boolean;
}) {
  const setor = ficha.setorResp?.nome ?? null;
  const doSetor = setor ? ficha.analises.find((a) => a.setor === setor) : null;
  const outras = ficha.analises.filter((a) => a !== doSetor);
  const resolvida = ficha.situacao === "resolvida";

  return (
    <>
      <header className="ficha__cab">
        <div className="ficha__cab-texto">
          <p className="ficha__numero">Reclamação #{ficha.numero}</p>
          <h2 className="ficha__titulo">
            {ficha.produto?.nome ?? "Produto não informado"}
          </h2>
          <div className="ficha__selos">
            <Selo tom={tomDaSituacao(ficha.situacao)}>
              {ROTULO_SITUACAO[ficha.situacao]}
            </Selo>
            {setor && <Selo>{setor}</Selo>}
          </div>
        </div>
        <div className="ficha__acoes">
          <Link
            href={fechar}
            scroll={false}
            className="botao botao--secundario ficha__fechar"
          >
            Fechar
          </Link>
        </div>
      </header>

      <AbasFicha
        atual="analise"
        hrefFicha={hrefFicha}
        hrefAnalise={hrefAnalise}
      />

      {!podeAnalisar ? (
        <div className="ficha__corpo">
          <p className="pagina__apoio">
            Seu perfil não registra análise do setor.
          </p>
        </div>
      ) : !setor ? (
        <div className="ficha__corpo">
          <p className="pagina__apoio">
            A reclamação ainda não tem setor responsável. Defina a causa ou
            troque o setor na edição da ficha.
          </p>
        </div>
      ) : resolvida ? (
        <div className="ficha__corpo">
          <p className="pagina__apoio">
            A reclamação já foi resolvida; a análise não pode mais ser alterada.
          </p>
          {doSetor && <ResumoAnalise a={doSetor} />}
        </div>
      ) : (
        <FormularioAnalise
          key={doSetor?.id ?? "nova"}
          reclamacaoId={ficha.id}
          analiseId={doSetor?.id ?? null}
          setorNome={setor}
          inicial={valoresDaAnalise(doSetor)}
          depois={hrefAnalise}
        />
      )}

      {outras.length > 0 && (
        <section className="ficha__bloco ficha__bloco--rodape">
          <h3 className="ficha__subtitulo">Análises de outros setores</h3>
          <ul className="ficha__analises">
            {outras.map((a) => (
              <li key={a.id}>
                <ResumoAnalise a={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
