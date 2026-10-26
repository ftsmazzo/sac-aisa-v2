import { describe, expect, it } from "vitest";
import { FOTO_MAX_BYTES, fotoAceita } from "./fotos";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

describe("fotoAceita", () => {
  it("aceita JPEG, PNG e WebP dentro do limite", () => {
    expect(fotoAceita("image/jpeg", 1200, jpeg)).toBeNull();
    expect(fotoAceita("image/png", 1200, png)).toBeNull();
    expect(fotoAceita("image/webp", 1200, webp)).toBeNull();
  });

  it("recusa tipo trocado, arquivo vazio e foto acima de 5 MB", () => {
    expect(fotoAceita("image/png", 1200, jpeg)).toMatch(/JPEG/);
    expect(fotoAceita("application/pdf", 1200, jpeg)).toMatch(/JPEG/);
    expect(fotoAceita("image/jpeg", 0, jpeg)).toMatch(/vazia/);
    expect(fotoAceita("image/jpeg", FOTO_MAX_BYTES + 1, jpeg)).toMatch(/5 MB/);
  });
});
