import { describe, expect, it } from "vitest";
import {
  consultaRelatorio,
  lerFiltrosUrl,
  listaDoRecorte,
  type RelatorioApi,
  recorte,
  relatorioParaCsv,
  textoDias,
} from "./relatorios-formato";

const REL: RelatorioApi = {
  filtros: {},
  totais: {
    reclamacoes: 3,
    resolvidas: 1,
    tratativa: 1,
    aguardando: 1,
    custoTotal: 1234.5,
  },
  etapas: [
    {
      chave: "total",
      rotulo: "Abertura até a resolução",
      n: 1,
      mediaDias: 2.5,
    },
    { chave: "analise", rotulo: "Análise", n: 0, mediaDias: null },
  ],
  porSetor: [{ setor: "Solda; Pintura", total: 3, custo: 10 }],
  porProduto: [
    { codigo: "P1", produto: '=HIPERLINK("x")', total: 2, custo: 5 },
  ],
  bancadaXTipo: {
    tipos: ["Fabricação", "Produto"],
    linhas: [
      {
        bancada: "06",
        total: 3,
        porTipo: { Fabricação: 1, Produto: 2 },
        daMontagem: 1,
        foraDaMontagem: 2,
      },
    ],
  },
  cortado: false,
};

describe("lerFiltrosUrl e consultaRelatorio", () => {
  it("guarda só os filtros do relatório, sem espaços nem vazios", () => {
    const f = lerFiltrosUrl({
      de: " 2026-01-01 ",
      marca: ["m1", "m2"],
      setor: "",
      busca: "x",
      situacao: "resolvida",
    });
    expect(f).toEqual({
      de: "2026-01-01",
      marca: "m1",
      situacao: "resolvida",
    });
    expect(consultaRelatorio(f)).toBe(
      "de=2026-01-01&marca=m1&situacao=resolvida",
    );
  });
});

describe("textoDias", () => {
  it("formata em português e trata ausência", () => {
    expect(textoDias(null)).toBe("—");
    expect(textoDias(1)).toBe("1 dia");
    expect(textoDias(2.5)).toBe("2,5 dias");
  });
});

describe("relatorioParaCsv", () => {
  const csv = relatorioParaCsv(REL, [["Marca", "AISA"]]);

  it("abre no Excel: BOM, CRLF, ponto e vírgula e vírgula decimal", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("Custo total;1234,5");
    expect(csv).toContain("Abertura até a resolução;1;2,5");
  });

  it("traz os filtros e as seções do relatório", () => {
    for (const t of [
      "Marca;AISA",
      "Totais",
      "Tempo médio por etapa",
      "Ocorrências por setor",
      "Ocorrências por produto",
      "Bancada de origem × tipo de ocorrência",
    ]) {
      expect(csv).toContain(t);
    }
    expect(csv).toContain(
      "Bancada;Fabricação;Produto;Total;Causa na montagem;Causa fora da montagem",
    );
    expect(csv).toContain("06;1;2;3;1;2");
  });

  it("média ausente vira célula vazia", () => {
    expect(csv).toContain("Análise;0;\r\n");
  });

  it("protege contra fórmula e escapa separador e aspas", () => {
    expect(csv).toContain('"Solda; Pintura";3;10');
    expect(csv).toContain(`P1;"'=HIPERLINK(""x"")";2;5`);
  });

  it("avisa quando o resultado foi cortado", () => {
    expect(relatorioParaCsv({ ...REL, cortado: true }, [])).toContain(
      "Aviso;Resultado limitado",
    );
    expect(csv).not.toContain("Aviso;");
  });
});

describe("recorte", () => {
  it("um clique filtra e o segundo clique no mesmo valor solta", () => {
    const primeiro = recorte({ de: "2026-01-01" }, { setor: "s1" });
    expect(primeiro).toContain("setor=s1");
    expect(primeiro).toContain("de=2026-01-01");
    expect(recorte({ de: "2026-01-01", setor: "s1" }, { setor: "s1" })).toBe(
      "/relatorios?de=2026-01-01",
    );
  });

  it("a lista recebe o mesmo recorte", () => {
    expect(
      listaDoRecorte({ setor: "s1", categoria: "Fabricação", marca: "todas" }),
    ).toBe("/reclamacoes?setor=s1&categoria=Fabrica%C3%A7%C3%A3o");
  });
});
