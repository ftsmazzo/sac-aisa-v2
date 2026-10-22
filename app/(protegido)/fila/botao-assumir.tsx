"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { mudarEstado } from "../reclamacoes/acoes";

/** Passa a reclamação para "Recebida pelo setor". Quem confere a permissão é a API. */
export function BotaoAssumir({ id, numero }: { id: string; numero: number }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <Botao
        variante="secundario"
        disabled={pendente}
        aria-label={`Assumir a reclamação ${numero}`}
        onClick={() => {
          setErro(null);
          iniciar(async () => {
            const r = await mudarEstado(id, "recebida");
            if (!r.ok) setErro(r.mensagem);
            else router.refresh();
          });
        }}
      >
        {pendente ? "Assumindo…" : "Assumir"}
      </Botao>
      {erro && (
        <span className="aviso aviso--erro" role="alert">
          {erro}
        </span>
      )}
    </>
  );
}
