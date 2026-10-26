"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { gravarVendas, type LinhaPrevia, previaVendas } from "./vendas-acoes";

function dataBr(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function ColaVendas() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [visto, setVisto] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaPrevia[]>([]);
  const [erros, setErros] = useState<{ linha: number; mensagem: string }[]>([]);
  const [somadas, setSomadas] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const previaAtual = visto === texto && linhas.length > 0;

  function prever() {
    setAviso(null);
    iniciar(async () => {
      const r = await previaVendas(texto);
      if (!r.ok) {
        setVisto(null);
        setLinhas([]);
        setErros([]);
        setAviso(r.mensagem);
        return;
      }
      setVisto(texto);
      setLinhas(r.linhas);
      setErros(r.erros);
      setSomadas(r.somadas);
      if (r.linhas.length === 0) setAviso("Nenhuma linha válida para gravar.");
    });
  }

  function gravar() {
    setAviso(null);
    iniciar(async () => {
      const r = await gravarVendas(texto);
      if (!r.ok) {
        setAviso(r.mensagem);
        return;
      }
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
        Cole código, descrição, data (DD/MM/AAAA) e quantidade. A prévia mostra
        o que será gravado. O mesmo código e dia substitui a quantidade.
      </p>
      <label className="filtro__rotulo" htmlFor="cola-vendas">
        Planilha
      </label>
      <textarea
        id="cola-vendas"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        spellCheck={false}
        placeholder={
          "Código\tDescrição\tData\tQuantidade\nG48\tGuincho\t26/10/2026\t12"
        }
      />
      <div className="ficha__acoes">
        <Botao
          type="button"
          disabled={pendente || !texto.trim()}
          onClick={prever}
        >
          Ver prévia
        </Botao>
        <Botao
          type="button"
          variante="secundario"
          disabled={pendente || !previaAtual}
          onClick={gravar}
        >
          Gravar
        </Botao>
      </div>
      {aviso && (
        <p className="aviso aviso--info" role="status">
          {aviso}
        </p>
      )}
      {erros.length > 0 && (
        <ul className="pagina__apoio">
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
