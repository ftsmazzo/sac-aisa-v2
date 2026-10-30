import { Inject, Injectable, Logger } from "@nestjs/common";
import { FOTO_MAX_BYTES } from "@sac-aisa/domain";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { URL_OPENROUTER } from "../ia/provedor";
import { redigir } from "../ia/redacao";
import { ServicoIntegracoes } from "../integracoes";
import { EvolutionService } from "./evolution.service";
import {
  captionDaMensagem,
  detectarTipoMidia,
  FRASE_FALHA_MIDIA,
  MIDIA_MAX_BYTES,
  mimeAceitoParaTipo,
  montarTextoUsuario,
  normalizarMime,
  type TipoMidiaGestor,
  tamanhoBase64Bytes,
  textoPdfLocalSuficiente,
  truncarTexto,
} from "./midia";

const STT_PADRAO = "openai/whisper-large-v3-turbo";
const VISAO_PADRAO = "google/gemini-2.5-flash";
const PDF_OCR_MODELO_PADRAO = "google/gemini-2.5-flash";
const PROMPT_VISAO =
  "Extraia texto visível, SKU, códigos e números relevantes desta imagem do SAC industrial. " +
  "Seja objetivo. Não invente o que não aparecer. Se não houver texto útil, diga isso em uma frase curta.";
const PROMPT_PDF_OCR =
  "Extraia o texto útil deste PDF do SAC industrial (SKU, números, laudos, pedidos). " +
  "Seja objetivo e fiel ao documento. Não invente. Se não houver texto legível, diga isso em uma frase curta.";

@Injectable()
export class MidiaGestorService {
  private readonly log = new Logger(MidiaGestorService.name);

  constructor(
    @Inject(EvolutionService) private readonly evolution: EvolutionService,
    @Inject(ServicoIntegracoes) private readonly integr: ServicoIntegracoes,
  ) {}

  /**
   * Se a mensagem tiver mídia suportada, baixa e devolve texto para o orquestrador.
   * Sem mídia → null. Falha de leitura → frase fixa (o Zap não fica em silêncio).
   */
  async normalizarSeMidia(
    messageData: Record<string, unknown>,
  ): Promise<string | null> {
    const message = (messageData.message || {}) as Record<string, unknown>;
    const tipo = detectarTipoMidia(message);
    if (!tipo) return null;

    const caption = captionDaMensagem(message);
    try {
      const { base64, mimetype } =
        await this.evolution.getMediaBase64(messageData);
      const bytes = tamanhoBase64Bytes(base64);
      if (bytes < 1 || bytes > MIDIA_MAX_BYTES) {
        this.log.warn(
          `Mídia fora do limite: ${bytes} bytes (max ${MIDIA_MAX_BYTES})`,
        );
        return (
          montarTextoUsuario(tipo, FRASE_FALHA_MIDIA, caption) ||
          FRASE_FALHA_MIDIA
        );
      }
      const mime = normalizarMime(mimetype) || mimeDoTipo(tipo, message);
      if (!mimeAceitoParaTipo(tipo, mime)) {
        this.log.warn(`Mídia mime recusado: tipo=${tipo} mime=${mime}`);
        return (
          montarTextoUsuario(tipo, FRASE_FALHA_MIDIA, caption) ||
          FRASE_FALHA_MIDIA
        );
      }

      let corpo = "";
      if (tipo === "audio") corpo = await this.transcrever(base64, mime);
      else if (tipo === "image")
        corpo = await this.descreverImagem(base64, mime);
      else if (tipo === "pdf") corpo = await this.extrairPdf(base64);
      else corpo = await this.extrairDocx(base64);

      corpo = truncarTexto(corpo);
      if (!corpo) {
        return (
          montarTextoUsuario(tipo, FRASE_FALHA_MIDIA, caption) ||
          FRASE_FALHA_MIDIA
        );
      }
      return montarTextoUsuario(tipo, corpo, caption);
    } catch (e) {
      this.log.warn(
        `Falha ao normalizar mídia (${tipo}): ${e instanceof Error ? e.message : e}`,
      );
      return (
        montarTextoUsuario(tipo, FRASE_FALHA_MIDIA, caption) ||
        FRASE_FALHA_MIDIA
      );
    }
  }

  private async chaveOpenRouter(): Promise<string> {
    return (
      (await this.integr.segredo("openrouter", "chaveApi")) ||
      process.env.OPENROUTER_API_KEY ||
      ""
    );
  }

  private modeloStt(): string {
    return process.env.GESTOR_STT_MODEL?.trim() || STT_PADRAO;
  }

