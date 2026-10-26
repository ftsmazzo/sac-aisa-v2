import path from "node:path";
import { describe, expect, it } from "vitest";
import { arquivoDaFoto, pastaDasFotos } from "./fotos";

describe("arquivoDaFoto", () => {
  it("fica dentro da pasta e recusa caminho que escapa", () => {
    const ok = arquivoDaFoto(path.join("abc", "foto.jpg"));
    expect(ok?.startsWith(path.resolve(pastaDasFotos()))).toBe(true);
    expect(arquivoDaFoto(`..${path.sep}segredo`)).toBeNull();
    expect(arquivoDaFoto(path.resolve("/etc/passwd"))).toBeNull();
  });
});
