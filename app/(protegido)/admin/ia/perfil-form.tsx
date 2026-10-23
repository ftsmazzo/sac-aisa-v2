"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  chamarAdminIa,
  mensagemAdminIa,
  type PerfilAdmin,
  type RespostaPerfil,
} from "@/lib/ia";
import "../../reclamacoes/ia.css";

type Texto =
  | "descricao"
  | "missao"
  | "valores"
  | "metas"
  | "tomDeVoz"
  | "dizer"
  | "evitar"
  | "assinatura"
  | "nota";

const CAMPOS: { nome: Texto; rotulo: string; ajuda: string; linhas: number }[] =
  [
    {
      nome: "tomDeVoz",
      rotulo: "Tom de voz",
      ajuda: "Como a empresa fala com o cliente.",
      linhas: 3,
    },
    {
      nome: "dizer",
      rotulo: "O que dizer",
      ajuda: "O que toda mensagem deve fazer.",
      linhas: 3,
    },
    {
      nome: "evitar",
      rotulo: "O que evitar",
      ajuda: "Promessas e termos que a IA não pode usar.",
      linhas: 3,
    },
    {
      nome: "assinatura",
      rotulo: "Assinatura",
      ajuda: "{marca} vira o nome da marca da reclamação.",
      linhas: 1,
    },
    {
      nome: "descricao",
      rotulo: "Descrição da empresa",
      ajuda: "Opcional.",
      linhas: 3,
    },
    { nome: "missao", rotulo: "Missão", ajuda: "Opcional.", linhas: 2 },
    { nome: "valores", rotulo: "Valores", ajuda: "Opcional.", linhas: 2 },
    { nome: "metas", rotulo: "Metas", ajuda: "Opcional.", linhas: 2 },
  ];

const VAZIO = {
  descricao: "",
  missao: "",
  valores: "",
  metas: "",
  tomDeVoz: "",
  dizer: "",
  evitar: "",
  assinatura: "",
  exemplos: [] as PerfilAdmin["exemplos"],
  nota: "",
};

export function PerfilForm({ inicial }: { inicial: RespostaPerfil }) {
  const [versoes, setVersoes] = useState(inicial.versoes);
  const [atual, setAtual] = useState(inicial.perfil);
  const [f, setF] = useState({ ...VAZIO, ...(inicial.perfil ?? {}) });
  const [aviso, setAviso] = useState<{
    tom: "ok" | "erro";
    texto: string;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function exemplo(i: number, parte: Partial<PerfilAdmin["exemplos"][number]>) {
    setF({
      ...f,
      exemplos: f.exemplos.map((x, j) => (j === i ? { ...x, ...parte } : x)),
    });
  }

  async function publicar() {
    setOcupado(true);
    setAviso(null);
    const r = await chamarAdminIa("/perfil", "POST", {
      descricao: f.descricao,
      missao: f.missao,
      valores: f.valores,
      metas: f.metas,
      tomDeVoz: f.tomDeVoz,
      dizer: f.dizer,
      evitar: f.evitar,
      assinatura: f.assinatura,
      exemplos: f.exemplos.filter(
        (e) => e.situacao.trim() && e.resposta.trim(),
      ),
      nota: f.nota,
    });
    if (r.ok) {
      const nova = await chamarAdminIa("/perfil", "GET");
      if (nova.ok) {
        const d = nova.dados as unknown as RespostaPerfil;
        setAtual(d.perfil);
        setVersoes(d.versoes);
      }
      setAviso({
        tom: "ok",
        texto: `Versão ${String(r.dados.versao)} publicada. A IA já usa esta.`,
      });
    } else {
      setAviso({ tom: "erro", texto: mensagemAdminIa(r) });
    }
    setOcupado(false);
  }

  return (
    <Cartao>
      <h2 className="ficha__subtitulo">
        Perfil da empresa{" "}
        {atual && <Selo tom="info">Versão {atual.versao}</Selo>}{" "}
        {atual?.padrao && (
          <Selo tom="atencao">Exemplo de teste, validar com o dono</Selo>
        )}
      </h2>
      <div className="ia-admin__grade">
        {CAMPOS.map((c) => (
          <div className="ia-admin__campo" key={c.nome}>
            <label htmlFor={`perfil-${c.nome}`}>{c.rotulo}</label>
            <textarea
              id={`perfil-${c.nome}`}
              rows={c.linhas}
              maxLength={c.nome === "assinatura" ? 300 : 2000}
              value={f[c.nome]}
              onChange={(e) => setF({ ...f, [c.nome]: e.target.value })}
            />
            <span className="pagina__apoio">{c.ajuda}</span>
          </div>
        ))}
        <fieldset className="ia-admin__campo">
          <legend>Exemplos de resposta aprovados (sem dado de cliente)</legend>
          <p className="pagina__apoio">
            Use {"{{nome_cliente}}"} onde entra o nome. Telefone, e-mail e
            endereço são recusados.
          </p>
          <ul className="ia-admin__lista">
            {f.exemplos.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lista editável sem id próprio
              <li key={i} className="ia-admin__campo">
                <input
                  aria-label={`Situação do exemplo ${i + 1}`}
                  placeholder="Situação (ex.: faltou um item)"
                  maxLength={300}
                  value={e.situacao}
                  onChange={(ev) => exemplo(i, { situacao: ev.target.value })}
                />
                <textarea
                  aria-label={`Mensagem do exemplo ${i + 1}`}
                  rows={3}
                  maxLength={700}
                  placeholder="Mensagem aprovada"
                  value={e.resposta}
                  onChange={(ev) => exemplo(i, { resposta: ev.target.value })}
                />
                <Botao
                  variante="secundario"
                  onClick={() =>
                    setF({
                      ...f,
                      exemplos: f.exemplos.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remover exemplo {i + 1}
                </Botao>
              </li>
            ))}
          </ul>
          {f.exemplos.length < 15 && (
            <Botao
              variante="secundario"
              onClick={() =>
                setF({
                  ...f,
                  exemplos: [...f.exemplos, { situacao: "", resposta: "" }],
                })
              }
            >
              Adicionar exemplo
            </Botao>
          )}
        </fieldset>
        <div className="ia-admin__campo">
          <label htmlFor="perfil-nota">Nota desta versão</label>
          <input
            id="perfil-nota"
            maxLength={300}
            value={f.nota}
            onChange={(e) => setF({ ...f, nota: e.target.value })}
          />
        </div>
      </div>
      <div className="ia-decisao__botoes">
        <Botao disabled={ocupado} onClick={publicar}>
          {ocupado ? "Publicando…" : "Publicar nova versão"}
        </Botao>
        {aviso && (
          <span
            className={`aviso aviso--${aviso.tom}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
          >
            {aviso.texto}
          </span>
        )}
      </div>
      {versoes.length > 0 && (
        <p className="pagina__apoio">
          Versões:{" "}
          {versoes
            .map(
              (v) =>
                `v${v.versao} (${v.padrao ? "padrão inicial" : v.publicadaPorNome || "—"}, ${new Date(v.publicadaEm).toLocaleDateString("pt-BR")})`,
            )
            .join(" · ")}
        </p>
      )}
    </Cartao>
  );
}
