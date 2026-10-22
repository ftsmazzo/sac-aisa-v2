"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mensagemTreino } from "@/lib/treino";

/** Liga ou desliga a visão de treino do próprio usuário. A escolha fica gravada no cadastro dele. */
export function AlternarTreino({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/treino/modo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !ativo }),
      });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => ({}))) as {
          message?: string;
        };
        setErro(mensagemTreino(r.status, corpo.message));
        return;
      }
      router.refresh();
    } catch {
      setErro(mensagemTreino(502));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="alternar-treino">
      <button
        type="button"
        className="alternar-treino__botao"
        role="switch"
        aria-checked={ativo}
        onClick={alternar}
        disabled={ocupado}
        title="Mostra só dados fictícios de treino. Não mexe nos dados reais."
      >
        <span className="alternar-treino__trilho" aria-hidden="true" />
        Modo treino
      </button>
      {erro && (
        <span className="alternar-treino__erro" role="alert">
          {erro}
        </span>
      )}
    </span>
  );
}
