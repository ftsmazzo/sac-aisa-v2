"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { gravarVendas, type LinhaPrevia, previaVendas } from "./vendas-acoes";

const MAX_BYTES = 1_500_000;

function dataBr(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function erroDoArquivo(arquivo: File): string | null {
  if (!arquivo.name.toLowerCase().endsWith(".txt")) {
    return "Envie um arquivo .txt.";
  }
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (arquivo.size > MAX_BYTES) return "O arquivo passa de 1,5 MB.";
  return null;
}

export function ColaVendas() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [visto, setVisto] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaPrevia[]>([]);
  const [erros, setErros] = useState<{ linha: number; mensagem: string }[]>([]);
  const [somadas, setSomadas] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoOk, setAvisoOk] = useState(false);
  const [pendente, iniciar] = useTransition();
  const previaAtual = visto === texto && linhas.length > 0;

  function escolher(arquivo: File | undefined) {
    setAviso(null);
    setAvisoOk(false);
    setVisto(null);
    setLinhas([]);
    setErros([]);
    setSomadas(0);
    if (!arquivo) {
      setNome("");
      setTexto("");
      return;
    }
    const erro = erroDoArquivo(arquivo);
    setNome(arquivo.name);
    if (erro) {
      setTexto("");
      setAviso(erro);
      return;
    }
    iniciar(async () => {
      const lido = await arquivo.text();
      setTexto(lido);
      const r = await previaVendas(lido);
      if (!r.ok) {
        setAviso(r.mensagem);
        return;
      }
      setVisto(lido);
      setLinhas(r.linhas);
      setErros(r.erros);
      setSomadas(r.somadas);
      if (r.linhas.length === 0) setAviso("Nenhuma linha válida para gravar.");
    });
  }

  function gravar() {
    setAviso(null);
    setAvisoOk(false);
    iniciar(async () => {
      const r = await gravarVendas(texto);
      if (!r.ok) {
        setAviso(r.mensagem);
        return;
      }
      setAvisoOk(true);
      setAviso(
        `${r.gravadas.toLocaleString("pt-BR")} ${r.gravadas === 1 ? "linha gravada" : "linhas gravadas"}. O mesmo código e dia substituiu a quantidade.`,
      );
      router.refresh();
    });
  }

  const amostra = linhas.slice(0, 40);

  return (
    <section
      className="cartao cola-vendas sem-impressao"
      aria-label="Vendas do ERP"
    >
      <h2 className="ficha__subtitulo">Vendas do ERP</h2>
      <p className="pagina__apoio">
        Envie um .txt com código, descrição, data (DD/MM/AAAA) e quantidade. A
        prévia mostra o que será gravado. O mesmo código e dia substitui a
        quantidade.
      </p>
      <div className="cola-vendas__arquivo">
        <label htmlFor="arquivo-vendas">Arquivo .txt</label>
        <input
          id="arquivo-vendas"
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        {nome && <p className="pagina__apoio">{nome}</p>}
      </div>
      <div className="cola-vendas__acoes">
        <Botao
          type="button"
          disabled={pendente || !previaAtual}
          onClick={gravar}
        >
          {pendente ? "Aguarde" : "Gravar"}
        </Botao>
      </div>
      {aviso && (
        <p
          className={avisoOk ? "aviso aviso--ok" : "aviso aviso--erro"}
          role="status"
        >
          {aviso}
        </p>
      )}
      {erros.length > 0 && (
        <ul className="cola-vendas__erros">
          {erros.slice(0, 8).map((e) => (
            <li key={`${e.linha}-${e.mensagem}`}>
              {e.linha > 0 ? `Linha ${e.linha}: ` : ""}
              {e.mensagem}
            </li>
          ))}
        </ul>
      )}
      {previaAtual && (
        <>
          <p className="pagina__apoio">
            {linhas.length.toLocaleString("pt-BR")}{" "}
            {linhas.length === 1 ? "linha" : "linhas"}
            {somadas > 0
              ? `. ${somadas.toLocaleString("pt-BR")} repetidas do mesmo código e dia foram somadas.`
              : "."}
          </p>
          <div className="tabela-caixa">
            <table className="tabela-simples coeficiente">
              <caption className="sr-only">Prévia das vendas</caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Data</th>
                  <th scope="col" className="num">
                    Quantidade
                  </th>
                </tr>
              </thead>
              <tbody>
                {amostra.map((l) => (
                  <tr key={`${l.sku}-${l.data}`}>
                    <td>{l.sku}</td>
                    <td>{l.descricao}</td>
                    <td>{dataBr(l.data)}</td>
                    <td className="num">
                      {l.quantidade.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {linhas.length > amostra.length && (
            <p className="pagina__apoio">
              A prévia mostra as primeiras {amostra.length}. Gravar inclui todas
              as linhas válidas.
            </p>
          )}
        </>
      )}
    </section>
  );
}
