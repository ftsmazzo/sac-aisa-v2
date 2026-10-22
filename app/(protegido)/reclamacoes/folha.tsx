import { LogoMarca } from "@/components/ui";
import { marcaVisual } from "@/lib/marca-escolhida";
import type { Ficha } from "@/lib/reclamacoes";
import {
  data,
  ROTULO_DEVOLUCAO,
  ROTULO_SITUACAO,
} from "@/lib/reclamacoes-formato";

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
 * Folha A4 de uma reclamação, usada na impressão individual e em lote.
 * Só leva o mínimo de dado pessoal que a ficha já mostra: pedido e cidade, sem nome do cliente.
 */
export function FolhaReclamacao({
  f,
  agora,
  impresso,
  usuarioNome,
}: {
  f: Ficha;
  agora: Date;
  impresso: string;
  usuarioNome: string;
}) {
  const logo = marcaVisual(f.marca?.nome);
  return (
    <article className="folha" aria-label={`Reclamação ${f.numero}`}>
      <header className="folha__cab">
        {logo ? (
          <LogoMarca marca={logo} altura={40} />
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
            valor={f.produto ? `${f.produto.codigo} · ${f.produto.nome}` : null}
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
        Impresso em {impresso} por {usuarioNome}
      </footer>
    </article>
  );
}

/** Data e hora de Brasília para o rodapé da folha. */
export function impressoEm(agora: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}
