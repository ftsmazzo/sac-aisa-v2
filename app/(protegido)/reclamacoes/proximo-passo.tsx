"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import type { TransicaoDisponivel } from "@/lib/reclamacoes";
import { mudarEstado } from "./acoes";
import "./jornada.css";

const MOTIVO_MAX = 200;

const textoDoBotao = (t: TransicaoDisponivel) =>
  t.reabertura ? "Reabrir (volta a Encaminhada ao setor)" : t.rotulo;

/**
 * Os botões do que esta pessoa pode fazer agora. Quem decide é a API: a tela só mostra o que
 * ela mandou em `transicoes`. Se a opção pede motivo, abre o campo antes de enviar.
 */
export function ProximoPasso({
  id,
  transicoes,
}: {
  id: string;
  transicoes: TransicaoDisponivel[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberta, setAberta] = useState<TransicaoDisponivel | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (transicoes.length === 0) return null;

  function enviar(t: TransicaoDisponivel, texto?: string) {
    setErro(null);
    iniciar(async () => {
      const r = await mudarEstado(id, t.para, texto);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setAberta(null);
      setMotivo("");
      router.refresh();
    });
  }

  function escolher(t: TransicaoDisponivel) {
    setErro(null);
    if (t.exigeMotivo || t.reabertura) {
      setAberta(t);
      setMotivo("");
    } else {
      setAberta(null);
      enviar(t);
    }
  }

  const motivoPronto = motivo.trim().length > 0;

  return (
    <section className="passo" aria-labelledby={`passo-${id}`}>
      <h3 className="ficha__subtitulo" id={`passo-${id}`}>
        Próximo passo
      </h3>
      <div className="passo__botoes">
        {transicoes.map((t) => (
          <Botao
            key={`${t.para}-${t.reabertura}`}
            variante={t.reabertura ? "secundario" : "primario"}
            disabled={pendente}
            onClick={() => escolher(t)}
          >
            {textoDoBotao(t)}
          </Botao>
        ))}
      </div>

      {aberta && (
        <form
          className="passo__motivo"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivoPronto && !pendente) enviar(aberta, motivo.trim());
          }}
        >
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`motivo-${id}`}>
              Motivo: {textoDoBotao(aberta)}
            </label>
            <div className="campo__entrada">
              <textarea
                id={`motivo-${id}`}
                rows={2}
                maxLength={MOTIVO_MAX}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={pendente}
              />
            </div>
            <span className="campo__ajuda">
              {motivo.length}/{MOTIVO_MAX} letras. Fica registrado no histórico.
            </span>
          </div>
          <div className="passo__botoes">
            <Botao type="submit" disabled={!motivoPronto || pendente}>
              {pendente ? "Enviando…" : "Confirmar"}
            </Botao>
            <Botao
              variante="secundario"
              disabled={pendente}
              onClick={() => {
                setAberta(null);
                setErro(null);
              }}
            >
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
