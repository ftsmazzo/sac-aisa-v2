"use client";

import Link from "next/link";
import { useState } from "react";
import {
  diaDoMovimento,
  FILTRO_INICIAL,
  type FiltroPainel,
  fraseDoPainel,
  horaDoMovimento,
  type PainelBruto,
  ROTULO_ESTADO,
  ROTULO_MOTIVO,
  textoDuracao,
  vistaDoPainel,
} from "@/lib/painel-vista";
import "./inicio.css";
import "./reclamacoes/jornada.css";

const PERIODOS = [7, 30, 90] as const;

function tipoDoMovimento(para: string, de: string | null): string {
  if (para === "finalizada" || para === "resolvida_setor") return "resolucao";
  if (para === "encaminhada") return "encaminhamento";
  if (!de || para === "triagem") return "entrada";
  return "passagem";
}

export function PainelInicio({ dados }: { dados: PainelBruto }) {
  const [filtro, setFiltro] = useState<FiltroPainel>(FILTRO_INICIAL);
  const vista = vistaDoPainel(dados, filtro);
  const frase = fraseDoPainel(vista, filtro.periodoDias);
  const temRecorte =
    filtro.setor !== null ||
    filtro.motivo !== null ||
    filtro.faixa !== null ||
    filtro.estado !== null ||
    filtro.periodoDias !== 30;

  function alternar<K extends "setor" | "motivo" | "faixa" | "estado">(
    chave: K,
    valor: FiltroPainel[K],
  ) {
    setFiltro((atual) => ({
      ...atual,
      [chave]: atual[chave] === valor ? null : valor,
    }));
  }

  const diasPorData = new Map<string, typeof vista.movimentos>();
  for (const movimento of vista.movimentos) {
    const dia = diaDoMovimento(movimento.quando);
    const lista = diasPorData.get(dia) ?? [];
    lista.push(movimento);
    diasPorData.set(dia, lista);
  }

  return (
    <div className="inicio">
      <header className="pagina__cab pagina__cab--acao">
        <div className="pagina__cab-texto">
          <h1 className="inicio__frase">{frase}</h1>
        </div>
        <Link href="/reclamacoes" className="botao botao--secundario">
          Abrir a lista
        </Link>
      </header>

      <div className="inicio__comandos">
        <fieldset className="chips inicio__periodo">
          <legend className="sr-only">Período do movimento</legend>
          {PERIODOS.map((dias) => (
            <button
              key={dias}
              type="button"
              className="chip"
              aria-pressed={filtro.periodoDias === dias}
              onClick={() =>
                setFiltro((atual) => ({ ...atual, periodoDias: dias }))
              }
            >
              {dias} dias
            </button>
          ))}
        </fieldset>
        {temRecorte && (
          <button
            type="button"
            className="chips__limpar"
            onClick={() => setFiltro(FILTRO_INICIAL)}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {dados.cortado && (
        <p className="pagina__apoio" role="status">
          O recorte passou do limite e foi cortado. Os números mais antigos
          podem faltar.
        </p>
      )}

      <div className="inicio__corpo">
        <div className="inicio__graficos">
          <section className="cartao inicio__painel" aria-labelledby="idade">
            <h2 className="inicio__titulo" id="idade">
              Idade do que está aberto
            </h2>
            {vista.abertos === 0 ? (
              <p className="pagina__apoio">Nenhuma reclamação aberta.</p>
            ) : (
              <div className="inicio__faixas">
                {vista.faixas.map((faixa) => (
                  <button
                    key={faixa.id}
                    type="button"
                    className={`inicio__faixa inicio__faixa--${faixa.id}`}
                    style={{ flexGrow: Math.max(faixa.total, 0.35) }}
                    aria-pressed={filtro.faixa === faixa.id}
                    onClick={() => alternar("faixa", faixa.id)}
                  >
                    <span className="inicio__faixa-n">{faixa.total}</span>
                    <span>{faixa.rotulo}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="inicio__nota">
              Até 2 dias está na meta interna de tratativa. 7 dias é o alerta de
              produto parado. 10 dias é o prazo de resposta do
              Consumidor.gov.br: em 2023 as empresas responderam em 6 dias, em
              média, e resolveram 78%. A barra não usa essa média — a demora do
              setor sai pela mediana, para o caso lento não sumir.
            </p>
          </section>

          <section className="cartao inicio__painel" aria-labelledby="prazo">
            <h2 className="inicio__titulo" id="prazo">
              Fora do prazo
            </h2>
            <Escolhas
              vazio="Nada fora do prazo interno."
              ativo={filtro.motivo}
              onEscolher={(id) => alternar("motivo", id)}
              itens={vista.porMotivo.map((m) => ({
                id: m.motivo,
                rotulo: m.rotulo,
                valor: m.total,
                texto: String(m.total),
              }))}
            />
          </section>

          <section className="cartao inicio__painel" aria-labelledby="volume">
            <h2 className="inicio__titulo" id="volume">
              Quem concentra o aberto
            </h2>
            <Escolhas
              vazio="Nenhuma reclamação aberta."
              ativo={filtro.setor}
              onEscolher={(id) => alternar("setor", id)}
              itens={vista.porSetor.map((s) => ({
                id: s.setor,
                rotulo: s.setor,
                valor: s.abertas,
                texto: String(s.abertas),
                apoio: s.fora > 0 ? `${s.fora} fora do prazo` : undefined,
              }))}
            />
          </section>

          <section className="cartao inicio__painel" aria-labelledby="demora">
            <h2 className="inicio__titulo" id="demora">
              Quem demora a receber
            </h2>
            <p className="inicio__nota">
              Mediana entre encaminhar e o setor receber. Quem ainda não recebeu
              aparece à parte.
            </p>
            <Escolhas
              vazio="Ainda não há andamento medido neste recorte."
              ativo={filtro.setor}
              onEscolher={(id) => alternar("setor", id)}
              itens={[...vista.porSetor]
                .filter((s) => s.amostra > 0 || s.semAndamento > 0)
                .sort(
                  (a, b) =>
                    (b.medianaHoras ?? -1) - (a.medianaHoras ?? -1) ||
                    b.semAndamento - a.semAndamento,
                )
                .map((s) => ({
                  id: s.setor,
                  rotulo: s.setor,
                  valor: s.medianaHoras ?? 0,
                  texto:
                    s.medianaHoras === null
                      ? "sem mediana"
                      : textoDuracao(s.medianaHoras),
                  apoio:
                    s.semAndamento > 0
                      ? `${s.semAndamento} sem receber`
                      : `${s.amostra} casos`,
                }))}
            />
          </section>

          {vista.urgentes.length > 0 && (
            <section className="cartao inicio__painel" aria-labelledby="agir">
              <h2 className="inicio__titulo" id="agir">
                Para agir agora
              </h2>
              <ul className="inicio__urgentes">
                {vista.urgentes.map((item) => (
                  <li key={item.id}>
                    <Link href={`/reclamacoes?ficha=${item.id}`}>
                      <strong>#{item.numero}</strong>
                      <span>
                        {item.setor} ·{" "}
                        {ROTULO_ESTADO[item.estado] ?? item.estado} ·{" "}
                        {item.dias} dias
                      </span>
                      <small>
                        {item.motivos
                          .map((m) => ROTULO_MOTIVO[m] ?? m)
                          .join(", ")}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="cartao inicio__tempo" aria-labelledby="movimento">
          <h2 className="inicio__titulo" id="movimento">
            Movimento
          </h2>
          <p className="inicio__nota">
            {filtro.periodoDias} dias. Entraram {vista.entraram}, fecharam{" "}
            {vista.fecharam}.
          </p>
          {vista.movimentos.length === 0 ? (
            <p className="pagina__apoio">Nenhum movimento neste período.</p>
          ) : (
            [...diasPorData.entries()].map(([dia, lista]) => (
              <div key={dia} className="inicio__dia">
                <h3 className="inicio__data">{rotuloDoDia(dia, dados.hoje)}</h3>
                <ol className="linha">
                  {lista.map((movimento) => (
                    <li
                      key={movimento.id}
                      className="linha__item"
                      data-tipo={tipoDoMovimento(movimento.para, movimento.de)}
                    >
                      <span className="linha__marca" aria-hidden="true" />
                      <div>
                        <p className="linha__titulo">
                          <Link
                            href={`/reclamacoes?ficha=${movimento.reclamacaoId}`}
                          >
                            #{movimento.numero}
                          </Link>
                          {movimento.reabertura ? " reaberta" : ""} ·{" "}
                          {ROTULO_ESTADO[movimento.para] ?? movimento.para}
                        </p>
                        <p className="linha__meta">
                          {horaDoMovimento(movimento.quando)} ·{" "}
                          {movimento.setor}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  const ontem = new Date(`${hoje}T12:00:00.000Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  if (dia === ontem.toISOString().slice(0, 10)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${dia}T12:00:00.000Z`));
}

function Escolhas({
  itens,
  ativo,
  onEscolher,
  vazio,
}: {
  itens: {
    id: string;
    rotulo: string;
    valor: number;
    texto: string;
    apoio?: string;
  }[];
  ativo: string | null;
  onEscolher: (id: string) => void;
  vazio: string;
}) {
  const visiveis = itens.filter((item) => item.valor > 0 || item.apoio);
  if (visiveis.length === 0) return <p className="pagina__apoio">{vazio}</p>;
  const max = Math.max(...visiveis.map((item) => item.valor), 1);
  return (
    <ol className="inicio__barras">
      {visiveis.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="inicio__escolha"
            aria-pressed={ativo === item.id}
            onClick={() => onEscolher(item.id)}
          >
            <span className="inicio__rotulo">{item.rotulo}</span>
            <span className="inicio__trilho" aria-hidden="true">
              <span
                className="inicio__barra"
                style={{
                  width:
                    item.valor <= 0
                      ? "0%"
                      : `${Math.max(6, (item.valor / max) * 100)}%`,
                }}
              />
            </span>
            <span className="inicio__numero">
              {item.texto}
              {item.apoio && <small>{item.apoio}</small>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
