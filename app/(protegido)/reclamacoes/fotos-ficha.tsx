"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { enviarFoto } from "./acoes";

const MAX = 5 * 1024 * 1024;

function base64(buf: Uint8Array): string {
  const partes: string[] = [];
  for (let i = 0; i < buf.length; i += 0x8000) {
    partes.push(String.fromCharCode(...buf.subarray(i, i + 0x8000)));
  }
  return btoa(partes.join(""));
}

/** Fotos da operação. A URL que o canal já gravou continua na lista, sem novo envio. */
export function FotosDaFicha({
  id,
  anexos,
}: {
  id: string;
  anexos: { id: string; nome: string; local: boolean }[];
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function escolher(arquivo: File | undefined) {
    setErro(null);
    if (!arquivo) return;
    if (arquivo.size > MAX) {
      setErro("A foto passa de 5 MB.");
      return;
    }
    iniciar(async () => {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const r = await enviarFoto(id, {
        nome: arquivo.name || "foto",
        tipo: arquivo.type,
        conteudo: base64(bytes),
      });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="ficha__bloco">
      <h3 className="ficha__subtitulo">Fotos</h3>
      {anexos.length === 0 ? (
        <p className="pagina__apoio">Nenhuma foto nesta ficha.</p>
      ) : (
        <ul className="ficha__analises">
          {anexos.map((f) => (
            <li key={f.id}>
              {f.local ? (
                <a href={`/reclamacoes/foto/${id}/${f.id}`}>{f.nome}</a>
              ) : (
                <span>{f.nome} · veio do canal</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <label className="filtro">
        <span className="filtro__rotulo">
          Enviar JPEG, PNG ou WebP, até 5 MB
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="filtro__campo"
          disabled={pendente}
          onChange={(e) => escolher(e.target.files?.[0])}
        />
      </label>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
