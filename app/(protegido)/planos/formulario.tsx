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
    <form action={gravar} className="cartao formulario">
      <h2 className="ficha__subtitulo">Novo plano</h2>
      <label className="filtro">
        <span className="filtro__rotulo">Título</span>
        <input
          name="titulo"
          required
          className="filtro__campo"
          maxLength={160}
        />
      </label>
      <label className="filtro">
        <span className="filtro__rotulo">O que vai ser feito</span>
        <textarea name="descricao" className="filtro__campo" rows={3} />
      </label>
      <label className="filtro">
        <span className="filtro__rotulo">Causa que o plano ataca</span>
        <select name="causaId" className="filtro__campo" required>
          <option value="">Escolha</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <Botao type="submit" disabled={pendente}>
        Gravar plano
      </Botao>
    </form>
  );
}

export function BotaoEfeito({ id }: { id: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div>
      <button
        type="button"
        className="botao"
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
      {texto && <p className="pagina__apoio">{texto}</p>}
    </div>
  );
}
