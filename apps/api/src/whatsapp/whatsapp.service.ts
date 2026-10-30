import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { EvolutionService } from "./evolution.service";
import { GestorAgentService } from "./gestor-agent.service";
import { detectarTipoMidia } from "./midia";
import { MidiaGestorService } from "./midia.service";

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly log = new Logger(WhatsappService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(EvolutionService) private readonly evolution: EvolutionService,
    @Inject(GestorAgentService)
    private readonly gestorAgent: GestorAgentService,
    @Inject(MidiaGestorService) private readonly midia: MidiaGestorService,
  ) {}

  /**
   * Na subida, a própria API registra o webhook na Evolution com
   * PUBLIC_API_URL + EVOLUTION_WEBHOOK_SECRET (ou segredo da integração).
   * Admin ainda pode forçar via POST /whatsapp/evolution/configure-webhook.
   */
  async onModuleInit() {
    if (process.env.EVOLUTION_SKIP_WEBHOOK_BOOT === "1") return;
    const base = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
    if (!base) return;
    void this.registrarWebhookNaEvolution(base);
  }

  async registrarWebhookNaEvolution(base: string) {
    const url = `${base.replace(/\/$/, "")}/whatsapp/webhook/evolution`;
    try {
      const r = await this.evolution.setWebhook(url);
      if ((r as { skipped?: boolean })?.skipped) {
        this.log.warn("Webhook Evolution: sem API key — não registrado.");
        return { ok: false as const, url, skipped: true };
      }
      this.log.log(`Webhook Evolution registrado: ${url}`);
      return { ok: true as const, url, resultado: r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`Webhook Evolution na subida falhou: ${msg}`);
      return { ok: false as const, url, erro: msg };
    }
  }

  async handleWebhook(payload: unknown) {
    const msg = this.extractMessage(payload);
    if (!msg) return { ignored: true };

    let texto = msg.texto;
    if (msg.temMidia && msg.messageData) {
      const normalizado = await this.midia.normalizarSeMidia(msg.messageData);
      if (normalizado) texto = normalizado;
    }
    if (!texto) return { ignored: true };

    this.log.log(
      `WA inbound telefone=${msg.telefone}${msg.lid ? ` lid=${msg.lid}` : ""} destino=${msg.destinoEnvio} texto=${texto.slice(0, 40)}`,
    );

    const auth = await this.gestorAgent.autorizar(msg.telefone, msg.lid);
    if (!auth.ok) {
      // Fase 1A: só canal interno. Sem resposta a não autorizados (evita vazamento).
      this.log.log(`WA recusado (não gestor): ${msg.telefone}`);
      return { ok: true, recusado: true };
    }

    return this.handleGestor(
      msg.telefone,
      msg.destinoEnvio,
      texto,
      msg.nome,
      auth.usuario,
    );
  }

  private async handleGestor(
    telefone: string,
    destinoEnvio: string,
    texto: string,
    nomePush: string | undefined,
    usuario: Parameters<GestorAgentService["responder"]>[1],
  ) {
    let conversa = await this.prisma.whatsappConversa.findFirst({
      where: { telefone, ativo: true, papel: "interno" },
      orderBy: { alteradoEm: "desc" },
    });
    if (!conversa) {
      conversa = await this.prisma.whatsappConversa.create({
        data: {
          telefone,
          nome: usuario.nome || nomePush || "",
          papel: "interno",
          estado: "gestor",
          contexto: {},
        },
      });
    }

    await this.gestorAgent.seedMemoryFromDb(telefone, conversa.id);

    await this.prisma.whatsappMensagem.create({
      data: { conversaId: conversa.id, direcao: "inbound", texto },
    });

    const resposta = await this.gestorAgent.responder(texto, usuario, {
      telefone,
    });
    await this.reply(conversa.id, destinoEnvio, resposta);
    return { ok: true, gestor: true };
  }

  /**
   * Evolution v2+ manda remoteJid como `@lid` e o telefone real em `remoteJidAlt`.
   */
  private extractMessage(payload: unknown): {
    telefone: string;
    destinoEnvio: string;
    texto: string;
    nome?: string;
    lid?: string;
    temMidia: boolean;
    messageData?: Record<string, unknown>;
  } | null {
    const p = payload as Record<string, unknown>;
    let data = (p.data || p) as Record<string, unknown>;
    if (Array.isArray(data)) data = (data[0] || {}) as Record<string, unknown>;
    if (!data.key && Array.isArray(data.messages)) {
      data = (data.messages[0] || {}) as Record<string, unknown>;
    }

    const key = (data.key || {}) as Record<string, unknown>;
    if (key.fromMe) return null;

    const remoteJid = String(key.remoteJid || data.remoteJid || "");
    if (!remoteJid) {
      this.log.warn("Webhook sem remoteJid — ignorado");
      return null;
    }
    if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) {
      return null;
    }

    const remoteJidAlt = String(
      key.remoteJidAlt ||
        key.senderPn ||
        data.senderPn ||
        key.participantAlt ||
        "",
    );
    const isLid = remoteJid.includes("@lid");
    const lid = isLid
      ? remoteJid.replace(/@.*/, "").replace(/\D/g, "") || undefined
      : undefined;

    let telefone = "";
    if (remoteJidAlt && !remoteJidAlt.includes("@lid")) {
      telefone = remoteJidAlt.replace(/@.*/, "").replace(/\D/g, "");
    }
    if (!telefone && !isLid) {
      telefone = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
    }
    if (!telefone && lid) telefone = lid;

    if (!telefone) {
      this.log.warn(
        `Webhook sem telefone resolvível jid=${remoteJid} alt=${remoteJidAlt}`,
      );
      return null;
    }

    const telefoneResolvido = Boolean(
      remoteJidAlt && !remoteJidAlt.includes("@lid"),
    );
    const destinoEnvio = telefoneResolvido
      ? telefone
      : remoteJid.includes("@")
        ? remoteJid
        : lid
          ? `${lid}@lid`
          : telefone;

    const message = (data.message || {}) as Record<string, unknown>;
    const temMidia = detectarTipoMidia(message) !== null;
    const texto = String(
      message.conversation ||
        (message.extendedTextMessage as { text?: string } | undefined)?.text ||
        (message.imageMessage as { caption?: string } | undefined)?.caption ||
        (message.documentMessage as { caption?: string } | undefined)
          ?.caption ||
        (
          message.buttonsResponseMessage as
            | { selectedDisplayText?: string }
            | undefined
        )?.selectedDisplayText ||
        (message.listResponseMessage as { title?: string } | undefined)
          ?.title ||
        data.body ||
        "",
    ).trim();
    const nome = String(data.pushName || "");
    return {
      telefone,
      destinoEnvio,
      texto,
      nome,
      lid,
      temMidia,
      messageData: temMidia ? data : undefined,
    };
  }

  private async reply(conversaId: string, destinoEnvio: string, texto: string) {
    await this.prisma.whatsappMensagem.create({
      data: { conversaId, direcao: "outbound", texto },
    });
    try {
      await this.evolution.sendText(destinoEnvio, texto);
    } catch (e) {
      this.log.warn(`Falha envio Evolution (destino=${destinoEnvio}): ${e}`);
    }
  }
}