  private modeloVisao(): string {
    return process.env.GESTOR_VISION_MODEL?.trim() || VISAO_PADRAO;
  }

  private modeloPdfOcr(): string {
    return (
      process.env.GESTOR_PDF_OCR_MODEL?.trim() ||
      process.env.GESTOR_VISION_MODEL?.trim() ||
      PDF_OCR_MODELO_PADRAO
    );
  }

  private async transcrever(base64: string, mime: string): Promise<string> {
    const chave = await this.chaveOpenRouter();
    if (!chave) throw new Error("OpenRouter sem chave para STT");
    const buf = Buffer.from(base64, "base64");
    if (buf.length > FOTO_MAX_BYTES) throw new Error("Áudio acima de 5 MB");

    const form = new FormData();
    const ext = extensaoAudio(mime);
    form.append(
      "file",
      new Blob([new Uint8Array(buf)], { type: mime || "audio/ogg" }),
      `audio.${ext}`,
    );
    form.append("model", this.modeloStt());
    form.append("language", "pt");

    const res = await fetch(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "HTTP-Referer": "https://sac-aisa.local",
          "X-Title": "SAC AISA gestor STT",
        },
        body: form,
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!res.ok) {
      throw new Error(
        `STT OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as { text?: string };
    return String(json.text || "").trim();
  }

  private async descreverImagem(base64: string, mime: string): Promise<string> {
    const chave = await this.chaveOpenRouter();
    if (!chave) throw new Error("OpenRouter sem chave para visão");
    const dataUrl = `data:${mime || "image/jpeg"};base64,${base64}`;
    const res = await fetch(URL_OPENROUTER, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sac-aisa.local",
        "X-Title": "SAC AISA gestor visão",
      },
      body: JSON.stringify({
        model: this.modeloVisao(),
        temperature: 0.1,
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT_VISAO },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      throw new Error(
        `Visão OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((p) =>
          typeof p === "object" && p && "text" in p
            ? String((p as { text: string }).text)
            : "",
        )
        .join(" ")
        .trim();
    }
    return "";
  }

  /**
   * PDF com texto: pdf-parse (grátis). Scan/foto: Mistral OCR via OpenRouter.
   */
  private async extrairPdf(base64: string): Promise<string> {
    const buf = Buffer.from(base64, "base64");
    let local = "";
    try {
      const r = await pdfParse(buf);
      local = redigir(String(r.text || ""));
    } catch (e) {
      this.log.warn(
        `pdf-parse falhou, indo ao Mistral OCR: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (textoPdfLocalSuficiente(local)) return local;

    this.log.log(
      `PDF com pouco texto local (${local.trim().length} chars) — Mistral OCR`,
    );
    return this.extrairPdfMistralOcr(base64);
  }

  private async extrairPdfMistralOcr(base64: string): Promise<string> {
    const chave = await this.chaveOpenRouter();
    if (!chave) throw new Error("OpenRouter sem chave para PDF OCR");
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const res = await fetch(URL_OPENROUTER, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sac-aisa.local",
        "X-Title": "SAC AISA gestor PDF OCR",
      },
      body: JSON.stringify({
        model: this.modeloPdfOcr(),
        temperature: 0.1,
        max_tokens: 2000,
        plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT_PDF_OCR },
              {
                type: "file",
                file: { filename: "documento.pdf", file_data: dataUrl },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(
        `PDF Mistral OCR ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    let texto = "";
    if (typeof content === "string") texto = content.trim();
    else if (Array.isArray(content)) {
      texto = content
        .map((p) =>
          typeof p === "object" && p && "text" in p
            ? String((p as { text: string }).text)
            : "",
        )
        .join(" ")
        .trim();
    }
    return redigir(texto);
  }

  private async extrairDocx(base64: string): Promise<string> {
    const buf = Buffer.from(base64, "base64");
    const r = await mammoth.extractRawText({ buffer: buf });
    return redigir(String(r.value || ""));
  }
}

function mimeDoTipo(
  tipo: TipoMidiaGestor,
  message: Record<string, unknown>,
): string {
  if (tipo === "audio") {
    const a = message.audioMessage as { mimetype?: string } | undefined;
    return normalizarMime(a?.mimetype || "audio/ogg");
  }
  if (tipo === "image") {
    const i = message.imageMessage as { mimetype?: string } | undefined;
    return normalizarMime(i?.mimetype || "image/jpeg");
  }
  if (tipo === "pdf") return "application/pdf";
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function extensaoAudio(mime: string): string {
  const m = normalizarMime(mime);
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("aac")) return "aac";
  if (m.includes("amr")) return "amr";
  return "ogg";
}
