import { describe, expect, it } from "vitest";
import {
  mensagemUsuarios,
  montarCorpo,
  rascunhoNovo,
  textoDaResposta,
  validarRascunho,
} from "./usuarios";

describe("formulário de usuários", () => {
  it("responsável de setor exige ao menos um setor", () => {
    const r = { ...rascunhoNovo(), login: "ana", nome: "Ana", senha: "x" };
    r.perfil = "responsavel_setor";
    expect(validarRascunho(r, "criar")).toContain("setor");
    r.setorIds = ["s1"];
    expect(validarRascunho(r, "criar")).toBeNull();
  });

  it("senha é obrigatória na criação e opcional na edição", () => {
    const r = { ...rascunhoNovo(), login: "ana", nome: "Ana" };
    expect(validarRascunho(r, "criar")).toContain("senha");
    expect(validarRascunho(r, "editar")).toBeNull();
  });

  it("na edição, senha vazia não é enviada e login não vai no corpo", () => {
    const r = { ...rascunhoNovo(), login: "ana", nome: " Ana " };
    const corpo = montarCorpo(r, "editar");
    expect(corpo).not.toHaveProperty("senha");
    expect(corpo).not.toHaveProperty("login");
    expect(corpo.nome).toBe("Ana");
  });

  it("setores e marcas só seguem para o responsável de setor", () => {
    const r = {
      ...rascunhoNovo(),
      login: "Ana",
      nome: "Ana",
      senha: "x",
      setorIds: ["s1"],
      marcaIds: ["m1"],
    };
    expect(montarCorpo(r, "criar")).toMatchObject({
      login: "ana",
      setorIds: [],
      marcaIds: [],
    });
    r.perfil = "responsavel_setor";
    expect(montarCorpo(r, "criar")).toMatchObject({
      setorIds: ["s1"],
      marcaIds: ["m1"],
    });
  });

  it("mostra a mensagem da API, mesmo quando ela vem em lista", () => {
    expect(mensagemUsuarios(405)).toContain("não chegou");
    expect(textoDaResposta({ message: "Setor inexistente." })).toBe(
      "Setor inexistente.",
    );
    expect(textoDaResposta({ message: ["Nome curto.", " "] })).toBe(
      "Nome curto.",
    );
    expect(textoDaResposta({})).toBeUndefined();
  });
});
