import { describe, expect, it } from "vitest";
import {
  ERRO_SEM_LISTA,
  type ItemFilaClickup,
  textoDaFilaSemLista,
} from "./integracoes";

function item(parcial: Partial<ItemFilaClickup>): ItemFilaClickup {
  return {
    cardId: "c",
    titulo: "Reclamação #1",
    estado: "erro",
    taskId: null,
    tentativas: 0,
    ultimoErro: ERRO_SEM_LISTA,
    proximaTentativaEm: null,
    comentariosPendentes: 0,
    ...parcial,
  };
}

describe("fila sem lista", () => {
  it("nomeia os setores e não pede para criar card", () => {
    const texto = textoDaFilaSemLista([
      item({ cardId: "a", setorNome: "Logística" }),
      item({ cardId: "b", setorNome: "Compras" }),
      item({ cardId: "c", setorNome: "Logística" }),
      item({ cardId: "d", setorNome: null }),
      item({ cardId: "e", ultimoErro: "Outro erro", setorNome: "Corte" }),
    ]);
    expect(texto).toContain("Nenhum card precisa ser criado");
    expect(texto).toContain("Compras, Logística");
    expect(texto).not.toContain("Corte");
    expect(texto).toContain("Uma reclamação ainda não tem setor");
    expect(texto).toContain("Gravar");
  });
});
