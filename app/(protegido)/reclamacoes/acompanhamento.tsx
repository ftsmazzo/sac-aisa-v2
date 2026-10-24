"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { ROTULO_ACOMPANHAMENTO } from "@/lib/resposta-fechamento";
import { registrarAcompanhamento } from "./acoes";

/** Depois do fechamento: o cliente confirmou o reparo, o reenvio ou ficou satisfeito. */
export function Acompanhamento({ id, atual }: { id: string; atual: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function escolher(valor: string) {
    setErro(null);
    iniciar(async () => {
      const r = await registrarAcompanhamento(id, valor);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="ficha__bloco" aria-labelledby={`acompanha-${id}`}>
      <h3 className="ficha__subtitulo" id={`acompanha-${id}`}>
        Acompanhamento
      </h3>
      <p className="pagina__apoio">
        O atendimento já fechou. Registre se o cliente confirmou o reparo, o
        reenvio ou ficou satisfeito. Se não ficou, use Reabrir com o setor.
      </p>
      {atual && (
        <p className="pagina__apoio">
          Último registro: {ROTULO_ACOMPANHAMENTO[atual] ?? atual}.
        </p>
      )}
      <div className="passo__botoes">
        {Object.entries(ROTULO_ACOMPANHAMENTO).map(([valor, rotulo]) => (
          <Botao
            key={valor}
            variante={valor === "insatisfeito" ? "secundario" : "primario"}
            disabled={pendente}
            onClick={() => escolher(valor)}
          >
            {rotulo}
          </Botao>
        ))}
      </div>
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
