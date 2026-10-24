"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import type { TransicaoDisponivel } from "@/lib/reclamacoes";
import { mudarEstado } from "./acoes";
import "./jornada.css";

const MOTIVO_MAX = 200;

const textoDoBotao = (t: TransicaoDisponivel) => t.rotulo;

const ORIENTACAO: Record<string, string> = {
  triagem:
    "A reclamação está com o SAC. Use a análise da IA e escolha um passo.",
  aguardando_cliente:
    "O SAC espera o cliente. Quando a resposta chegar, traga de volta para a triagem.",
  encaminhada:
    "O setor já está com esta reclamação. Registre o diagnóstico ou devolva ao SAC.",
  recebida:
    "O setor recebeu. Ao gravar o diagnóstico, ela passa para Em tratativa.",
  em_tratativa:
    "O setor está no diagnóstico. No fim, devolva ao SAC ou mande a outro setor.",
  resolvida_setor:
    "A reclamação voltou ao SAC. Envie a resposta no marketplace e só então feche.",
  finalizada:
    "Atendimento fechado. Registre se o cliente confirmou o reparo, o reenvio ou ficou satisfeito.",
};

/**
 * Os botões do que esta pessoa pode fazer agora. Quem decide é a API: a tela só mostra o que
 * ela mandou em `transicoes`. Se a opção pede motivo, abre o campo antes de enviar.
 */
export function ProximoPasso({
  id,
  estado,
  transicoes,
}: {
  id: string;
  estado: string;
  transicoes: TransicaoDisponivel[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberta, setAberta] = useState<TransicaoDisponivel | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const normais = transicoes.filter((t) => !t.excepcional);
  const outras = transicoes.filter((t) => t.excepcional);
  if (transicoes.length === 0 && !ORIENTACAO[estado]) return null;

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
      {ORIENTACAO[estado] && (
        <p className="pagina__apoio">{ORIENTACAO[estado]}</p>
      )}
      <div className="passo__botoes">
        {normais.map((t) => (
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
      {outras.length > 0 && (
        <details className="passo__motivo">
          <summary>Outra passagem</summary>
          <p className="campo__ajuda">
            Fora do passo desta etapa. O motivo fica registrado.
          </p>
          <div className="passo__botoes">
            {outras.map((t) => (
              <Botao
                key={t.para}
                variante="secundario"
                disabled={pendente}
                onClick={() => escolher(t)}
              >
                {textoDoBotao(t)}
              </Botao>
            ))}
          </div>
        </details>
      )}

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
              {aberta.rotulo === "Encaminhar a outro setor" &&
                " Troque o setor em Editar, se ainda não trocou."}
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
