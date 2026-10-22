import Link from "next/link";
import type { ReactNode } from "react";
import { Selo } from "@/components/ui";
import type { Ficha } from "@/lib/reclamacoes";
import {
  data,
  moeda,
  ROTULO_DEVOLUCAO,
  ROTULO_SITUACAO,
  tomDaSituacao,
} from "@/lib/reclamacoes-formato";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="ficha__campo">
      <dt>{rotulo}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function Texto({ rotulo, valor }: { rotulo: string; valor: string }) {
  if (!valor.trim()) return null;
  return (
    <section className="ficha__bloco">
      <h3 className="ficha__subtitulo">{rotulo}</h3>
      <p className="ficha__texto">{valor}</p>
    </section>
  );
}

const CUSTOS: [keyof Ficha["custos"], string][] = [
  ["freteEnvio", "Frete de envio"],
  ["freteRetorno", "Frete de retorno"],
  ["valorPeca", "Peça"],
  ["estorno", "Estorno"],
  ["desconto", "Desconto"],
  ["guia", "Guia"],
];

/** Abas da ficha: os dados da reclamação e a análise do setor. */
export function AbasFicha({
  atual,
  hrefFicha,
  hrefAnalise,
}: {
  atual: "ficha" | "analise";
  hrefFicha: string;
  hrefAnalise: string;
}) {
  return (
    <nav className="abas" aria-label="Seções da ficha">
      <Link
        href={hrefFicha}
        scroll={false}
        aria-current={atual === "ficha" ? "page" : undefined}
      >
        Ficha
      </Link>
      <Link
        href={hrefAnalise}
        scroll={false}
        aria-current={atual === "analise" ? "page" : undefined}
      >
        Análise do setor
      </Link>
    </nav>
  );
}

/**
 * Ficha em leitura. Com `hrefEditar`, mostra o botão que abre o formulário de edição;
 * com `hrefAnalise`, mostra as abas para registrar a análise do setor.
 */
export function ConteudoFicha({
  ficha,
  fechar,
  hrefEditar,
  hrefAnalise,
  hrefFicha,
}: {
  ficha: Ficha;
  fechar: string;
  hrefEditar?: string;
  hrefAnalise?: string;
  hrefFicha?: string;
}) {
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
            {ficha.rascunho && <Selo tom="atencao">Rascunho</Selo>}
          </div>
        </div>
        <div className="ficha__acoes">
          <Link
            href={`/reclamacoes/${encodeURIComponent(ficha.id)}/imprimir`}
            target="_blank"
            className="botao botao--secundario ficha__fechar"
          >
            Imprimir
          </Link>
          {hrefEditar && (
            <Link
              href={hrefEditar}
              scroll={false}
              className="botao botao--primario ficha__fechar"
            >
              Editar
            </Link>
          )}
          <Link
            href={fechar}
            scroll={false}
            className="botao botao--secundario ficha__fechar"
          >
            Fechar
          </Link>
        </div>
      </header>

      {hrefAnalise && hrefFicha && (
        <AbasFicha
          atual="ficha"
          hrefFicha={hrefFicha}
          hrefAnalise={hrefAnalise}
        />
      )}

      <div className="ficha__corpo">
        <dl className="ficha__grade">
          <Campo rotulo="Abertura">{data(ficha.dataAbertura)}</Campo>
          <Campo rotulo="Data de ação">{data(ficha.dataAcao)}</Campo>
          <Campo rotulo="Marca">{ficha.marca?.nome}</Campo>
          <Campo rotulo="Canal">{ficha.canal.nome}</Campo>
          <Campo rotulo="Produto">
            {ficha.produto
              ? `${ficha.produto.codigo} · ${ficha.produto.nome}`
              : ""}
          </Campo>
          <Campo rotulo="Bancada">
            {ficha.bancada
              ? `${ficha.bancada.codigo}${ficha.bancada.nome ? ` · ${ficha.bancada.nome}` : ""}`
              : ""}
          </Campo>
          <Campo rotulo="Causa">
            {ficha.causa?.nome}
            {ficha.causa && ficha.causaManual && " (definida à mão)"}
          </Campo>
          <Campo rotulo="Setor responsável">
            {ficha.setorResp?.nome}
            {ficha.setorResp && ficha.setorRespManual && " (trocado à mão)"}
          </Campo>
          <Campo rotulo="Devolução">{ROTULO_DEVOLUCAO[ficha.devolucao]}</Campo>
          <Campo rotulo="Produto recebido em">
            {data(ficha.dataRecebimento)}
          </Campo>
          <Campo rotulo="Pedido">{ficha.pedido}</Campo>
          <Campo rotulo="Protocolo externo">{ficha.protocoloExterno}</Campo>
          <Campo rotulo="Cliente">{ficha.clienteNome}</Campo>
          <Campo rotulo="Cidade">
            {[ficha.cidade, ficha.uf].filter(Boolean).join(" / ")}
          </Campo>
          <Campo rotulo="Transportadora">{ficha.transportadora}</Campo>
          <Campo rotulo="Peça">{ficha.peca}</Campo>
          <Campo rotulo="Garantia">{ficha.garantia}</Campo>
          <Campo rotulo="Procedência">{ficha.procedencia}</Campo>
        </dl>

        {ficha.causasExtras.length > 0 && (
          <section className="ficha__bloco">
            <h3 className="ficha__subtitulo">Outros motivos</h3>
            <ul className="ficha__chips">
              {ficha.causasExtras.map((c) => (
                <li key={c.id} className="chip chip--fixo">
                  {c.nome}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Texto rotulo="O que aconteceu" valor={ficha.descricao} />
        <Texto rotulo="Laudo" valor={ficha.laudo} />
        <Texto rotulo="Solução" valor={ficha.solucao} />
        <Texto rotulo="Observação" valor={ficha.observacao} />

        <section className="ficha__bloco">
          <h3 className="ficha__subtitulo">Custo</h3>
          <table className="tabela-simples ficha__custos">
            <tbody>
              {CUSTOS.map(([chave, rotulo]) => (
                <tr key={chave}>
                  <td>{rotulo}</td>
                  <td>{moeda(ficha.custos[chave])}</td>
                </tr>
              ))}
              <tr className="ficha__total">
                <td>Total</td>
                <td>{moeda(ficha.custoTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {ficha.analises.length > 0 && (
          <section className="ficha__bloco">
            <h3 className="ficha__subtitulo">Análise do setor</h3>
            <ul className="ficha__analises">
              {ficha.analises.map((a) => (
                <li key={a.id}>
                  <strong>{a.setor}</strong> · {data(a.criadoEm)}
                  <br />
                  {a.produtoPrecisaVoltar
                    ? "Produto precisa voltar."
                    : "Produto não precisa voltar."}
                  {a.conclusao && ` ${a.conclusao}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="ficha__rodape">
          {ficha.fotos > 0 &&
            `${ficha.fotos} ${ficha.fotos === 1 ? "foto" : "fotos"} · `}
          Registrada em {data(ficha.criadoEm)} · alterada em{" "}
          {data(ficha.alteradoEm)}
        </p>
      </div>
    </>
  );
}
