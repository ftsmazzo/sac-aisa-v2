"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { criarPlano, medirPlano } from "./acoes";

export function FormularioPlano({
  causas,
}: {
  causas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function gravar(dados: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await criarPlano({
        titulo: String(dados.get("titulo") ?? ""),
        descricao: String(dados.get("descricao") ?? ""),
        causaId: String(dados.get("causaId") ?? ""),
      });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={gravar} className="cartao">
      <h2 className="ficha__subtitulo">Novo plano</h2>
      <div className="planos__campo">
        <label htmlFor="plano-titulo">Título</label>
        <input id="plano-titulo" name="titulo" required maxLength={160} />
      </div>
      <div className="planos__campo">
        <label htmlFor="plano-descricao">O que vai ser feito</label>
        <textarea id="plano-descricao" name="descricao" rows={4} />
      </div>
      <div className="planos__campo">
        <label htmlFor="plano-causa">Causa que o plano ataca</label>
        <select id="plano-causa" name="causaId" required>
          <option value="">Escolha</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
      <div className="planos__acoes">
        <Botao type="submit" disabled={pendente}>
          Gravar plano
        </Botao>
      </div>
    </form>
  );
}

export function BotaoEfeito({ id }: { id: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <div className="planos__item-acoes">
        <button
          type="button"
          className="botao botao--secundario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await medirPlano(id);
              if (!r.ok) {
                setTexto(r.mensagem);
                return;
              }
              setTexto(
                r.reabrir
                  ? "A ocorrência não caiu. O plano voltou para andamento."
                  : "A ocorrência caiu. O plano foi concluído.",
              );
              router.refresh();
            })
          }
        >
          Medir efeito
        </button>
      </div>
      {texto && (
        <p className="planos__resultado pagina__apoio" role="status">
          {texto}
        </p>
      )}
    </>
  );
}
