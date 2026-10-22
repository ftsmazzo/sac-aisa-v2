import { describe, expect, it } from "vitest";
import {
  consultaParaApi,
  data,
  lerEstado,
  moeda,
  montarHref,
  tomDaSituacao,
} from "../lib/reclamacoes-formato";

describe("estado da lista na URL", () => {
  it("lê filtros, página e ficha; ignora o que não é filtro", () => {
    const e = lerEstado({
      marca: "m1",
      situacao: " resolvida ",
      pagina: "3",
      ficha: "abc",
      outro: "x",
      busca: "",
    });
    expect(e).toEqual({
      filtros: { marca: "m1", situacao: "resolvida" },
      pagina: 3,
      ficha: "abc",
    });
  });

  it("página inválida volta para 1", () => {
    expect(lerEstado({ pagina: "0" }).pagina).toBe(1);
    expect(lerEstado({ pagina: "x" }).pagina).toBe(1);
    expect(lerEstado({}).pagina).toBe(1);
  });

  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(lerEstado({ canal: ["a", "b"] }).filtros.canal).toBe("a");
  });
});

describe("montarHref", () => {
  const base = lerEstado({ marca: "m1", pagina: "4", ficha: "r9" });

  it("sem mudança, mantém tudo", () => {
    expect(montarHref(base)).toBe("/reclamacoes?marca=m1&pagina=4&ficha=r9");
  });

  it("mudar um filtro volta para a página 1", () => {
    expect(montarHref(base, { situacao: "tratativa" })).toBe(
      "/reclamacoes?marca=m1&situacao=tratativa&ficha=r9",
    );
  });

  it("remover filtro e fechar ficha", () => {
    expect(montarHref(base, { marca: null, ficha: null })).toBe("/reclamacoes");
  });

  it("trocar de página mantém filtros", () => {
    expect(montarHref(base, { pagina: "5", ficha: null })).toBe(
      "/reclamacoes?marca=m1&pagina=5",
    );
  });

  it("valor com símbolos é codificado", () => {
    expect(montarHref(lerEstado({}), { busca: "a&b=c" })).toBe(
      "/reclamacoes?busca=a%26b%3Dc",
    );
  });
});

describe("consulta para a API", () => {
  it("leva filtros e página, nunca a ficha", () => {
    const q = consultaParaApi(lerEstado({ marca: "m1", ficha: "r9" }));
    expect(q).toBe("marca=m1&pagina=1&porPagina=25");
  });
});

describe("formatação", () => {
  it("data brasileira e vazio", () => {
    expect(data("2026-10-20")).toBe("20/10/2026");
    expect(data("2026-10-20T10:00:00.000Z")).toBe("20/10/2026");
    expect(data(null)).toBe("—");
  });

  it("moeda em reais", () => {
    expect(moeda(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });

  it("cada situação tem um tom", () => {
    expect(tomDaSituacao("resolvida")).toBe("ok");
    expect(tomDaSituacao("aguardando")).toBe("atencao");
    expect(tomDaSituacao("tratativa")).toBe("info");
  });
});
