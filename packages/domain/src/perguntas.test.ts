import { describe, expect, it } from "vitest";
import {
  type PerguntaDef,
  perguntasAplicaveis,
  perguntasFaltantes,
  regraBate,
} from "./perguntas";

const p = (
  chave: string,
  ordem: number,
  regras: PerguntaDef["regras"],
  extra: Partial<PerguntaDef> = {},
): PerguntaDef => ({
  chave,
  texto: chave,
  tipo: "texto",
  obrigatoria: true,
  ordem,
  ativa: true,
  regras,
  ...extra,
});

const LISTA = [
  p("volt", 20, [{ causaIds: ["eletrico", "voltagem"] }]),
  p("montagem", 10, [
    { familias: ["Prateleira", "mesa"], causaIds: ["furacao", "kit"] },
    { causaIds: ["furacao"] },
  ]),
  p("transporte", 30, [{ causaCategorias: ["Transporte"] }]),
  p("sem_regra", 1, []),
  p("desligada", 2, [{ causaIds: ["eletrico"] }], { ativa: false }),
  p("opcional", 40, [{ causaIds: ["eletrico"] }], { obrigatoria: false }),
];

describe("perguntas aplicáveis", () => {
  it("regra bate quando todos os filtros preenchidos batem; vazio vale qualquer", () => {
    expect(regraBate({ causaIds: ["a"] }, { causaId: "a" })).toBe(true);
    expect(
      regraBate(
        { familias: ["x"], causaIds: ["a"] },
        { causaId: "a", familia: "y" },
      ),
    ).toBe(false);
    expect(regraBate({}, { causaId: "a" })).toBe(false);
    expect(regraBate({ causaIds: ["a"] }, {})).toBe(false);
  });

  it("família e categoria ignoram caixa e acento; vale a ordem", () => {
    const r = perguntasAplicaveis(LISTA, {
      familia: "PRATELEIRA",
      causaId: "kit",
    });
    expect(r.map((x) => x.chave)).toEqual(["montagem"]);
    expect(
      perguntasAplicaveis(LISTA, {
        causaId: "avaria",
        causaCategoria: "TRANSPORTE",
      }).map((x) => x.chave),
    ).toEqual(["transporte"]);
  });

  it("ativas, com regra, e a outra regra da mesma pergunta também vale", () => {
    expect(
      perguntasAplicaveis(LISTA, { causaId: "furacao" }).map((x) => x.chave),
    ).toEqual(["montagem"]);
    expect(
      perguntasAplicaveis(LISTA, { causaId: "eletrico" }).map((x) => x.chave),
    ).toEqual(["volt", "opcional"]);
  });

  it("causa ainda desconhecida: só valem as regras que não pedem causa", () => {
    const l = [p("so_familia", 1, [{ familias: ["MESA"] }]), ...LISTA];
    expect(
      perguntasAplicaveis(l, { familia: "mesa" }).map((x) => x.chave),
    ).toEqual(["so_familia"]);
  });
});

describe("perguntas faltantes", () => {
  const ap = perguntasAplicaveis(LISTA, { causaId: "eletrico" });
  it("só obrigatórias sem resposta; dispensada conta como tratada", () => {
    expect(perguntasFaltantes(ap, []).map((x) => x.chave)).toEqual(["volt"]);
    expect(perguntasFaltantes(ap, [{ chave: "volt", valor: "220 V" }])).toEqual(
      [],
    );
    expect(
      perguntasFaltantes(ap, [{ chave: "volt", valor: "", dispensada: true }]),
    ).toEqual([]);
    expect(
      perguntasFaltantes(ap, [{ chave: "volt", valor: "   " }]).map(
        (x) => x.chave,
      ),
    ).toEqual(["volt"]);
  });
});
