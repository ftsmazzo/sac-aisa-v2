"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { rascunhoDeResposta } from "@/lib/resposta-fechamento";
import { enviarResposta } from "./acoes";

/** A volta ao SAC: a resposta de fechamento, com hora de envio. */
export function RespostaSac({
  id,
  solucao,
  conclusoes,
  custoTotal,
  textoEnviado,
  enviadaEm,
}: {
  id: string;
  solucao: string;
  conclusoes: string[];
  custoTotal: number;
  textoEnviado: string;
  enviadaEm: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState(textoEnviado);
  const [erro, setErro] = useState<string | null>(null);

  function gerar() {
    setTexto(rascunhoDeResposta({ solucao, conclusoes, custoTotal }));
    setErro(null);
  }

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const r = await enviarResposta(id, texto);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="ficha__bloco" aria-labelledby={`resposta-${id}`}>
      <h3 className="ficha__subtitulo" id={`resposta-${id}`}>
        Resposta ao cliente
      </h3>
      <p className="pagina__apoio">
        A resposta usa a solução, o diagnóstico do setor e os custos. Gere,
        revise e registre o envio no marketplace. Fechar só aparece depois
        disso, com a solução preenchida.
      </p>
      {enviadaEm && (
        <p className="pagina__apoio">
          Enviada em{" "}
          {new Date(enviadaEm).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
          .
        </p>
      )}
      <div className="campo">
        <label className="campo__rotulo" htmlFor={`texto-resposta-${id}`}>
          Mensagem
        </label>
        <div className="campo__entrada">
          <textarea
            id={`texto-resposta-${id}`}
            rows={8}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={pendente}
          />
        </div>
      </div>
      <div className="passo__botoes">
        <Botao variante="secundario" disabled={pendente} onClick={gerar}>
          Gerar resposta
        </Botao>
        <Botao disabled={pendente || texto.trim() === ""} onClick={enviar}>
          {pendente ? "Enviando…" : "Enviar no marketplace"}
        </Botao>
      </div>
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
