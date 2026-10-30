import { describe, expect, it } from "vitest";
import { afinidadeLexical, buscarChunks, cosseno, fatiarTexto } from "./rag";

describe("cosseno", () => {
  it("identidade e ortogonal", () => {
    expect(cosseno([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosseno([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("buscarChunks", () => {
  it("ranqueia por lexical sem embedding", () => {
    const chunks = [
      {
        id: "1",
        fonte: "causa",
        titulo: "Solda",
        texto: "Solda soltando na cuba exige reforço e laudo.",
        url: "",
        embedding: [] as number[],
      },
      {
        id: "2",
        fonte: "perfil",
        titulo: "Tom",
        texto: "Seja cordial e não prometa estorno.",
        url: "",
        embedding: [],
      },
    ];
    const r = buscarChunks("solda cuba laudo", chunks, {
      k: 2,
      minAfinidade: 0.01,
    });
    expect(r[0]?.id).toBe("1");
  });

  it("usa cosseno quando há embedding", () => {
    const chunks = [
      {
        id: "a",
        fonte: "url",
        titulo: "A",
        texto: "irrelevante",
        url: "",
        embedding: [1, 0, 0],
      },
      {
        id: "b",
        fonte: "url",
        titulo: "B",
        texto: "também",
        url: "",
        embedding: [0.9, 0.1, 0],
      },
    ];
    const r = buscarChunks("x", chunks, {
      k: 1,
      queryEmbedding: [1, 0, 0],
      minAfinidade: 0.5,
    });
    expect(r[0]?.id).toBe("a");
  });
});

describe("fatiarTexto / lexical", () => {
  it("fatia texto longo", () => {
    const t = "a".repeat(3200);
    expect(fatiarTexto(t, 1500, 100).length).toBeGreaterThan(1);
  });
  it("afinidade lexical básica", () => {
    expect(
      afinidadeLexical("solda cuba", "problema de solda na cuba"),
    ).toBeGreaterThan(0);
  });
});
