import { describe, expect, it } from "vitest";
import {
  comMarcaPadrao,
  consultaDeMarca,
  escolhaValida,
  lerEscolha,
  marcaDoCadastro,
  marcasOferecidas,
  marcaVisual,
  temaDaEscolha,
  textoDaCookie,
} from "../lib/marca-escolhida";

const CADASTRO = [
  { id: "m1", nome: "AISA" },
  { id: "m2", nome: "Artmaq" },
  { id: "m3", nome: "WORK" },
];

describe("lerEscolha", () => {
  it("aceita as três marcas, sem diferenciar maiúscula", () => {
    expect(lerEscolha("aisa")).toBe("aisa");
    expect(lerEscolha("ARTMAQ")).toBe("artmaq");
    expect(lerEscolha(" arauca ")).toBe("arauca");
  });

  it("valor ausente, 'todas' ou estranho vira todas", () => {
    expect(lerEscolha(undefined)).toBe("todas");
    expect(lerEscolha("")).toBe("todas");
    expect(lerEscolha("todas")).toBe("todas");
    expect(lerEscolha("<script>")).toBe("todas");
    expect(lerEscolha("work")).toBe("todas");
  });
});

describe("temaDaEscolha", () => {
  it("todas usa o tema padrão AISA; marca usa o próprio tema", () => {
    expect(temaDaEscolha("todas")).toBe("aisa");
    expect(temaDaEscolha("artmaq")).toBe("artmaq");
  });
});

describe("marca do cadastro", () => {
  it("casa pelo nome, sem acento nem caixa", () => {
    expect(marcaDoCadastro("artmaq", CADASTRO)?.id).toBe("m2");
    expect(marcaDoCadastro("arauca", CADASTRO)).toBeUndefined();
  });

  it("marcaVisual devolve a marca com logo ou nada (WORK)", () => {
    expect(marcaVisual("Artmaq")).toBe("artmaq");
    expect(marcaVisual("WORK")).toBeUndefined();
    expect(marcaVisual(null)).toBeUndefined();
  });

  it("o seletor só oferece o que o perfil enxerga", () => {
    expect(marcasOferecidas(CADASTRO)).toEqual(["aisa", "artmaq"]);
    expect(marcasOferecidas([])).toEqual([]);
    expect(marcasOferecidas(null)).toEqual([]);
  });

  it("escolha de marca que o perfil não enxerga volta para todas", () => {
    expect(escolhaValida("aisa", ["aisa", "artmaq"])).toBe("aisa");
    expect(escolhaValida("arauca", ["aisa", "artmaq"])).toBe("todas");
    expect(escolhaValida("todas", ["aisa"])).toBe("todas");
  });
});

describe("filtro por marca", () => {
  it("sem marca na URL vale a escolhida no cabeçalho", () => {
    expect(comMarcaPadrao({ canal: "c1" }, "m2")).toEqual({
      canal: "c1",
      marca: "m2",
    });
  });

  it("marca na URL manda sobre o padrão", () => {
    expect(comMarcaPadrao({ marca: "m1" }, "m2").marca).toBe("m1");
  });

  it("marca=todas tira o padrão e não vai para a API", () => {
    expect(comMarcaPadrao({ marca: "todas" }, "m2")).toEqual({});
  });

  it("sem marca escolhida, nada é acrescentado", () => {
    expect(comMarcaPadrao({}, undefined)).toEqual({});
  });

  it("consultaDeMarca codifica o id e some em todas", () => {
    expect(consultaDeMarca(undefined)).toBe("");
    expect(consultaDeMarca("m 1&x")).toBe("?marca=m%201%26x");
  });
});

describe("cookie", () => {
  it("é legível pelo navegador (sem HttpOnly), de um ano e SameSite", () => {
    const c = textoDaCookie("artmaq");
    expect(c).toContain("marca=artmaq");
    expect(c).toContain("Path=/");
    expect(c).toContain("SameSite=Lax");
    expect(c).not.toContain("HttpOnly");
  });
});
