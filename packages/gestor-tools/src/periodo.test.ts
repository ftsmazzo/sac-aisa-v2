import { describe, expect, it } from "vitest";
import {
  formatWhatsapp,
  phoneMatch,
  resolverPeriodo,
  setorFuzzyMatch,
} from "./periodo";

describe("resolverPeriodo", () => {
  it("resolve 30d e ano", () => {
    const m = resolverPeriodo("30d");
    expect(m.de <= m.ate).toBe(true);
    expect(m.label).toMatch(/30/);
    const a = resolverPeriodo("este ano");
    expect(a.de.endsWith("-01-01")).toBe(true);
  });

  it("aceita de/ate explícitos", () => {
    const r = resolverPeriodo(undefined, "2026-01-01", "2026-01-31");
    expect(r).toEqual({
      de: "2026-01-01",
      ate: "2026-01-31",
      label: "2026-01-01 → 2026-01-31",
    });
  });
});

describe("formatWhatsapp", () => {
  it("remove markdown de site e padroniza bullets", () => {
    const t = formatWhatsapp("## Título\n- item\n**negrito** e `code`");
    expect(t).not.toContain("##");
    expect(t).not.toContain("**");
    expect(t).toContain("• item");
    expect(t).toContain("*negrito*");
    expect(t).not.toContain("`");
  });
});

describe("phoneMatch / setorFuzzy", () => {
  it("casa telefones pelos 11 finais", () => {
    expect(phoneMatch("5511999887766", "11999887766")).toBe(true);
  });

  it("casa Embalagens com Embalagem / Expedição", () => {
    expect(setorFuzzyMatch("Embalagem / Expedição", "Embalagens")).toBe(true);
  });
});
