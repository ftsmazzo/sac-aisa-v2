import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { fatiarTexto } from "@sac-aisa/gestor-tools";
import { redigir } from "../ia/redacao";
import { ServicoIntegracoes } from "../integracoes";

const EMBED_PADRAO = "openai/text-embedding-3-small";
const CASOS_MAX = 80;

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
    titulo: string;
    texto: string;
    url?: string;
  }) {
    const texto = redigir(args.texto).trim();
    if (texto.length < 20) return { skipped: true as const };
    const embedding = await this.embed(`${args.titulo}\n${texto}`);
    await this.prisma.conhecimentoChunk.upsert({
      where: { chave: args.chave },
      create: {
        chave: args.chave,
        fonte: args.fonte,
        titulo: args.titulo.slice(0, 200),
        texto,
        url: args.url || "",
        embedding,
        modeloEmbedding: this.modeloEmbed(),
        ativo: true,
      },
      update: {
        fonte: args.fonte,
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
  async importarUrl(urlRaw: string) {
    const url = String(urlRaw || "").trim();
    if (!url.startsWith("https://")) {
      return { ok: false as const, mensagem: "Use apenas HTTPS." };
    }
    if (!this.hostPermitido(url)) {
      return {
        ok: false as const,
        mensagem:
          "Domínio fora da allowlist. Defina CONHECIMENTO_URL_ALLOWLIST (ex.: aisa.com.br).",
      };
    }
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "SAC-AISA-conhecimento/1.0" },
    });
    if (!res.ok) {
      return {
        ok: false as const,
        mensagem: `Falha ao baixar (${res.status}).`,
      };
    }
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/html") && !ctype.includes("text/plain")) {
      return {
        ok: false as const,
        mensagem: "Só HTML ou texto simples nesta fatia.",
      };
    }
    const bruto = await res.text();
    const texto = limparHtml(bruto);
    if (texto.length < 40) {
      return { ok: false as const, mensagem: "Página sem texto útil." };
    }
    const fatias = fatiarTexto(texto, 1500, 150);
    let gravados = 0;
    for (let i = 0; i < fatias.length; i++) {
      await this.upsertChunk({
        chave: `url:${url}#${i}`,
        fonte: "url",
        titulo: tituloDeUrl(url, i, fatias.length),
        texto: fatias[i],
        url,
      });
      gravados += 1;
    }
    return { ok: true as const, url, chunks: gravados };
  }

  async resumo() {
    const porFonte = await this.prisma.conhecimentoChunk.groupBy({
      by: ["fonte"],
      where: { ativo: true },
      _count: true,
    });
    return {
      total: porFonte.reduce((a, x) => a + x._count, 0),
      porFonte: Object.fromEntries(porFonte.map((x) => [x.fonte, x._count])),
      allowlist: this.allowlist(),
      modelo: this.modeloEmbed(),
    };
  }
}

function limparHtml(html: string): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return redigir(t);
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
