import { formatarDuracao, formatarPrazo } from "@/lib/duracao";
import type { Ficha } from "@/lib/reclamacoes";
import { data, ESTADOS, ROTULO_ESTADO } from "@/lib/reclamacoes-formato";
import "./jornada.css";

const MOMENTO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Linha({
  rotulo,
  valor,
  apoio,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
}) {
  return (
    <div className="tempos__linha">
      <dt>{rotulo}</dt>
      <dd>
        {valor}
        {apoio && <span className="tempos__apoio"> · {apoio}</span>}
      </dd>
    </div>
  );
}

/** Quanto tempo a reclamação passou em cada etapa, mais o prazo do canal (conta à parte). */
export function Tempos({ ficha }: { ficha: Ficha }) {
  const r = ficha.relogios;
  const porEstado = ESTADOS.filter((e) => (r.porEstadoMs[e] ?? 0) > 0);
  return (
    <section className="tempos" aria-labelledby={`tempos-${ficha.id}`}>
      <h3 className="ficha__subtitulo" id={`tempos-${ficha.id}`}>
        Tempos
      </h3>
      <dl className="tempos__lista">
        {porEstado.map((e) => (
          <Linha
            key={e}
            rotulo={ROTULO_ESTADO[e]}
            valor={formatarDuracao(r.porEstadoMs[e])}
          />
        ))}
        {r.ateRecebimentoMs !== null && (
          <Linha
            rotulo="Até o setor receber"
            valor={formatarDuracao(r.ateRecebimentoMs)}
            apoio={r.ateRecebimentoEmCurso ? "em curso" : undefined}
          />
        )}
        <Linha rotulo="Tratativa" valor={formatarDuracao(r.tratativaMs)} />
        {r.ateFinalizacaoMs !== null && (
          <Linha
            rotulo="Até o SAC finalizar"
            valor={formatarDuracao(r.ateFinalizacaoMs)}
            apoio={r.ateFinalizacaoEmCurso ? "em curso" : undefined}
          />
        )}
        <Linha
          rotulo="Relógio interno"
          valor={formatarDuracao(r.internoMs)}
          apoio={r.pausado ? "pausado (aguardando cliente)" : undefined}
        />
      </dl>
      {r.marketplace && (
        <p
          className="tempos__canal"
          data-vencido={
            r.marketplace.vencido && !r.marketplace.encerrado
              ? "sim"
              : undefined
          }
        >
          <strong>Prazo do marketplace:</strong> {data(r.marketplace.prazo)} ·{" "}
          {formatarPrazo(r.marketplace)}
          <span className="tempos__apoio"> (conta à parte, não pausa)</span>
        </p>
      )}
    </section>
  );
}

/** Lista curta dos estados por que a reclamação passou, do mais novo ao mais antigo. */
export function HistoricoEstados({ ficha }: { ficha: Ficha }) {
  if (ficha.historicoEstados.length === 0) return null;
  const itens = [...ficha.historicoEstados].reverse();
  return (
    <section className="historico" aria-labelledby={`hist-${ficha.id}`}>
      <h3 className="ficha__subtitulo" id={`hist-${ficha.id}`}>
        Histórico de estados
      </h3>
      <ol className="historico__lista">
        {itens.map((h) => (
          <li key={`${h.estado}-${h.quando}`}>
            <span>{ROTULO_ESTADO[h.estado] ?? h.estado}</span>
            <time dateTime={h.quando}>
              {MOMENTO.format(new Date(h.quando))}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
