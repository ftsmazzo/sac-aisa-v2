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
import {
  CAMPOS_CUSTO,
  montarCorpo,
  type ValoresForm,
} from "@/lib/reclamacoes-form";
import { ROTULO_DEVOLUCAO } from "@/lib/reclamacoes-formato";
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
 * Cadastro e edição na ficha lateral. A tela só leva o que a pessoa mexeu; quem calcula a
 * situação, a causa e o setor, e quem confere permissão e escopo, é a API.
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
            {criando ? "Nova reclamação" : "Editar reclamação"}
          </h2>
        </div>
      </header>

      <div className="ficha__corpo">
        <fieldset className="ficha-form__grupo">
          <legend className="ficha__subtitulo">Registro</legend>
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
          <legend className="ficha__subtitulo">O que aconteceu</legend>
          <Campo
            rotulo="Descrição do caso"
            id={`${base}-descricao`}
            obrigatorio
            largo
            ajuda="A causa e o setor responsável saem do texto, pelas regras do sistema. Você pode corrigir abaixo."
          >
            <textarea rows={5} maxLength={5000} {...campo("descricao")} />
          </Campo>
          <div className="ficha-form__grade">
            <Campo rotulo="Causa" id={`${base}-causaId`}>
              <select {...campo("causaId")}>
                <option value="">Automática, pelo texto</option>
                {opcoes.causas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.categoria} · {o.nome}
                  </option>
                ))}
              </select>
            </Campo>
            {podeTrocarSetor && (
              <Campo
                rotulo="Setor responsável"
                id={`${base}-setorRespId`}
                ajuda="Trocar à mão vale até voltar para automático."
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
            )}
          </div>
        </fieldset>

        <fieldset className="ficha-form__grupo">
          <legend className="ficha__subtitulo">Cliente e envio</legend>
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
          <legend className="ficha__subtitulo">Tratativa</legend>
          <div className="ficha-form__grade">
            <Campo rotulo="Devolução do produto" id={`${base}-devolucao`}>
              <select {...campo("devolucao")}>
                {Object.entries(ROTULO_DEVOLUCAO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Produto recebido em" id={`${base}-dataRecebimento`}>
              <input type="date" {...campo("dataRecebimento")} />
            </Campo>
            <Campo
              rotulo="Data de ação"
              id={`${base}-dataAcao`}
              ajuda="Com data de ação a reclamação fica resolvida. Com devolução a caminho, registre antes o recebimento."
            >
              <input type="date" {...campo("dataAcao")} />
            </Campo>
            <Campo rotulo="Peça" id={`${base}-peca`}>
              <input type="text" maxLength={200} {...campo("peca")} />
            </Campo>
            <Campo rotulo="Garantia" id={`${base}-garantia`}>
              <input type="text" maxLength={200} {...campo("garantia")} />
            </Campo>
            <Campo rotulo="Procedência" id={`${base}-procedencia`}>
              <input type="text" maxLength={200} {...campo("procedencia")} />
            </Campo>
          </div>
          <Campo rotulo="Laudo" id={`${base}-laudo`} largo>
            <textarea rows={3} maxLength={5000} {...campo("laudo")} />
          </Campo>
          <Campo rotulo="Solução" id={`${base}-solucao`} largo>
            <textarea rows={3} maxLength={5000} {...campo("solucao")} />
          </Campo>
          <Campo rotulo="Observação" id={`${base}-observacao`} largo>
            <textarea rows={3} maxLength={5000} {...campo("observacao")} />
          </Campo>
        </fieldset>

        <fieldset className="ficha-form__grupo">
          <legend className="ficha__subtitulo">Custo (R$)</legend>
          <div className="ficha-form__grade">
            {CAMPOS_CUSTO.map(([k, rotulo]) => (
              <Campo key={k} rotulo={rotulo} id={`${base}-custo-${k}`}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  name={k}
                  id={`${base}-custo-${k}`}
                  value={v.custos[k]}
                  onChange={(e) =>
                    setV((a) => ({
                      ...a,
                      custos: { ...a.custos, [k]: e.target.value },
                    }))
                  }
                />
              </Campo>
            ))}
          </div>
        </fieldset>
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
