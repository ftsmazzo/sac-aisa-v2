import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {
  ACERVOS,
  type AcervoId,
  acervoDeFonte,
  acervoSugeridoParaUrl,
  acervoValido,
  extrairLinksHtml,
  fatiarTexto,
  normalizarUrlCrawl,
  ordenarFilaCrawl,
  urlCrawlPermitida,
} from "@sac-aisa/gestor-tools";
import { redigir } from "../ia/redacao";
import { ServicoIntegracoes } from "../integracoes";

const EMBED_PADRAO = "openai/text-embedding-3-small";
const CASOS_MAX = 80;
const CRAWL_MAX_PADRAO = 40;
const CRAWL_MAX_TETO = 80;

@Injectable()
export class ConhecimentoService {
  private readonly log = new Logger(ConhecimentoService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ServicoIntegracoes) private readonly integr: ServicoIntegracoes,
  ) {}

  private modeloEmbed(): string {
    return process.env.GESTOR_EMBED_MODEL?.trim() || EMBED_PADRAO;
  }

  private async chaveOpenRouter(): Promise<string> {
    return (
      (await this.integr.segredo("openrouter", "chaveApi")) ||
      process.env.OPENROUTER_API_KEY ||
      ""
    );
  }

  async embed(texto: string): Promise<number[]> {
    const chave = await this.chaveOpenRouter();
    if (!chave) throw new Error("OpenRouter sem chave para embedding");
    const input = texto.slice(0, 8000);
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sac-aisa.local",
        "X-Title": "SAC AISA gestor RAG",
      },
      body: JSON.stringify({ model: this.modeloEmbed(), input }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(
        `Embedding OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const emb = json.data?.[0]?.embedding;
    if (!emb?.length) throw new Error("Embedding vazio");
    return emb;
  }

  private async upsertChunk(args: {
    chave: string;
    fonte: "perfil" | "pergunta" | "causa" | "caso" | "url" | "manual";
    acervo?: AcervoId;
    titulo: string;
    texto: string;
    url?: string;
  }) {
    // Casos podem ter PII do comprador; site/perfil/manual são contato público da empresa.
    const texto = (
      args.fonte === "caso" ? redigir(args.texto) : args.texto
    ).trim();
    if (texto.length < 20) return { skipped: true as const };
    const acervo = args.acervo ?? acervoDeFonte(args.fonte);
    const embedding = await this.embed(`${args.titulo}\n${texto}`);
    await this.prisma.conhecimentoChunk.upsert({
      where: { chave: args.chave },
      create: {
        chave: args.chave,
        fonte: args.fonte,
        acervo,
        titulo: args.titulo.slice(0, 200),
        texto,
        url: args.url || "",
        embedding,
        modeloEmbedding: this.modeloEmbed(),
        ativo: true,
      },
      update: {
        fonte: args.fonte,
        acervo,
        titulo: args.titulo.slice(0, 200),
        texto,
        url: args.url || "",
        embedding,
        modeloEmbedding: this.modeloEmbed(),
        ativo: true,
      },
    });
    return { ok: true as const };
  }

  /** Reindexa fontes internas curadas (perfil, perguntas, causas, amostra de casos). */
  async sincronizar() {
    let gravados = 0;
    let erros = 0;

    const perfil = await this.prisma.perfilEmpresaVersao.findFirst({
      orderBy: { versao: "desc" },
    });
    if (perfil) {
      const texto = [
        perfil.descricao,
        perfil.missao,
        perfil.valores,
        perfil.metas,
        `Tom: ${perfil.tomDeVoz}`,
        `Dizer: ${perfil.dizer}`,
        `Evitar: ${perfil.evitar}`,
        perfil.assinatura,
        JSON.stringify(perfil.exemplos),
      ]
        .filter(Boolean)
        .join("\n");
      try {
        const r = await this.upsertChunk({
          chave: `perfil:v${perfil.versao}`,
          fonte: "perfil",
          titulo: `Perfil empresa v${perfil.versao}`,
          texto,
        });
        if (r.ok) gravados += 1;
      } catch (e) {
        erros += 1;
        this.log.warn(`sync perfil: ${e}`);
      }
    }

    const perguntas = await this.prisma.perguntaObrigatoria.findMany({
      where: { ativa: true },
    });
    for (const p of perguntas) {
      try {
        const r = await this.upsertChunk({
          chave: `pergunta:${p.chave}`,
          fonte: "pergunta",
          titulo: p.texto.slice(0, 120),
          texto: [
            p.texto,
            p.exemplo ? `Exemplo: ${p.exemplo}` : "",
            p.categoria ? `Categoria: ${p.categoria}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
        if (r.ok) gravados += 1;
      } catch (e) {
        erros += 1;
        this.log.warn(`sync pergunta ${p.chave}: ${e}`);
      }
    }

    const causas = await this.prisma.causa.findMany({
      include: { setor: { select: { nome: true } } },
    });
    for (const c of causas) {
      try {
        const r = await this.upsertChunk({
          chave: `causa:${c.id}`,
          fonte: "causa",
          titulo: c.nome,
          texto: [
            `Causa: ${c.nome}`,
            `Categoria: ${c.categoria}`,
            c.acao ? `Ação sugerida: ${c.acao}` : "",
            `Setor: ${c.setor.nome}`,
          ]
            .filter(Boolean)
            .join("\n"),
        });
        if (r.ok) gravados += 1;
      } catch (e) {
        erros += 1;
        this.log.warn(`sync causa ${c.id}: ${e}`);
      }
    }

    const casos = await this.prisma.reclamacao.findMany({
      where: {
        treino: false,
        dataAcao: { not: null },
        OR: [{ solucao: { not: "" } }, { laudo: { not: "" } }],
      },
      orderBy: { dataAcao: "desc" },
      take: CASOS_MAX,
      select: {
        id: true,
        numero: true,
        solucao: true,
        laudo: true,
        descricao: true,
        produto: { select: { codigo: true } },
        causa: { select: { nome: true } },
      },
    });
    for (const r of casos) {
      try {
        const texto = redigir(
          [
            r.produto?.codigo ? `SKU ${r.produto.codigo}` : "",
            r.causa?.nome ? `Causa ${r.causa.nome}` : "",
            r.descricao ? `Descrição: ${r.descricao.slice(0, 400)}` : "",
            r.laudo ? `Laudo: ${r.laudo.slice(0, 600)}` : "",
            r.solucao ? `Solução: ${r.solucao.slice(0, 600)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        const up = await this.upsertChunk({
          chave: `caso:${r.id}`,
          fonte: "caso",
          titulo: `Caso #${r.numero}`,
          texto,
        });
        if (up.ok) gravados += 1;
      } catch (e) {
        erros += 1;
        this.log.warn(`sync caso ${r.numero}: ${e}`);
      }
    }

    const total = await this.prisma.conhecimentoChunk.count({
      where: { ativo: true },
    });
    return { gravados, erros, total_ativos: total };
  }

  allowlist(): string[] {
    return (process.env.CONHECIMENTO_URL_ALLOWLIST || "")
      .split(/[,;\s]+/)
      .map((d) => d.trim().toLowerCase())
      .map((d) => {
        try {
          if (d.includes("://")) return new URL(d).hostname.toLowerCase();
        } catch {
          /* ignora */
        }
        return d.replace(/^www\./, "");
      })
      .filter(Boolean);
  }

  private hostPermitido(urlStr: string): boolean {
    const lista = this.allowlist();
    if (!lista.length) return false;
    let host = "";
    try {
      host = new URL(urlStr).hostname.toLowerCase();
    } catch {
      return false;
    }
    return lista.some((d) => host === d || host.endsWith(`.${d}`));
  }

  /** Importa página pública (allowlist). Só HTTPS. */
  async importarUrl(urlRaw: string, acervoRaw?: string) {
    const url = normalizarUrlCrawl(String(urlRaw || "").trim()) || "";
    if (!url.startsWith("https://")) {
      return { ok: false as const, mensagem: "Use apenas HTTPS." };
    }
    if (!this.hostPermitido(url)) {
      return {
        ok: false as const,
        mensagem:
          "Domínio fora da allowlist. Defina CONHECIMENTO_URL_ALLOWLIST (ex.: aisadobrasil.com.br).",
      };
    }
    const acervo: AcervoId = acervoValido(acervoRaw)
      ? acervoRaw
      : acervoSugeridoParaUrl(url);
    const page = await this.baixarPagina(url);
    if (!page.ok) return page;
    const gravados = await this.indexarPagina(url, page.texto, acervo);
    return { ok: true as const, url, acervo, chunks: gravados };
  }

  /**
   * Crawl BFS no mesmo domínio (allowlist): a partir da URL semente, segue links
   * internos e indexa até maxPaginas. Prioriza páginas institucionais.
   */
  async importarSite(
    urlRaw: string,
    opts: { acervo?: string; maxPaginas?: number } = {},
  ) {
    const seed = normalizarUrlCrawl(String(urlRaw || "").trim());
    if (!seed?.startsWith("https://")) {
      return { ok: false as const, mensagem: "Use apenas HTTPS." };
    }
    if (!this.hostPermitido(seed)) {
      return {
        ok: false as const,
        mensagem:
          "Domínio fora da allowlist. Defina CONHECIMENTO_URL_ALLOWLIST (ex.: aisadobrasil.com.br).",
      };
    }
    let seedHost = "";
    try {
      seedHost = new URL(seed).hostname;
    } catch {
      return { ok: false as const, mensagem: "URL inválida." };
    }

    const maxPaginas = Math.min(
      Math.max(Number(opts.maxPaginas) || CRAWL_MAX_PADRAO, 1),
      CRAWL_MAX_TETO,
    );
    const acervoFixo = acervoValido(opts.acervo) ? opts.acervo : undefined;

    const fila: string[] = [seed, ...sementesInstitucionais(seed)];
    const vistos = new Set<string>();
    const urlsOk: string[] = [];
    const erros: { url: string; mensagem: string }[] = [];
    let chunks = 0;

    while (fila.length > 0 && vistos.size < maxPaginas) {
      const ordenada = ordenarFilaCrawl(fila.splice(0, fila.length));
      const url = ordenada.shift();
      if (!url) break;
      fila.push(...ordenada);
      if (vistos.has(url)) continue;
      if (!urlCrawlPermitida(url, seedHost) || !this.hostPermitido(url)) {
        continue;
      }
      vistos.add(url);

      const page = await this.baixarPagina(url);
      if (!page.ok) {
        erros.push({ url, mensagem: page.mensagem });
        continue;
      }

      const acervo: AcervoId = acervoFixo ?? acervoSugeridoParaUrl(url);
      try {
        chunks += await this.indexarPagina(url, page.texto, acervo);
        urlsOk.push(url);
      } catch (e) {
        erros.push({
          url,
          mensagem: e instanceof Error ? e.message : String(e),
        });
      }

      for (const link of extrairLinksHtml(page.html, url)) {
        if (!vistos.has(link) && urlCrawlPermitida(link, seedHost)) {
          fila.push(link);
        }
      }
    }

    return {
      ok: true as const,
      seed,
      max_paginas: maxPaginas,
      visitadas: vistos.size,
      paginas_ok: urlsOk.length,
      chunks,
      erros: erros.slice(0, 20),
      urls: urlsOk.slice(0, 60),
      como_ler:
        "Crawl no domínio allowlist. Reimporte o site quando o conteúdo mudar. Contato/sobre entram no acervo institucional automaticamente.",
    };
  }

  private async baixarPagina(
    url: string,
  ): Promise<
    { ok: true; html: string; texto: string } | { ok: false; mensagem: string }
  > {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "SAC-AISA-conhecimento/1.0" },
      });
      if (!res.ok) {
        return { ok: false, mensagem: `Falha ao baixar (${res.status}).` };
      }
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("text/html") && !ctype.includes("text/plain")) {
        return { ok: false, mensagem: "Só HTML ou texto simples." };
      }
      const html = await res.text();
      const texto = limparHtml(html);
      if (texto.length < 40) {
        return { ok: false, mensagem: "Página sem texto útil." };
      }
      return { ok: true, html, texto };
    } catch (e) {
      return {
        ok: false,
        mensagem: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async indexarPagina(
    url: string,
    texto: string,
    acervo: AcervoId,
  ): Promise<number> {
    const fatias = fatiarTexto(texto, 1500, 150);
    let gravados = 0;
    for (let i = 0; i < fatias.length; i++) {
      await this.upsertChunk({
        chave: `url:${url}#${i}`,
        fonte: "url",
        acervo,
        titulo: tituloDeUrl(url, i, fatias.length),
        texto: fatias[i],
        url,
      });
      gravados += 1;
    }
    return gravados;
  }

  async resumo() {
    const [porFonte, porAcervo] = await Promise.all([
      this.prisma.conhecimentoChunk.groupBy({
        by: ["fonte"],
        where: { ativo: true },
        _count: true,
      }),
      this.prisma.conhecimentoChunk.groupBy({
        by: ["acervo"],
        where: { ativo: true },
        _count: true,
      }),
    ]);
    return {
      total: porFonte.reduce((a, x) => a + x._count, 0),
      porFonte: Object.fromEntries(porFonte.map((x) => [x.fonte, x._count])),
      porAcervo: Object.fromEntries(
        porAcervo.map((x) => [x.acervo || "(vazio)", x._count]),
      ),
      acervos: ACERVOS.map((a) => ({ ...a })),
      allowlist: this.allowlist(),
      modelo: this.modeloEmbed(),
    };
  }
}

function limparHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Atalhos institucionais comuns (OpenCart / lojas HDG) para não depender só do menu. */
function sementesInstitucionais(seed: string): string[] {
  try {
    const origin = new URL(seed).origin;
    const caminhos = [
      "/sobre-nos",
      "/contato",
      "/garantia-de-produtos",
      "/politica-de-envio",
      "/seguranca",
      "/termos-de-uso-e-privacidade",
      "/index.php?route=information/contact",
      "/index.php?route=information/information",
    ];
    return caminhos
      .map((p) => normalizarUrlCrawl(`${origin}${p}`))
      .filter((u): u is string => Boolean(u));
  } catch {
    return [];
  }
}

function tituloDeUrl(url: string, i: number, n: number): string {
  try {
    const u = new URL(url);
    const base = u.pathname.replace(/\/$/, "").split("/").pop() || u.hostname;
    return n > 1 ? `${base} (${i + 1}/${n})` : base;
  } catch {
    return `página ${i + 1}`;
  }
}
