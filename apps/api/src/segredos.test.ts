import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cifrar,
  decifrar,
  fimDoSegredo,
  lerChave,
  mascarar,
  removerSegredos,
} from "./segredos";

const CHAVE = randomBytes(32);

describe("lerChave", () => {
  it("aceita 32 bytes em base64 e em hexadecimal", () => {
    expect(lerChave(CHAVE.toString("base64"))?.equals(CHAVE)).toBe(true);
    expect(lerChave(CHAVE.toString("hex"))?.equals(CHAVE)).toBe(true);
  });

  it("recusa ausente, curta ou fora do formato", () => {
    expect(lerChave(undefined)).toBeNull();
    expect(lerChave("")).toBeNull();
    expect(lerChave("senha-curta")).toBeNull();
    expect(lerChave(randomBytes(16).toString("base64"))).toBeNull();
    expect(lerChave("g".repeat(64))).toBeNull();
  });
});

describe("cifrar e decifrar", () => {
  it("devolve o texto original e não deixa o segredo à vista", () => {
    const segredo = "pk_123456789_ABCDEFGHIJ";
    const c = cifrar(segredo, CHAVE, "clickup:token");
    expect(c).not.toContain(segredo);
    expect(c.startsWith("v1.")).toBe(true);
    expect(decifrar(c, CHAVE, "clickup:token")).toBe(segredo);
  });

  it("gera um valor diferente a cada vez para o mesmo texto", () => {
    expect(cifrar("x".repeat(20), CHAVE, "a:b")).not.toBe(
      cifrar("x".repeat(20), CHAVE, "a:b"),
    );
  });

  it("falha com a chave errada", () => {
    const c = cifrar("segredo-comprido-123", CHAVE, "a:b");
    expect(() => decifrar(c, randomBytes(32), "a:b")).toThrow();
  });

  it("falha se o valor cifrado for movido para outro campo", () => {
    const c = cifrar("segredo-comprido-123", CHAVE, "clickup:token");
    expect(() => decifrar(c, CHAVE, "shopee:partnerKey")).toThrow();
  });

  it("falha se o valor for adulterado", () => {
    const c = cifrar("segredo-comprido-123", CHAVE, "a:b");
    const partes = c.split(".");
    partes[3] = `${partes[3].slice(0, -2)}AA`;
    expect(() => decifrar(partes.join("."), CHAVE, "a:b")).toThrow();
  });
});

describe("mascaramento", () => {
  it("mostra só os 4 últimos caracteres", () => {
    const fim = fimDoSegredo("pk_123456789_ABCDEFGHIJ");
    expect(fim).toBe("GHIJ");
    expect(mascarar(fim)).toBe("••••GHIJ");
    expect(mascarar(fim)).not.toContain("pk_");
  });

  it("segredo curto não mostra nada, para não entregar o valor inteiro", () => {
    expect(fimDoSegredo("abc12345")).toBe("");
    expect(mascarar("")).toBe("••••");
  });

  it("removerSegredos apaga o valor de qualquer texto", () => {
    expect(
      removerSegredos("falhou com pk_segredo_xyz no cabeçalho", [
        "pk_segredo_xyz",
      ]),
    ).toBe("falhou com [oculto] no cabeçalho");
  });
});
