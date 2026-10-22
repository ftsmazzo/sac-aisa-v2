"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from "react";
import { Botao } from "@/components/ui";
import type { OpcoesFiltro } from "@/lib/reclamacoes";
import { montarCorpo, type ValoresForm } from "@/lib/reclamacoes-form";
import { salvarReclamacao } from "./acoes";

function Campo({
  rotulo,
  id,
  obrigatorio,
  ajuda,
  largo,
  children,
}: {
  rotulo: string;
  id: string;
  obrigatorio?: boolean;
  ajuda?: string;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={largo ? "campo campo--largo" : "campo"}>
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span aria-hidden="true"> *</span>}
      </label>
      <div className="campo__entrada">{children}</div>
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
    </div>
  );
}

type Entrada = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Triagem na ficha lateral: cadastro e edição só do que se coleta e se combina com o
 * consumidor. A tela só leva o que a pessoa mexeu; quem calcula a situação, a causa e o
 * setor sugerido, e quem confere permissão e escopo, é a API.
 * `depois` é o destino após salvar; `__ID__` vira o id da reclamação gravada.
 */
export function FormularioReclamacao({
  modo,
  id,
  numero,
  inicial,
  opcoes,
  podeTrocarSetor,
  cancelar,
  depois,
}: {
  modo: "criar" | "editar";
  id?: string;
  numero?: number;
  inicial: ValoresForm;
  opcoes: OpcoesFiltro;
  podeTrocarSetor: boolean;
  cancelar: string;
  depois: string;
}) {
  const router = useRouter();
  const base = useId();
  const [v, setV] = useState<ValoresForm>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const criando = modo === "criar";
  const sujo = JSON.stringify(v) !== JSON.stringify(inicial);

  const campo = (k: Exclude<keyof ValoresForm, "custos">) => ({
    id: `${base}-${k}`,
    name: k,
    value: v[k],
    onChange: (e: ChangeEvent<Entrada>) =>
      setV((a) => ({ ...a, [k]: e.target.value })),
  });

  function sair() {
    if (sujo && !window.confirm("Descartar o que foi digitado?")) return;
    router.push(cancelar, { scroll: false });
  }

  // O Esc da moldura fecha a ficha; com texto digitado, pede confirmação antes.
  function aoTeclar(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Escape" || !sujo) return;
    e.stopPropagation();
    sair();
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    const r = montarCorpo(v, inicial, criando);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    setEnviando(true);
    try {
      const res = await salvarReclamacao(
        criando ? null : (id ?? null),
        r.corpo,
      );
      if (res.ok) {
        router.push(depois.replace("__ID__", encodeURIComponent(res.id)), {
          scroll: false,
        });
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
      onKeyDown={aoTeclar}
      noValidate
      aria-label={criando ? "Nova reclamação" : `Editar reclamação ${numero}`}
    >
      <header className="ficha__cab">
        <div className="ficha__cab-texto">
          <p className="ficha__numero">
            {criando ? "Registro pela equipe" : `Reclamação #${numero}`}
          </p>
          <h2 className="ficha__titulo">
            {criando ? "Nova reclamação" : "Editar triagem"}
          </h2>
        </div>
      </header>

      <div className="ficha__corpo">
        <p className="pagina__apoio">
          A triagem coleta o caso e fala com o consumidor. Causa final, laudo e
          solução são do setor responsável.
        </p>

        <fieldset className="ficha-form__grupo">
          <legend className="ficha__subtitulo">Entrada</legend>
          <div className="ficha-form__grade">
            <Campo rotulo="Canal" id={`${base}-canalId`} obrigatorio>
              <select {...campo("canalId")} required>
                <option value="">Escolha…</option>
                {opcoes.canais.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Marca" id={`${base}-marcaId`}>
              <select {...campo("marcaId")}>
                <option value="">Não informada</option>
                {opcoes.marcas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              rotulo="Data de abertura"
              id={`${base}-dataAbertura`}
              obrigatorio
            >
              <input type="date" {...campo("dataAbertura")} required />
            </Campo>
            <Campo rotulo="Pedido" id={`${base}-pedido`}>
              <input type="text" maxLength={200} {...campo("pedido")} />
            </Campo>
            <Campo rotulo="Protocolo do canal" id={`${base}-protocoloExterno`}>
              <input
                type="text"
                maxLength={200}
                {...campo("protocoloExterno")}
              />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="ficha-form__grupo">
          <legend className="ficha__subtitulo">Consumidor</legend>
          <div className="ficha-form__grade">
            <Campo rotulo="Cliente" id={`${base}-clienteNome`}>
              <input type="text" maxLength={200} {...campo("clienteNome")} />
            </Campo>
            <Campo rotulo="Cidade" id={`${base}-cidade`}>
              <input type="text" maxLength={200} {...campo("cidade")} />
            </Campo>
            <Campo rotulo="UF" id={`${base}-uf`}>
              <input
                type="text"
                maxLength={2}
                autoCapitalize="characters"
                {...campo("uf")}
              />
            </Campo>
            <Campo rotulo="Transportadora" id={`${base}-transportadora`}>
              <input type="text" maxLength={200} {...campo("transportadora")} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="ficha-form__grupo">
          <legend className="ficha__subtitulo">O caso</legend>
          <div className="ficha-form__grade">
            <Campo
              rotulo="Código do produto"
              id={`${base}-produtoCodigo`}
              ajuda="O código (SKU) do cadastro de produtos."
            >
              <input type="text" maxLength={200} {...campo("produtoCodigo")} />
            </Campo>
            <Campo rotulo="Bancada de origem" id={`${base}-bancadaId`}>
              <select {...campo("bancadaId")}>
                <option value="">Não informada</option>
                {opcoes.bancadas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo}
                    {o.nome ? ` · ${o.nome}` : ""}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo
            rotulo="O que aconteceu"
            id={`${base}-descricao`}
            obrigatorio
            largo
            ajuda="O setor responsável é sugerido a partir deste texto. A ficha mostra a jornada depois de salvar."
          >
            <textarea rows={5} maxLength={5000} {...campo("descricao")} />
          </Campo>
          <Campo
            rotulo="Observação da triagem"
            id={`${base}-observacao`}
            largo
            ajuda="Combinados com o consumidor e avisos para o setor."
          >
            <textarea rows={3} maxLength={5000} {...campo("observacao")} />
          </Campo>
        </fieldset>

        {podeTrocarSetor && (
          <fieldset className="ficha-form__grupo">
            <legend className="ficha__subtitulo">Encaminhamento</legend>
            <div className="ficha-form__grade">
              <Campo
                rotulo="Setor responsável"
                id={`${base}-setorRespId`}
                ajuda="Automático: a regra da causa sugere o setor. A troca fica registrada com o seu nome."
              >
                <select {...campo("setorRespId")}>
                  <option value="">Automático, pela causa</option>
                  {opcoes.setores.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              {v.setorRespId !== inicial.setorRespId &&
                v.setorRespId !== "" && (
                  <Campo
                    rotulo="Motivo da troca"
                    id={`${base}-motivoTroca`}
                    ajuda="Opcional. Não escreva dados do cliente."
                  >
                    <input
                      type="text"
                      maxLength={200}
                      {...campo("motivoTroca")}
                    />
                  </Campo>
                )}
            </div>
          </fieldset>
        )}
      </div>

      <footer className="ficha-form__rodape">
        {erro && (
          <p className="aviso aviso--erro" role="alert">
            {erro}
          </p>
        )}
        <div className="ficha-form__acoes">
          <Botao variante="secundario" onClick={sair} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando || (!criando && !sujo)}>
            {enviando ? "Salvando…" : criando ? "Registrar" : "Salvar"}
          </Botao>
        </div>
      </footer>
    </form>
  );
}
