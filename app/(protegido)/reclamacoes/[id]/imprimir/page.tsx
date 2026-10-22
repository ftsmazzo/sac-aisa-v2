import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { LogoMarca } from "@/components/ui";
import { MARCAS } from "@/lib/marcas";
import { buscarNaApi, type Ficha } from "@/lib/reclamacoes";
import {
  data,
  ROTULO_DEVOLUCAO,
  ROTULO_SITUACAO,
} from "@/lib/reclamacoes-formato";
import { obterUsuario } from "@/lib/sessao";

const DIA_MS = 864e5;

/** Prazo em texto: dias em aberto, ou quantos dias levou para resolver. */
function prazo(f: Ficha, hoje: Date): string {
  if (!f.dataAbertura) return "—";
  const ini = Date.parse(f.dataAbertura);
  if (f.dataAcao) {
    const d = Math.max(0, Math.round((Date.parse(f.dataAcao) - ini) / DIA_MS));
    return `Resolvida em ${d} ${d === 1 ? "dia" : "dias"}`;
  }
  const d = Math.max(0, Math.floor((hoje.getTime() - ini) / DIA_MS));
  return `Em aberto há ${d} ${d === 1 ? "dia" : "dias"}`;
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="folha__campo">
      <dt>{rotulo}</dt>
      <dd>{valor?.trim() || "—"}</dd>
    </div>
  );
}

function Texto({ rotulo, valor }: { rotulo: string; valor: string }) {
  if (!valor.trim()) return null;
  return (
    <section className="folha__bloco">
      <h2 className="folha__subtitulo">{rotulo}</h2>
      <p className="folha__texto">{valor}</p>
    </section>
  );
}

/**
 * Folha de impressão da reclamação, em A4. O menu e os botões somem na impressão.
 * Só leva o mínimo de dado pessoal que a ficha já mostra: pedido e cidade, sem nome do cliente.
 */
export default async function ImprimirReclamacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  const { id } = await params;
  const resp = await buscarNaApi<Ficha>(
    `/reclamacoes/${encodeURIComponent(id)}`,
  );
  if (!resp.ok && resp.status === 401) redirect("/login");

  if (!resp.ok) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">
          {resp.status === 404
            ? "Reclamação não encontrada"
            : "Não foi possível abrir a folha"}
        </h1>
        <p className="vazio__texto">
          {resp.status === 404
            ? "Ela não existe ou não é do seu setor."
            : "Tente de novo em instantes."}
        </p>
        <Link href="/reclamacoes" className="botao botao--secundario">
          Voltar para a lista
        </Link>
      </section>
    );
  }

  const f = resp.dados;
  const logo = MARCAS.find((m) => m.nome === f.marca?.nome.toUpperCase());
  const agora = new Date();
  const impresso = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(agora);

  return (
    <>
      <div className="pagina__cab pagina__cab--acao sem-impressao">
        <div className="pagina__cab-texto">
          <h1 className="pagina__titulo">Folha da reclamação {f.numero}</h1>
          <p className="pagina__apoio">
            Confira e use Imprimir. A folha sai em A4.
          </p>
        </div>
        <div className="ficha__acoes">
          <BotaoImprimir />
          <Link
            href={`/reclamacoes?ficha=${encodeURIComponent(f.id)}`}
            className="botao botao--secundario"
          >
            Voltar à ficha
          </Link>
        </div>
      </div>

      <article className="folha" aria-label={`Reclamação ${f.numero}`}>
        <header className="folha__cab">
          {logo ? (
            <LogoMarca marca={logo.id} altura={40} />
          ) : (
            <strong className="folha__marca">{f.marca?.nome ?? "SAC"}</strong>
          )}
          <div className="folha__titulo-bloco">
            <p className="folha__numero">Reclamação #{f.numero}</p>
            <p className="folha__protocolo">
              Protocolo: {f.protocoloExterno?.trim() || "—"}
            </p>
          </div>
        </header>

        <dl className="folha__grade">
          <Campo rotulo="Situação" valor={ROTULO_SITUACAO[f.situacao]} />
          <Campo rotulo="Prazo" valor={prazo(f, agora)} />
          <Campo rotulo="Abertura" valor={data(f.dataAbertura)} />
          <Campo rotulo="Data de ação" valor={data(f.dataAcao)} />
          <Campo rotulo="Devolução" valor={ROTULO_DEVOLUCAO[f.devolucao]} />
          <Campo rotulo="Produto recebido em" valor={data(f.dataRecebimento)} />
        </dl>

        <section className="folha__bloco">
          <h2 className="folha__subtitulo">Produto e bancada</h2>
          <dl className="folha__grade">
            <Campo
              rotulo="Produto"
              valor={
                f.produto ? `${f.produto.codigo} · ${f.produto.nome}` : null
              }
            />
            <Campo
              rotulo="Bancada"
              valor={
                f.bancada
                  ? `${f.bancada.codigo}${f.bancada.nome ? ` · ${f.bancada.nome}` : ""}`
                  : null
              }
            />
            <Campo rotulo="Marca" valor={f.marca?.nome} />
            <Campo rotulo="Canal" valor={f.canal.nome} />
            <Campo rotulo="Peça" valor={f.peca} />
            <Campo rotulo="Pedido" valor={f.pedido} />
            <Campo
              rotulo="Cidade"
              valor={[f.cidade, f.uf].filter(Boolean).join(" / ")}
            />
          </dl>
        </section>

        <section className="folha__bloco">
          <h2 className="folha__subtitulo">Causas e setor</h2>
          <dl className="folha__grade">
            <Campo rotulo="Causa principal" valor={f.causa?.nome} />
            <Campo rotulo="Setor responsável" valor={f.setorResp?.nome} />
            {f.causasExtras.length > 0 && (
              <div className="folha__campo folha__campo--largo">
                <dt>Outros motivos</dt>
                <dd>{f.causasExtras.map((c) => c.nome).join(" · ")}</dd>
              </div>
            )}
          </dl>
        </section>

        <Texto rotulo="O que aconteceu" valor={f.descricao} />
        <Texto rotulo="Laudo" valor={f.laudo} />
        <Texto rotulo="Solução" valor={f.solucao} />

        {f.analises.length > 0 && (
          <section className="folha__bloco">
            <h2 className="folha__subtitulo">Análise do setor</h2>
            <ul className="folha__analises">
              {f.analises.map((a) => (
                <li key={a.id}>
                  <strong>{a.setor}</strong> · {data(a.criadoEm)}
                  <br />
                  {a.produtoPrecisaVoltar
                    ? "Produto precisa voltar."
                    : "Produto não precisa voltar."}
                  {a.produtoRecebidoEm &&
                    ` Recebido em ${data(a.produtoRecebidoEm)}.`}
                  {a.conclusao && ` ${a.conclusao}`}
                  {a.resultado && ` Resultado: ${a.resultado}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="folha__bloco folha__retorno">
          <h2 className="folha__subtitulo">Retorno do setor</h2>
          <div className="folha__linha" />
          <div className="folha__linha" />
          <p className="folha__assinatura">
            Responsável: ______________________________ Data: ____/____/______
          </p>
        </section>

        <footer className="folha__rodape">
          Impresso em {impresso} por {usuario.nome}
        </footer>
      </article>
    </>
  );
}
