/** Extração de links e prioridade para crawl de site allowlist (RAG). */

const BLOQUEIO =
  /(?:\/(?:cart|checkout|login|register|account|wishlist|compare|logout|search)|[?&]route=(?:checkout|account)|javascript:|mailto:|tel:|\.(?:jpg|jpeg|png|gif|webp|svg|css|js|ico|woff2?|map|mp4|zip)(?:$|\?))/i;

const INSTITUCIONAL =
  /sobre|contato|contact|garantia|politica|pol[ií]tica|termos|privacidade|seguran[cç]a|quem-somos|empresa|atendimento|envio|entrega|faq|ajuda/i;

export function normalizarUrlCrawl(
  urlStr: string,
  base?: string,
): string | null {
  try {
    const u = new URL(urlStr, base);
    if (u.protocol !== "https:") return null;
    u.hash = "";
    // remove trailing slash exceto raiz
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function mesmoHost(a: string, b: string): boolean {
  try {
    return (
      new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function urlCrawlPermitida(urlStr: string, seedHost: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    if (u.hostname.toLowerCase() !== seedHost.toLowerCase()) return false;
    const full = `${u.pathname}${u.search}`;
    if (BLOQUEIO.test(full) || BLOQUEIO.test(urlStr)) return false;
    return true;
  } catch {
    return false;
  }
}

export function prioridadeUrl(urlStr: string): number {
  try {
    const path = new URL(urlStr).pathname + new URL(urlStr).search;
    if (!path || path === "/") return 0;
    if (INSTITUCIONAL.test(path)) return 1;
    if (/information|route=information/i.test(path)) return 2;
    return 5;
  } catch {
    return 9;
  }
}

export function acervoSugeridoParaUrl(
  urlStr: string,
): "institucional" | "produtos-site" {
  try {
    const path = new URL(urlStr).pathname + new URL(urlStr).search;
    if (
      INSTITUCIONAL.test(path) ||
      /information\/contact|information\/about/i.test(path)
    ) {
      return "institucional";
    }
  } catch {
    /* ignore */
  }
  return "produtos-site";
}

/** Extrai hrefs absolutos HTTPS do HTML, no mesmo host da base. */
export function extrairLinksHtml(html: string, baseUrl: string): string[] {
  let seedHost = "";
  try {
    seedHost = new URL(baseUrl).hostname;
  } catch {
    return [];
  }
  const vistos = new Set<string>();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) {
    const raw = (m[1] || "").trim();
    if (!raw || raw.startsWith("#")) continue;
    const abs = normalizarUrlCrawl(raw, baseUrl);
    if (!abs || !urlCrawlPermitida(abs, seedHost)) continue;
    vistos.add(abs);
  }
  return [...vistos].sort(
    (a, b) => prioridadeUrl(a) - prioridadeUrl(b) || a.localeCompare(b),
  );
}

export function ordenarFilaCrawl(urls: string[]): string[] {
  return [...urls].sort(
    (a, b) => prioridadeUrl(a) - prioridadeUrl(b) || a.localeCompare(b),
  );
}
