import { buscarNaApi, type LinhaDoTempo } from "@/lib/reclamacoes";
import { data } from "@/lib/reclamacoes-formato";
import "./jornada.css";

const ESTADO: Record<string, string> = {
  feita: "feita",
  atual: "agora",
  pendente: "a fazer",
  dispensada: "dispensada",
};

const MOMENTO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A história da reclamação, da entrada à resolução: as etapas, o próximo passo e os eventos
 * que a auditoria registrou. Se a API não responder, a ficha segue sem esta seção.
 */
export async function JornadaDaFicha({ id }: { id: string }) {
  const r = await buscarNaApi<LinhaDoTempo>(
    `/reclamacoes/${encodeURIComponent(id)}/linha-do-tempo`,
  );
  if (!r.ok) return null;
  const { eventos, etapas, proximo } = r.dados;

  return (
    <section className="jornada" aria-labelledby={`jornada-${id}`}>
      <h3 className="ficha__subtitulo" id={`jornada-${id}`}>
        Jornada da reclamação
      </h3>
      <ol className="jornada__etapas" aria-label="Etapas">
        {etapas.map((e) => (
          <li
            key={e.chave}
            className="jornada__etapa"
            data-estado={e.estado}
            aria-current={e.estado === "atual" ? "step" : undefined}
          >
            <span>{e.rotulo}</span>
            <span className="jornada__estado">{ESTADO[e.estado]}</span>
          </li>
        ))}
      </ol>
      {proximo && (
        <p className="jornada__proximo">
          <strong>Próximo passo:</strong> {proximo}
        </p>
      )}
      <ol className="linha" aria-label="Linha do tempo">
        {eventos.map((e) => (
          <li key={e.id} className="linha__item" data-tipo={e.tipo}>
            <span className="linha__marca" aria-hidden="true" />
            <div>
              <p className="linha__titulo">{e.titulo}</p>
              <p className="linha__meta">
                {e.tipo === "entrada" ||
                e.tipo === "recebimento" ||
                e.tipo === "resolucao"
                  ? data(e.data)
                  : MOMENTO.format(new Date(e.quando))}
                {e.autor && ` · ${e.autor}`}
              </p>
              {e.detalhe && <p className="linha__detalhe">{e.detalhe}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
