import { Inject, Injectable, Logger } from "@nestjs/common";
import { ServicoIntegracoes } from "../integracoes";

type Credenciais = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

@Injectable()
export class EvolutionService {
  private readonly log = new Logger(EvolutionService.name);

  constructor(
    @Inject(ServicoIntegracoes) private readonly integr: ServicoIntegracoes,
  ) {}

  private async credenciais(): Promise<Credenciais> {
    const cfg = await this.integr.config("evolution");
    const apiKey =
      (await this.integr.segredo("evolution", "apiKey")) ||
      process.env.EVOLUTION_API_KEY ||
      "";
    const baseUrl = String(
      cfg.urlApi || process.env.EVOLUTION_API_URL || "http://localhost:8080",
    ).replace(/\/$/, "");
    const instance = String(
      cfg.instancia || process.env.EVOLUTION_INSTANCE || "sac-aisa",
    );
    return { baseUrl, apiKey, instance };
  }

  /**
   * Destino aceito pela Evolution:
   * - telefone E.164 (5511…)
   * - JID completo (5511…@s.whatsapp.net ou 123…@lid)
   */
  async sendText(numberOrJid: string, text: string) {
    const { baseUrl, apiKey, instance } = await this.credenciais();
    if (!apiKey) {
      this.log.warn(
        `Evolution sem API key — mensagem simulada para ${numberOrJid}: ${text.slice(0, 80)}`,
      );
      return { simulated: true };
    }
    const raw = String(numberOrJid || "").trim();
    const number = raw.includes("@") ? raw : raw.replace(/\D/g, "");
    if (!number) throw new Error("Destino vazio para sendText");

    const url = `${baseUrl}/message/sendText/${instance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Evolution sendText ${res.status}: ${body}`);
    }
    return res.json();
  }

  async setWebhook(webhookUrl: string) {
    const { baseUrl, apiKey, instance } = await this.credenciais();
    if (!apiKey) return { skipped: true };
    const url = `${baseUrl}/webhook/set/${instance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT"],
      }),
    });
    if (!res.ok) throw new Error(`Evolution webhook ${res.status}`);
    return res.json();
  }

  async webhookSecret(): Promise<string> {
    return (
      (await this.integr.segredo("evolution", "webhookSecret")) ||
      process.env.EVOLUTION_WEBHOOK_SECRET ||
      ""
    );
  }
}
