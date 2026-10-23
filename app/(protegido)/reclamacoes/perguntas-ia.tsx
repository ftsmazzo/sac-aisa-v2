"use client";

import { useState, useTransition } from "react";
import { Botao, Selo } from "@/components/ui";
import {
  type PerguntaVisao,
  ROTULO_CATEGORIA,
  ROTULO_ESTADO_PERGUNTA,
} from "@/lib/ia";
import { responderIa } from "./acoes-ia";
import "./ia.css";

const TOM = {
  respondida: "ok",
  dispensada: "info",
  sugerida: "atencao",
  falta: "perigo",
} as const;

function Entrada({
  p,
  valor,
  aoMudar,
  id,
}: {
  p: PerguntaVisao;
  valor: string;
  aoMudar: (v: string) => void;
  id: string;
}) {
  if (p.tipo === "escolha") {
    return (
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Escolha…</option>
        {p.opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (p.tipo === "sim_nao") {
    return (
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Escolha…</option>
        <option value="Sim">Sim</option>
        <option value="Não">Não</option>
      </select>
    );
  }
  if (p.tipo === "foto") {
    return (
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Foto ainda não chegou</option>
        <option value="Foto recebida">Foto recebida do cliente</option>
      </select>
    );
  }
  return (
    <input
      id={id}
      type={
        p.tipo === "numero" ? "number" : p.tipo === "data" ? "date" : "text"
      }
      value={valor}
      maxLength={500}
      placeholder={p.exemplo ? `Ex.: ${p.exemplo}` : undefined}
      onChange={(e) => aoMudar(e.target.value)}
    />
  );
}

function Linha({
  idReclamacao,
  p,
  podeEditar,
  depois,
}: {
  idReclamacao: string;
  p: PerguntaVisao;
  podeEditar: boolean;
  depois: () => Promise<void>;
}) {
  const [valor, setValor] = useState(p.valor);
  const [dispensando, setDispensando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = `ia-${idReclamacao}-${p.chave}`;

  function enviar(corpo: Parameters<typeof responderIa>[1]) {
    setErro(null);
    iniciar(async () => {
      const r = await responderIa(idReclamacao, corpo);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setDispensando(false);
      await depois();
    });
  }

  return (
    <li className="ia-pergunta" data-estado={p.estado}>
      <div className="ia-pergunta__cab">
        <label htmlFor={campo}>{p.texto}</label>
        <Selo tom={TOM[p.estado]}>{ROTULO_ESTADO_PERGUNTA[p.estado]}</Selo>
        {!p.obrigatoria && <span className="ia-pergunta__opc">opcional</span>}
      </div>
      {p.estado === "sugerida" && (
        <p className="ia-pergunta__sugestao">
          A IA achou no texto: <strong>{p.sugestaoIa}</strong>. Confirme só se o
          cliente disse isso mesmo.
        </p>
      )}
      {podeEditar && (
        <div className="ia-pergunta__acoes">
          <Entrada p={p} id={campo} valor={valor} aoMudar={setValor} />
          {p.estado === "sugerida" && (
            <Botao
              variante="secundario"
              disabled={pendente}
              onClick={() =>
                enviar({
                  chave: p.chave,
                  valor: p.sugestaoIa,
                  origem: "ia_confirmada",
                })
              }
            >
              Confirmar
            </Botao>
          )}
          <Botao
            variante="secundario"
            disabled={pendente || valor.trim() === ""}
            onClick={() => enviar({ chave: p.chave, valor })}
          >
            Registrar
          </Botao>
          {p.estado !== "respondida" && (
            <Botao
              variante="secundario"
              disabled={pendente}
              onClick={() => setDispensando((d) => !d)}
              aria-expanded={dispensando}
            >
              Dispensar
            </Botao>
          )}
        </div>
      )}
      {dispensando && (
        <div className="ia-pergunta__acoes">
          <input
            type="text"
            value={motivo}
            maxLength={200}
            aria-label={`Motivo para dispensar: ${p.texto}`}
            placeholder="Por que não precisa?"
            onChange={(e) => setMotivo(e.target.value)}
          />
          <Botao
            disabled={pendente || motivo.trim() === ""}
            onClick={() => enviar({ chave: p.chave, dispensada: true, motivo })}
          >
            Dispensar
          </Botao>
        </div>
      )}
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
    </li>
  );
}

/** O que o SAC precisa ver respondido, por tipo de produto e de causa. O que falta aparece primeiro. */
export function PerguntasIa({
  idReclamacao,
  perguntas,
  podeEditar,
  depois,
}: {
  idReclamacao: string;
  perguntas: PerguntaVisao[];
  podeEditar: boolean;
  depois: () => Promise<void>;
}) {
  if (perguntas.length === 0) return null;
  const faltam = perguntas.filter(
    (p) => p.obrigatoria && (p.estado === "falta" || p.estado === "sugerida"),
  ).length;
  const categorias = [...new Set(perguntas.map((p) => p.categoria))];
  return (
    <section className="ia-bloco" aria-label="Informações para a tratativa">
      <h4 className="ia-bloco__titulo">
        O que falta perguntar
        <Selo tom={faltam ? "atencao" : "ok"}>
          {faltam
            ? `${faltam} obrigatória${faltam > 1 ? "s" : ""} sem resposta`
            : "Tudo respondido"}
        </Selo>
      </h4>
      {categorias.map((c) => (
        <div key={c}>
          {categorias.length > 1 && (
            <p className="ia-bloco__grupo">{ROTULO_CATEGORIA[c] ?? c}</p>
          )}
          <ul className="ia-perguntas">
            {perguntas
              .filter((p) => p.categoria === c)
              .map((p) => (
                <Linha
                  key={`${p.chave}-${p.estado}-${p.valor}`}
                  idReclamacao={idReclamacao}
                  p={p}
                  podeEditar={podeEditar}
                  depois={depois}
                />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
