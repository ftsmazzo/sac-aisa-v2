import { describe, expect, it } from "vitest";
import {
  acervoSugeridoParaUrl,
  extrairLinksHtml,
  prioridadeUrl,
  urlCrawlPermitida,
} from "./crawl";

describe("crawl", () => {
  it("extrai links do mesmo host e ignora cart/login/assets", () => {
    const html = `
      <a href="/sobre-nos">Sobre</a>
      <a href="https://aisadobrasil.com.br/contato">Contato</a>
      <a href="/cart">Cart</a>
      <a href="https://outro.com/x">Outro</a>
      <a href="/img/logo.png">Img</a>
      <a href="mailto:a@b.com">Mail</a>
    `;
    const links = extrairLinksHtml(html, "https://aisadobrasil.com.br/");
    expect(links.some((u) => u.includes("sobre-nos"))).toBe(true);
    expect(links.some((u) => u.includes("contato"))).toBe(true);
    expect(links.some((u) => u.includes("cart"))).toBe(false);
    expect(links.some((u) => u.includes("outro.com"))).toBe(false);
  });

  it("prioriza institucional e sugere acervo", () => {
    expect(prioridadeUrl("https://aisadobrasil.com.br/sobre-nos")).toBeLessThan(
      prioridadeUrl("https://aisadobrasil.com.br/prateleira-300"),
    );
    expect(
      acervoSugeridoParaUrl(
        "https://aisadobrasil.com.br/index.php?route=information/contact",
      ),
    ).toBe("institucional");
    expect(
      acervoSugeridoParaUrl("https://aisadobrasil.com.br/prateleiras"),
    ).toBe("produtos-site");
  });

  it("bloqueia rotas de conta", () => {
    expect(
      urlCrawlPermitida(
        "https://aisadobrasil.com.br/index.php?route=account/login",
        "aisadobrasil.com.br",
      ),
    ).toBe(false);
  });
});
