import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { Publico, Requer } from "../auth.guard";
import { EvolutionService } from "./evolution.service";
import { WhatsappService } from "./whatsapp.service";

@Controller("whatsapp")
export class ControladorWhatsapp {
  constructor(
    @Inject(WhatsappService) private readonly whatsapp: WhatsappService,
    @Inject(EvolutionService) private readonly evolution: EvolutionService,
  ) {}

  @Publico()
  @Post("webhook/evolution")
  @HttpCode(200)
  async webhook(
    @Body() body: unknown,
    @Headers("x-evolution-secret") secretHeader?: string,
    @Headers("apikey") apiKey?: string,
  ) {
    const esperado = await this.evolution.webhookSecret();
    // Em produção o segredo é obrigatório: URL pública sem auth abriria o agente.
    const exigir =
      process.env.NODE_ENV === "production" ||
      process.env.EVOLUTION_WEBHOOK_OBRIGATORIO === "1";
    if (!esperado && exigir) {
      throw new UnauthorizedException(
        "Webhook Evolution sem segredo configurado.",
      );
    }
    if (esperado) {
      const recebido = secretHeader || apiKey || "";
      if (recebido !== esperado) {
        throw new UnauthorizedException("Webhook sem segredo válido.");
      }
    }
    return this.whatsapp.handleWebhook(body);
  }

  /** Configura o webhook na Evolution apontando para esta API. */
  @Requer("integracoes.gerir")
  @Post("evolution/configure-webhook")
  async configureWebhook() {
    const base = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
    if (!base) {
      return {
        ok: false,
        mensagem: "Defina PUBLIC_API_URL para registrar o webhook.",
      };
    }
    const url = `${base}/whatsapp/webhook/evolution`;
    const r = await this.evolution.setWebhook(url);
    return { ok: true, url, resultado: r };
  }
}
