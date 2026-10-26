import { describe, expect, it } from "vitest";
import {
  coeficientesDefeito,
  contaSoProcedentes,
  limiteDefeitoPpm,
  vendasDoRecorte,
} from "./coeficiente";

const caso = (
  sku: string,
  procedencia: string,
  bancada = "01",
  setorResp = "Solda",
) => ({ sku, procedencia, bancada, setorResp, produto: `Produto ${sku}` });

describe("limiteDefeitoPpm", () => {
  it("usa 1000 quando a config não é um número positivo", () => {
    expect(limiteDefeitoPpm(undefined)).toBe(1000);
    expect(limiteDefeitoPpm("")).toBe(1000);
    expect(limiteDefeitoPpm("0")).toBe(1000);
    expect(limiteDefeitoPpm("1500")).toBe(1500);
  });
});

describe("contaSoProcedentes", () => {
  it("exige pelo menos 30% classificados", () => {
    expect(contaSoProcedentes([])).toBe(false);
    expect(contaSoProcedentes(["PROCEDE"])).toBe(true);
    expect(
      contaSoProcedentes([
        "PROCEDE",
        "NÃO PROCEDE",
        "NÃO PROCEDE",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
    ).toBe(true);
    expect(
      contaSoProcedentes([
        "PROCEDE",
        "PROCEDE",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
    ).toBe(false);
    expect(contaSoProcedentes(["NAO PROCEDE"])).toBe(false);
  });
});

describe("coeficientesDefeito", () => {
  it("calcula PPM como reclamações sobre vendas vezes um milhão", () => {
    const r = coeficientesDefeito({
      casos: [caso("g48", ""), caso("G48", "")],
      vendas: [{ sku: "G48", descricao: "Guincho", quantidade: 1000 }],
      limitePpm: 1000,
    });
    expect(r.modoContagem).toBe("todas");
    expect(r.porSku[0]).toMatchObject({
      sku: "G48",
      vendas: 1000,
      reclamacoes: 2,
      ppm: 2000,
      acimaLimite: true,
      semVenda: false,
    });
  });

  it("no limite exato não marca acima", () => {
    const r = coeficientesDefeito({
      casos: [caso("A", "")],
      vendas: [{ sku: "A", descricao: "", quantidade: 1000 }],
    });
    expect(r.porSku[0]?.ppm).toBe(1000);
    expect(r.porSku[0]?.acimaLimite).toBe(false);
  });

  it("com 30% classificados conta só PROCEDE", () => {
    const r = coeficientesDefeito({
      casos: [
        caso("A", "PROCEDE"),
        caso("A", "NÃO PROCEDE"),
        caso("A", "NÃO PROCEDE"),
        caso("A", ""),
      ],
      vendas: [{ sku: "A", descricao: "", quantidade: 1000 }],
    });
    expect(r.modoContagem).toBe("procedentes");
    expect(r.porSku[0]?.reclamacoes).toBe(1);
    expect(r.porSku[0]?.ppm).toBe(1000);
  });

  it("abaixo de 30% conta todas, inclusive sem procedência", () => {
    const r = coeficientesDefeito({
      casos: [
        caso("A", "PROCEDE"),
        caso("A", ""),
        caso("A", ""),
        caso("A", ""),
      ],
      vendas: [{ sku: "A", descricao: "", quantidade: 1000 }],
    });
    expect(r.modoContagem).toBe("todas");
    expect(r.porSku[0]?.reclamacoes).toBe(4);
  });

  it("SKU com reclamação e sem venda fica marcado, sem PPM", () => {
    const r = coeficientesDefeito({
      casos: [caso("SEM", "")],
      vendas: [],
    });
    expect(r.porSku[0]).toMatchObject({
      sku: "SEM",
      semVenda: true,
      ppm: null,
      acimaLimite: false,
      reclamacoes: 1,
    });
    expect(r.totais.semVenda).toBe(1);
    expect(r.totais.ppm).toBeNull();
  });

  it("agrupa por bancada e setor sem repetir a venda do SKU", () => {
    const r = coeficientesDefeito({
      casos: [
        caso("A", "", "01", "Solda"),
        caso("A", "", "01", "Solda"),
        caso("A", "", "02", "Solda"),
        caso("B", "", "02", "Pintura"),
      ],
      vendas: [
        { sku: "A", descricao: "", quantidade: 100 },
        { sku: "B", descricao: "", quantidade: 100 },
      ],
    });
    expect(r.porSku.find((l) => l.sku === "A")?.bancada).toBe("01");
    const b01 = r.porBancada.find((g) => g.nome === "01");
    const b02 = r.porBancada.find((g) => g.nome === "02");
    expect(b01).toMatchObject({ vendas: 100, reclamacoes: 3 });
    expect(b02).toMatchObject({ vendas: 100, reclamacoes: 1 });
    expect(r.porSetorResp.find((g) => g.nome === "Solda")).toMatchObject({
      vendas: 100,
      reclamacoes: 3,
    });
    expect(r.totais.vendas).toBe(200);
  });
});

describe("vendasDoRecorte", () => {
  const vendas = [
    { sku: "A", descricao: "", quantidade: 1 },
    { sku: "B", descricao: "", quantidade: 2 },
  ];

  it("no período inteiro mantém as vendas", () => {
    expect(vendasDoRecorte(vendas, ["A"], { estreito: false })).toHaveLength(2);
  });

  it("com filtro fica nas vendas dos SKUs que tiveram caso", () => {
    expect(
      vendasDoRecorte(vendas, ["a"], { estreito: true }).map((v) => v.sku),
    ).toEqual(["A"]);
  });

  it("filtro de produto traz a venda mesmo sem caso", () => {
    expect(
      vendasDoRecorte(vendas, [], { estreito: true, produto: "b" }).map(
        (v) => v.sku,
      ),
    ).toEqual(["B"]);
  });
});
