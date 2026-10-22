"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Botao } from "@/components/ui";
import { montarCorpoAnalise, type ValoresAnalise } from "@/lib/analise-form";
import { salvarAnalise } from "./acoes";

/**
 * Análise do setor. A pessoa decide se o produto precisa voltar e registra a conclusão;
 * o setor da análise e o efeito sobre a devolução da reclamação são da API, não desta tela.
 */
export function FormularioAnalise({
  reclamacaoId,
  analiseId,
  setorNome,
  inicial,
  depois,
}: {
  reclamacaoId: string;
  analiseId: string | null;
  setorNome: string;
  inicial: ValoresAnalise;
  depois: string;
}) {
  const router = useRouter();
  const base = useId();
  const [v, setV] = useState<ValoresAnalise>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const criando = analiseId === null;
  const sujo = JSON.stringify(v) !== JSON.stringify(inicial);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    const r = montarCorpoAnalise(v, inicial, criando);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    setEnviando(true);
    try {
      const res = await salvarAnalise(reclamacaoId, analiseId, r.corpo);
      if (res.ok) {
        router.push(depois, { scroll: false });
        router.refresh();
        return;
      }
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      setErro(res.mensagem);
    } catch {
      setErro("Não foi possível salvar agora. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="ficha-form"
      onSubmit={enviar}
      noValidate
      aria-label="Análise do setor"
    >
      <div className="ficha__corpo">
        <p className="pagina__apoio">
          Análise do setor <strong>{setorNome}</strong>. A decisão sobre o
          retorno do produto vem antes de finalizar a reclamação.
        </p>

        <div className="ficha-form__grade">
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`${base}-voltar`}>
              O produto precisa voltar? <span aria-hidden="true">*</span>
            </label>
            <div className="campo__entrada">
              <select
                id={`${base}-voltar`}
                value={v.voltar}
                onChange={(e) =>
                  setV((a) => ({
                    ...a,
                    voltar: e.target.value as ValoresAnalise["voltar"],
                    recebidoEm: e.target.value === "nao" ? "" : a.recebidoEm,
                  }))
                }
              >
                <option value="">Escolha…</option>
                <option value="sim">Sim, precisa voltar</option>
                <option value="nao">Não precisa voltar</option>
              </select>
            </div>
          </div>

          {v.voltar === "sim" && (
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`${base}-recebido`}>
                Produto recebido em
              </label>
              <div className="campo__entrada">
                <input
                  id={`${base}-recebido`}
                  type="date"
                  value={v.recebidoEm}
                  onChange={(e) =>
                    setV((a) => ({ ...a, recebidoEm: e.target.value }))
                  }
                />
              </div>
              <p className="campo__ajuda">
                Deixe em branco enquanto o produto não chegou: a reclamação fica
                aguardando produto.
              </p>
            </div>
          )}
        </div>

        <div className="campo campo--largo">
          <label className="campo__rotulo" htmlFor={`${base}-conclusao`}>
            Conclusão da análise
          </label>
          <div className="campo__entrada">
            <textarea
              id={`${base}-conclusao`}
              rows={4}
              maxLength={5000}
              value={v.conclusao}
              onChange={(e) =>
                setV((a) => ({ ...a, conclusao: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="campo campo--largo">
          <label className="campo__rotulo" htmlFor={`${base}-resultado`}>
            Resultado
          </label>
          <div className="campo__entrada">
            <textarea
              id={`${base}-resultado`}
              rows={3}
              maxLength={5000}
              value={v.resultado}
              onChange={(e) =>
                setV((a) => ({ ...a, resultado: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      <footer className="ficha-form__rodape">
        {erro && (
          <p className="aviso aviso--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="ficha-form__acoes">
          <Botao type="submit" disabled={enviando || (!criando && !sujo)}>
            {enviando
              ? "Salvando…"
              : criando
                ? "Registrar análise"
                : "Salvar análise"}
          </Botao>
        </div>
      </footer>
    </form>
  );
}
