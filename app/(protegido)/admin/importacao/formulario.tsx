"use client";

import { type ChangeEvent, type ReactNode, useState } from "react";
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

function IconeArquivo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 17v-6m0 0-2.5 2.5M12 11l2.5 2.5" />
    </svg>
  );
}

function IconeFeito() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

/** Uma etapa do fluxo. Etapa pendente mostra só o título e a dica de quando abre. */
function Passo({
  n,
  estado,
  titulo,
  selo,
  pendente,
  children,
}: {
  n: number;
  estado: "feita" | "atual" | "pendente";
  titulo: string;
  selo?: ReactNode;
  pendente?: string;
  children?: ReactNode;
}) {
  return (
    <li
      className={`etapa etapa--${estado}`}
      aria-current={estado === "atual" ? "step" : undefined}
    >
      <span className="etapa__marca" aria-hidden="true">
        {estado === "feita" ? <IconeFeito /> : n}
      </span>
      <div className="etapa__corpo">
        <h2 className="etapa__titulo">
          {titulo}
          {selo}
          {estado === "feita" && <span className="sr-only">(concluída)</span>}
        </h2>
        {estado === "pendente" ? (
          <p className="etapa__texto">{pendente}</p>
        ) : (
          <div className="etapa__conteudo">{children}</div>
        )}
      </div>
    </li>
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

  const travado = etapa === "concluido" || ocupado !== null;
  const estadoEscolher = resumo ? "feita" : "atual";
  const estadoConferir =
    etapa !== "escolher" ? "feita" : resumo ? "atual" : "pendente";
  const estadoImportar =
    etapa === "concluido"
      ? "feita"
      : etapa === "conferido"
        ? "atual"
        : "pendente";

  return (
    <ol className="etapas">
      <Passo n={1} estado={estadoEscolher} titulo="Escolha o arquivo">
        <p className="etapa__texto">
          O arquivo .json gerado a partir do dump do sac-renato. Ele é lido aqui
          no navegador e só vai para o servidor quando você pedir.
        </p>
        <label
          className={[
            "arquivo",
            nomeArquivo && "arquivo--cheio",
            travado && "arquivo--travado",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="arquivo__icone">
            <IconeArquivo />
          </span>
          <span className="arquivo__texto">
            <span className="arquivo__nome">
              {nomeArquivo ?? "Escolher arquivo"}
            </span>
            <span className="arquivo__dica">
              {nomeArquivo
                ? "Clique para trocar o arquivo"
                : "Clique aqui ou arraste o .json para cá"}
            </span>
          </span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={aoEscolher}
            aria-label="Arquivo de importação"
            disabled={travado}
          />
        </label>
        {erro && (
          <p className="aviso aviso--erro" role="alert">
            {erro}
          </p>
        )}
        {resumo && (
          <dl className="resumo">
            <div className="resumo__item">
              <dt className="resumo__rotulo">
                reclamações ({formatarData(resumo.primeiraData)} a{" "}
                {formatarData(resumo.ultimaData)})
              </dt>
              <dd className="resumo__valor">
                {resumo.reclamacoes.toLocaleString("pt-BR")}
              </dd>
            </div>
            <div className="resumo__item">
              <dt className="resumo__rotulo">vendas por dia</dt>
              <dd className="resumo__valor">
                {resumo.vendas.toLocaleString("pt-BR")}
              </dd>
            </div>
            <div className="resumo__item">
              <dt className="resumo__rotulo">causas gravadas</dt>
              <dd className="resumo__valor">{resumo.causasGravadas}</dd>
            </div>
            <div className="resumo__item">
              <dt className="resumo__rotulo">usuários</dt>
              <dd className="resumo__valor">{resumo.usuarios}</dd>
            </div>
          </dl>
        )}
      </Passo>

      <Passo
        n={2}
        estado={estadoConferir}
        titulo="Conferir sem gravar"
        pendente="Disponível depois de escolher o arquivo."
      >
        <p className="etapa__texto">
          O servidor converte o arquivo e mostra o que seria importado. Nada é
          gravado nesta etapa.
        </p>
        {etapa !== "concluido" && (
          <div>
            <Botao
              variante="secundario"
              onClick={() => enviar("simular")}
              disabled={ocupado !== null}
            >
              {ocupado === "simular"
                ? "Conferindo…"
                : etapa === "conferido"
                  ? "Conferir de novo"
                  : "Conferir"}
            </Botao>
          </div>
        )}
        {resposta?.modo === "simular" && (
          <>
            <p className="aviso aviso--info" role="status">
              {resposta.relatorio.importadas.toLocaleString("pt-BR")} de{" "}
              {resposta.relatorio.lidas.toLocaleString("pt-BR")} reclamações
              seriam importadas. Causas gravadas no sistema antigo:{" "}
              {resposta.relatorio.causaDefinidaNoBackup}; definidas pela regra:{" "}
              {resposta.relatorio.causaInferida}.
            </p>
            <Contagens
              titulo="O que seria importado"
              dados={resposta.relatorio.contagens}
            />
            <Avisos relatorio={resposta.relatorio} />
          </>
        )}
      </Passo>

      <Passo
        n={3}
        estado={estadoImportar}
        titulo="Importar"
        selo={etapa === "concluido" ? <Selo tom="ok">Gravado</Selo> : undefined}
        pendente="Disponível depois da conferência."
      >
        {etapa === "conferido" && (
          <>
            <label className="confirmar">
              <input
                type="checkbox"
                checked={confirmou}
                onChange={(e) => setConfirmou(e.target.checked)}
              />
              <span>
                Entendi que isto grava no banco. O que já existe não é alterado,
                e rodar de novo não duplica nada.
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
          </>
        )}
        {etapa === "concluido" && resposta?.gravado && (
          <>
            <p className="aviso aviso--ok" role="status">
              O backup foi gravado numa única transação. Linhas que já existiam
              foram mantidas como estavam.
            </p>
            <Contagens
              titulo="Linhas enviadas ao banco"
              dados={resposta.gravado}
            />
            <Avisos relatorio={resposta.relatorio} />
          </>
        )}
      </Passo>
    </ol>
  );
}
