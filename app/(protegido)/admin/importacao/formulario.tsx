"use client";

import { type ChangeEvent, useState } from "react";
import { Botao, Selo } from "@/components/ui";
import {
  formatarData,
  LIMITE_ARQUIVO_BYTES,
  lerArquivoDeImportacao,
  mensagemImportacao,
  NOMES_TABELAS,
  type RelatorioImportacao,
  type RespostaImportacao,
  type ResumoArquivo,
} from "@/lib/importacao";

type Etapa = "escolher" | "conferido" | "concluido";
type Modo = "simular" | "gravar";

function Contagens({
  titulo,
  dados,
}: {
  titulo: string;
  dados: Record<string, number>;
}) {
  return (
    <table className="tabela-simples">
      <thead>
        <tr>
          <th>{titulo}</th>
          <th>Linhas</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(dados).map(([tabela, n]) => (
          <tr key={tabela}>
            <td>{NOMES_TABELAS[tabela] ?? tabela}</td>
            <td>{n.toLocaleString("pt-BR")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Avisos({ relatorio }: { relatorio: RelatorioImportacao }) {
  if (relatorio.avisos.length === 0) return null;
  return (
    <ul className="lista-avisos">
      {relatorio.avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

export function Formulario() {
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoArquivo | null>(null);
  const [arquivo, setArquivo] = useState<unknown>(null);
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [resposta, setResposta] = useState<RespostaImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Modo | null>(null);
  const [confirmou, setConfirmou] = useState(false);

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErro(null);
    setResposta(null);
    setEtapa("escolher");
    setConfirmou(false);
    setResumo(null);
    setArquivo(null);
    setNomeArquivo(null);
    if (!f) return;
    if (f.size > LIMITE_ARQUIVO_BYTES) {
      setErro(mensagemImportacao(413));
      return;
    }
    const leitura = lerArquivoDeImportacao(await f.text());
    if (!leitura.ok) {
      setErro(leitura.mensagem);
      return;
    }
    setNomeArquivo(f.name);
    setResumo(leitura.resumo);
    setArquivo(leitura.arquivo);
  }

  async function enviar(modo: Modo) {
    if (!arquivo || ocupado) return;
    setErro(null);
    setOcupado(modo);
    try {
      const r = await fetch("/api/admin/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, arquivo }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | (RespostaImportacao & { message?: string })
        | null;
      if (!r.ok) {
        setErro(
          mensagemImportacao(
            r.status,
            typeof corpo?.message === "string" ? corpo.message : undefined,
          ),
        );
        return;
      }
      setResposta(corpo as RespostaImportacao);
      setEtapa(modo === "simular" ? "conferido" : "concluido");
    } catch {
      setErro("Não foi possível conectar. Confira a internet e tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <section className="cartao passo">
        <h2 className="passo__titulo">1. Escolha o arquivo</h2>
        <p style={{ color: "var(--cor-suave)", fontSize: 14 }}>
          O arquivo .json gerado a partir do dump do sac-renato. Ele é lido aqui
          no navegador e só vai para o servidor quando você pedir.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          onChange={aoEscolher}
          aria-label="Arquivo de importação"
          disabled={etapa === "concluido" || ocupado !== null}
        />
        {erro && (
          <p className="aviso aviso--erro" role="alert">
            {erro}
          </p>
        )}
        {resumo && (
          <>
            <p style={{ fontSize: 14 }}>
              <strong>{nomeArquivo}</strong>
            </p>
            <div className="resumo">
              <div className="resumo__item">
                <span className="resumo__valor">
                  {resumo.reclamacoes.toLocaleString("pt-BR")}
                </span>
                <span className="resumo__rotulo">
                  reclamações ({formatarData(resumo.primeiraData)} a{" "}
                  {formatarData(resumo.ultimaData)})
                </span>
              </div>
              <div className="resumo__item">
                <span className="resumo__valor">
                  {resumo.vendas.toLocaleString("pt-BR")}
                </span>
                <span className="resumo__rotulo">vendas por dia</span>
              </div>
              <div className="resumo__item">
                <span className="resumo__valor">{resumo.causasGravadas}</span>
                <span className="resumo__rotulo">causas gravadas</span>
              </div>
              <div className="resumo__item">
                <span className="resumo__valor">{resumo.usuarios}</span>
                <span className="resumo__rotulo">usuários</span>
              </div>
            </div>
          </>
        )}
      </section>

      {resumo && etapa !== "concluido" && (
        <section className="cartao passo">
          <h2 className="passo__titulo">2. Conferir sem gravar</h2>
          <p style={{ color: "var(--cor-suave)", fontSize: 14 }}>
            O servidor converte o arquivo e mostra o que seria importado. Nada é
            gravado nesta etapa.
          </p>
          <div>
            <Botao
              variante="secundario"
              onClick={() => enviar("simular")}
              disabled={ocupado !== null}
            >
              {ocupado === "simular" ? "Conferindo…" : "Conferir"}
            </Botao>
          </div>
          {resposta?.modo === "simular" && (
            <>
              <p className="aviso aviso--info">
                {resposta.relatorio.importadas.toLocaleString("pt-BR")} de{" "}
                {resposta.relatorio.lidas.toLocaleString("pt-BR")} reclamações
                seriam importadas. Causas gravadas no sistema antigo:{" "}
                {resposta.relatorio.causaDefinidaNoBackup}; definidas pela
                regra: {resposta.relatorio.causaInferida}.
              </p>
              <Contagens
                titulo="O que seria importado"
                dados={resposta.relatorio.contagens}
              />
              <Avisos relatorio={resposta.relatorio} />
            </>
          )}
        </section>
      )}

      {etapa === "conferido" && (
        <section className="cartao passo">
          <h2 className="passo__titulo">3. Importar</h2>
          <label className="confirmar">
            <input
              type="checkbox"
              checked={confirmou}
              onChange={(e) => setConfirmou(e.target.checked)}
            />
            <span>
              Entendi que isto grava no banco. O que já existe não é alterado, e
              rodar de novo não duplica nada.
            </span>
          </label>
          <div>
            <Botao
              onClick={() => enviar("gravar")}
              disabled={!confirmou || ocupado !== null}
            >
              {ocupado === "gravar" ? "Importando…" : "Importar agora"}
            </Botao>
          </div>
        </section>
      )}

      {etapa === "concluido" && resposta?.gravado && (
        <section className="cartao passo">
          <h2 className="passo__titulo">
            Importação concluída <Selo tom="ok">gravado</Selo>
          </h2>
          <p className="aviso aviso--ok" role="status">
            O backup foi gravado numa única transação. Linhas que já existiam
            foram mantidas como estavam.
          </p>
          <Contagens
            titulo="Linhas enviadas ao banco"
            dados={resposta.gravado}
          />
          <Avisos relatorio={resposta.relatorio} />
        </section>
      )}
    </>
  );
}
