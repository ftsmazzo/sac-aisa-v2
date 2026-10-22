"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Botao, Selo } from "@/components/ui";
import {
  type AnaliseVisao,
  percentual,
  ROTULO_ACEITE,
  type VisaoIa,
} from "@/lib/ia";
import { salvarReclamacao } from "./acoes";
import {
  aceitarIa,
  analisarIa,
  carregarIa,
  novaPerguntaIa,
  type ResultadoIa,
} from "./acoes-ia";
import { PerguntasIa } from "./perguntas-ia";
import "./ia.css";

/** Copia para a área de transferência; sem a API moderna (HTTP, navegador antigo), usa a seleção do texto. */
async function copiar(texto: string, alvo: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    if (!alvo) return false;
    alvo.focus();
    alvo.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

function Decisao({
  id,
  visao,
  analise,
  podeAplicar,
  atualizar,
  trocarCausa,
}: {
  id: string;
  visao: VisaoIa;
  analise: AnaliseVisao;
  podeAplicar: boolean;
  atualizar: () => Promise<void>;
  trocarCausa: (causaId: string) => void;
}) {
  const router = useRouter();
  const inicial = analise.causaEscolhidaId ?? analise.causa?.id ?? "";
  const [causa, setCausa] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const decidida = analise.aceite !== null;
  const categorias = [...new Set(visao.causas.map((c) => c.categoria))];

  async function decidir(aceite: "aceita" | "recusada", aplicar = false) {
    setOcupado(true);
    setAviso(null);
    const r = await aceitarIa(id, {
      registroId: analise.registroId,
      aceite,
      causaId: aceite === "aceita" ? causa : undefined,
    });
    if (!r.ok) {
      setAviso(r.mensagem);
      setOcupado(false);
      return;
    }
    if (aplicar) {
      const g = await salvarReclamacao(id, { causaId: causa });
      if (!g.ok) setAviso(g.mensagem);
      else router.refresh();
    }
    await atualizar();
    setOcupado(false);
  }

  return (
    <div className="ia-decisao">
      <dl className="ia-resumo">
        {analise.sintese && (
          <div>
            <dt>Síntese</dt>
            <dd>{analise.sintese}</dd>
          </div>
        )}
        <div>
          <dt>Causa sugerida</dt>
          <dd>
            {analise.causa?.nome ?? "Sem sugestão"}
            {analise.fonte === "regras" && " (pelas regras do sistema)"}
          </dd>
        </div>
        <div>
          <dt>Setor sugerido</dt>
          <dd>
            {analise.setor?.nome ?? "—"}
            <span className="ia-resumo__apoio"> (pela regra da causa)</span>
          </dd>
        </div>
        <div>
          <dt>Confiança</dt>
          <dd>{percentual(analise.confianca)}</dd>
        </div>
      </dl>
      <div className="ia-decisao__linha">
        <label htmlFor={`ia-causa-${id}`}>Sua decisão sobre a causa</label>
        <select
          id={`ia-causa-${id}`}
          value={causa}
          disabled={ocupado}
          onChange={(e) => {
            setCausa(e.target.value);
            trocarCausa(e.target.value);
          }}
        >
          {!inicial && <option value="">Escolha a causa…</option>}
          {categorias.map((cat) => (
            <optgroup key={cat} label={cat}>
              {visao.causas
                .filter((c) => c.categoria === cat)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} → {c.setor}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div className="ia-decisao__botoes">
          <Botao disabled={ocupado || !causa} onClick={() => decidir("aceita")}>
            {causa === analise.causa?.id ? "Aceitar" : "Usar a causa escolhida"}
          </Botao>
          <Botao
            variante="secundario"
            disabled={ocupado}
            onClick={() => decidir("recusada")}
          >
            Ignorar
          </Botao>
          {podeAplicar && (
            <Botao
              variante="secundario"
              disabled={ocupado || !causa}
              onClick={() => decidir("aceita", true)}
            >
              Aceitar e gravar na ficha
            </Botao>
          )}
        </div>
      </div>
      {decidida && (
        <p className="ia-decisao__registro" role="status">
          Registrado:{" "}
          {ROTULO_ACEITE[analise.aceite as keyof typeof ROTULO_ACEITE]}. A causa
          e o estado da reclamação só mudam pela ficha, nunca pela IA.
        </p>
      )}
      {aviso && (
        <p className="aviso aviso--erro" role="alert">
          {aviso}
        </p>
      )}
    </div>
  );
}

function Mensagem({
  id,
  analise,
  temFaltantes,
  nova,
  ocupado,
  atualizar,
}: {
  id: string;
  analise: AnaliseVisao;
  temFaltantes: boolean;
  nova: () => void;
  ocupado: boolean;
  atualizar: () => Promise<void>;
}) {
  const [texto, setTexto] = useState(analise.mensagem ?? "");
  const [copiado, setCopiado] = useState<"sim" | "erro" | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTexto(analise.mensagem ?? "");
  }, [analise.mensagem]);
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  async function aoCopiar() {
    const ok = await copiar(texto, area.current);
    setCopiado(ok ? "sim" : "erro");
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setCopiado(null), 3000);
    // Copiar vale como aceite: igual ao sugerido é "aceita"; editado é "alterada". O servidor decide.
    if (ok && analise.registroPerguntaId) {
      await aceitarIa(id, {
        registroId: analise.registroPerguntaId,
        aceite: "aceita",
        textoFinal: texto,
      });
      await atualizar();
    }
  }

  if (!analise.mensagem) {
    return temFaltantes ? (
      <div className="ia-bloco">
        <p className="pagina__apoio">
          Há perguntas sem resposta, mas a IA não redigiu a mensagem agora.
        </p>
        <Botao variante="secundario" disabled={ocupado} onClick={nova}>
          Gerar mensagem ao cliente
        </Botao>
      </div>
    ) : null;
  }

  return (
    <section className="ia-bloco" aria-label="Mensagem pronta ao cliente">
      <h4 className="ia-bloco__titulo">Mensagem pronta ao cliente</h4>
      <p className="pagina__apoio">
        Revise, edite se quiser e cole no chat do marketplace. O botão só copia;
        nada é enviado por aqui.
      </p>
      <textarea
        ref={area}
        className="ia-mensagem"
        rows={7}
        maxLength={1500}
        value={texto}
        aria-label="Texto da mensagem ao cliente"
        onChange={(e) => setTexto(e.target.value)}
      />
      {analise.avisos.length > 0 && (
        <ul className="aviso aviso--info ia-avisos" role="status">
          {analise.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="ia-decisao__botoes">
        <Botao onClick={aoCopiar} disabled={texto.trim() === ""}>
          Copiar
        </Botao>
        {temFaltantes && (
          <Botao variante="secundario" disabled={ocupado} onClick={nova}>
            Gerar nova mensagem
          </Botao>
        )}
        <span className="ia-copiado" role="status" aria-live="polite">
          {copiado === "sim" && <Selo tom="ok">Copiado ✓ Cole no chat</Selo>}
          {copiado === "erro" && (
            <Selo tom="perigo">Não deu para copiar: selecione o texto</Selo>
          )}
        </span>
      </div>
      {analise.mensagemAceite && (
        <p className="ia-decisao__registro">
          Registrado: {ROTULO_ACEITE[analise.mensagemAceite]}.
        </p>
      )}
    </section>
  );
}

/**
 * Triagem por IA na ficha. A IA só sugere: a pessoa decide a causa, registra o que o cliente
 * respondeu e copia a mensagem. Sem chave, mostra o aviso e o formulário segue como sempre.
 */
export function TriagemIa({
  id,
  podeEditar,
  podeAplicar,
}: {
  id: string;
  podeEditar: boolean;
  podeAplicar: boolean;
}) {
  const [visao, setVisao] = useState<VisaoIa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const aplicar = useCallback((r: ResultadoIa<VisaoIa>) => {
    if (r.ok) {
      setVisao(r.dados);
      setErro(null);
    } else setErro(r.mensagem);
  }, []);

  const atualizar = useCallback(async () => {
    aplicar(await carregarIa(id));
  }, [id, aplicar]);

  useEffect(() => {
    let vivo = true;
    carregarIa(id).then((r) => {
      if (vivo) aplicar(r);
    });
    return () => {
      vivo = false;
    };
  }, [id, aplicar]);

  async function rodar(f: () => Promise<ResultadoIa<VisaoIa>>) {
    setOcupado(true);
    aplicar(await f());
    setOcupado(false);
  }

  const analise = visao?.analise ?? null;
  const faltantes = (visao?.perguntas ?? []).some(
    (p) =>
      p.obrigatoria && p.estado !== "respondida" && p.estado !== "dispensada",
  );
  const bloqueada = !visao?.configurada || visao.consumo.limiteAtingido;

  return (
    <section className="ia" aria-labelledby={`ia-${id}`}>
      <div className="ia__cab">
        <h3 className="ficha__subtitulo" id={`ia-${id}`}>
          Triagem por IA
        </h3>
        <Botao
          disabled={ocupado || !visao || bloqueada}
          onClick={() => rodar(() => analisarIa(id))}
        >
          {ocupado ? "Analisando…" : analise ? "Analisar de novo" : "Analisar"}
        </Botao>
      </div>
      <p className="ia__nota" role="status" aria-live="polite">
        {ocupado
          ? "A IA está lendo o texto (sem nome, telefone, e-mail, endereço nem pedido)…"
          : "A IA só sugere. Quem decide é você; ela não muda causa, setor nem estado."}
      </p>
      {!visao && !erro && <p className="pagina__apoio">Carregando…</p>}
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
      {visao?.aviso && (
        <p className="aviso aviso--info" role="status">
          {visao.aviso}
        </p>
      )}
      {analise && visao && (
        <Decisao
          key={analise.registroId}
          id={id}
          visao={visao}
          analise={analise}
          podeAplicar={podeAplicar}
          atualizar={atualizar}
          trocarCausa={async (causaId) =>
            aplicar(await carregarIa(id, causaId))
          }
        />
      )}
      {visao && (
        <PerguntasIa
          idReclamacao={id}
          perguntas={visao.perguntas}
          podeEditar={podeEditar}
          depois={atualizar}
        />
      )}
      {analise && visao && (
        <Mensagem
          key={`${analise.registroPerguntaId ?? "sem"}-${analise.mensagem ?? ""}`}
          id={id}
          analise={analise}
          temFaltantes={faltantes}
          nova={() => rodar(() => novaPerguntaIa(id))}
          ocupado={ocupado}
          atualizar={atualizar}
        />
      )}
      {visao?.configurada && (
        <p className="ia__rodape">
          Modelo {visao.modelo} · hoje {visao.consumo.chamadas} de{" "}
          {visao.consumo.limiteChamadas} chamadas
        </p>
      )}
    </section>
  );
}
