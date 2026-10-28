"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Botao } from "@/components/ui";
import {
  CAMPOS_CUSTO,
  montarCorpoSolucao,
  type ValoresSolucao,
} from "@/lib/solucao-form";
import { salvarReclamacao } from "./acoes";

type Texto = "laudo" | "solucao" | "procedencia" | "garantia" | "peca";

/**
 * Solução do setor responsável: causa final, laudo, solução, custo e a data de ação, que
 * resolve a reclamação. A triagem não preenche nada disto. Quem confere permissão e escopo
 * é a API.
 */
export function FormularioSolucao({
  id,
  setorNome,
  causaSugerida,
  causaManual,
  causas,
  inicial,
  depois,
}: {
  id: string;
  setorNome: string;
  causaSugerida: string | null;
  causaManual: boolean;
  causas: { id: string; nome: string; categoria: string; acao?: string }[];
  inicial: ValoresSolucao;
  depois: string;
}) {
  const router = useRouter();
  const base = useId();
  const [v, setV] = useState<ValoresSolucao>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sujo = JSON.stringify(v) !== JSON.stringify(inicial);
  const causaAtiva =
    v.causaId || causas.find((c) => c.nome === causaSugerida)?.id;
  const acaoSugerida =
    causas.find((c) => c.id === causaAtiva)?.acao?.trim() || "";

  const texto = (k: Texto) => ({
    id: `${base}-${k}`,
    value: v[k],
    onChange: (e: { target: { value: string } }) =>
      setV((a) => ({ ...a, [k]: e.target.value })),
  });

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    const r = montarCorpoSolucao(v, inicial);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    setEnviando(true);
    try {
      const res = await salvarReclamacao(id, r.corpo);
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
      className="ficha-form ficha-form--secao"
      onSubmit={enviar}
      noValidate
      aria-label="Solução do setor"
    >
      <div className="ficha__corpo ficha__corpo--secao">
        <div>
          <h3 className="ficha__subtitulo">Solução e encerramento</h3>
          <p className="pagina__apoio">
            Quem resolve é o setor <strong>{setorNome}</strong>. Com a data de
            ação, a reclamação fica resolvida.
          </p>
        </div>

        <div className="ficha-form__grade">
          <div className="campo campo--largo">
            <label className="campo__rotulo" htmlFor={`${base}-causaId`}>
              Causa final
            </label>
            <div className="campo__entrada">
              <select
                id={`${base}-causaId`}
                value={v.causaId}
                onChange={(e) =>
                  setV((a) => ({ ...a, causaId: e.target.value }))
                }
              >
                <option value="">
                  {causaManual
                    ? "Voltar à causa sugerida pelo texto"
                    : causaSugerida
                      ? `Manter a sugerida: ${causaSugerida}`
                      : "Sem causa sugerida"}
                </option>
                {causas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.categoria} · {o.nome}
                  </option>
                ))}
              </select>
            </div>
            <p className="campo__ajuda">
              A causa sugerida vem do texto da triagem. Escolher outra não tira
              a reclamação do setor; para isso, troque o setor na triagem.
            </p>
            {acaoSugerida && (
              <p className="campo__ajuda" data-testid="acao-sugerida">
                Ação sugerida: {acaoSugerida}
              </p>
            )}
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`${base}-procedencia`}>
              Procedência
            </label>
            <div className="campo__entrada">
              <input type="text" maxLength={200} {...texto("procedencia")} />
            </div>
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`${base}-garantia`}>
              Garantia
            </label>
            <div className="campo__entrada">
              <input type="text" maxLength={200} {...texto("garantia")} />
            </div>
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`${base}-peca`}>
              Peça
            </label>
            <div className="campo__entrada">
              <input type="text" maxLength={200} {...texto("peca")} />
            </div>
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`${base}-dataAcao`}>
              Data de ação
            </label>
            <div className="campo__entrada">
              <input
                id={`${base}-dataAcao`}
                type="date"
                value={v.dataAcao}
                onChange={(e) =>
                  setV((a) => ({ ...a, dataAcao: e.target.value }))
                }
              />
            </div>
            <p className="campo__ajuda">
              Com produto a caminho, registre antes o recebimento na análise.
            </p>
          </div>
        </div>

        <div className="campo campo--largo">
          <label className="campo__rotulo" htmlFor={`${base}-laudo`}>
            Laudo
          </label>
          <div className="campo__entrada">
            <textarea rows={3} maxLength={5000} {...texto("laudo")} />
          </div>
        </div>
        <div className="campo campo--largo">
          <label className="campo__rotulo" htmlFor={`${base}-solucao`}>
            Solução
          </label>
          <div className="campo__entrada">
            <textarea rows={3} maxLength={5000} {...texto("solucao")} />
          </div>
        </div>

        <details className="ficha__custos-form">
          <summary>Custo da tratativa (R$)</summary>
          <div className="ficha-form__grade">
            {CAMPOS_CUSTO.map(([k, rotulo]) => (
              <div key={k} className="campo">
                <label className="campo__rotulo" htmlFor={`${base}-custo-${k}`}>
                  {rotulo}
                </label>
                <div className="campo__entrada">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    id={`${base}-custo-${k}`}
                    value={v.custos[k]}
                    onChange={(e) =>
                      setV((a) => ({
                        ...a,
                        custos: { ...a.custos, [k]: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      <footer className="ficha-form__rodape">
        {erro && (
          <p className="aviso aviso--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="ficha-form__acoes">
          <Botao type="submit" disabled={enviando || !sujo}>
            {enviando ? "Salvando…" : "Salvar solução"}
          </Botao>
        </div>
      </footer>
    </form>
  );
}
