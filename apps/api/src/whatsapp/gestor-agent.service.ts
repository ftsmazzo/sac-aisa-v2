import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { MODELO_PADRAO } from "../ia/provedor";
import { ServicoIntegracoes } from "../integracoes";
import { GestorMemoryService, type GestorSlots } from "./gestor-memory.service";
import { GestorToolsService, usuarioGestorDe } from "./gestor-tools";
import { chatComTools } from "./orquestrador";
import { formatWhatsapp, phoneMatch } from "./periodo";

const SYSTEM_ORQUESTRADOR =
  "Você é o analista do gestor SAC AISA (pós-venda industrial). Tom humanizado, objetivo e técnico: conversa natural em português, sem menu e sem comandos fixos.\n" +
  "Formato WhatsApp (obrigatório):\n" +
  "- Use bullets com o caractere • (não use - nem * no início da linha).\n" +
  "- Negrito só assim: *texto* (um asterisco). NUNCA use **texto**, ## títulos, ``` ou markdown de site.\n" +
  "- Ícones Unicode com parcimônia (⚠︎ atrasado, ✓ resolvido) — sem emoji decorativo em excesso.\n" +
  "- Resposta curta e clara: números + 1–3 insights quando houver dados; explicações em frases curtas.\n" +
  "Regras de orquestração:\n" +
  "1) HISTÓRICO + slots: “ok”, “e esse?”, “este ano” continuam o tema — nunca reinicie com “como posso ajudar”.\n" +
  "2) SKU: se falarem g-156 / g156 / G 156, chame sku_resolver ou sku_analise. Nunca diga que não existe sem resolver fuzzy.\n" +
  "3) Pedido claro → tools na hora. Período padrão 30 dias; “este ano” → preset ano. Não pergunte período se der para assumir.\n" +
  "4) Plano / G48 / card ClickUp → planos_listar, plano_status ou clickup_card (só leitura).\n" +
  "5) Política, causa/ação, tom da empresa ou manual → conhecimento_buscar; cite só o que vier nos trechos.\n" +
  "6) Nunca invente número. Tool {erro} ≠ zero reclamações.\n" +
  "7) Proibido: “aguarde”, “um momento”, menus, comandos KPI/MENU.\n" +
  "8) Só leitura. Sem PII do comprador (nome, telefone, endereço, e-mail). Fuso America/Sao_Paulo.";

export type GestorAuth =
  | {
      ok: true;
      usuario: UsuarioLogado;
      via: "env" | "usuario" | "destino";
    }
  | { ok: false };

@Injectable()
export class GestorAgentService {
  private readonly log = new Logger(GestorAgentService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ServicoIntegracoes) private readonly integr: ServicoIntegracoes,
    @Inject(GestorToolsService) private readonly tools: GestorToolsService,
    @Inject(GestorMemoryService) private readonly memory: GestorMemoryService,
  ) {}

  async autorizar(telefone: string, lid?: string): Promise<GestorAuth> {
    const digits = telefone.replace(/\D/g, "");
    const lidDigits = (lid || "").replace(/\D/g, "");
    if (!digits && !lidDigits) return { ok: false };

    const envList = (process.env.GESTOR_WHATSAPP_TELEFONES || "")
      .split(/[,;\s]+/)
      .map((t) => t.replace(/\D/g, ""))
      .filter(Boolean);
    if (
      envList.some(
        (t) => phoneMatch(digits, t) || (lidDigits && phoneMatch(lidDigits, t)),
      )
    ) {
      const admin = await this.prisma.usuario.findFirst({
        where: {
          ativo: true,
          perfil: { in: ["administrador", "gestor"] },
        },
        include: {
          setores: { include: { setor: { select: { nome: true } } } },
          marcas: { include: { marca: { select: { nome: true } } } },
          permissoes: true,
        },
        orderBy: { criadoEm: "asc" },
      });
      if (admin) {
        return {
          ok: true,
          usuario: usuarioGestorDe(admin),
          via: "env",
        };
      }
      // Fallback mínimo se ainda não há usuário: escopo gestor genérico
      return {
        ok: true,
        usuario: {
          id: "env-gestor",
          login: "env",
          nome: "Gestor (lista env)",
          perfil: "gestor",
          setores: [],
          marcas: [],
          permissoes: [],
        },
        via: "env",
      };
    }

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        ativo: true,
        perfil: { in: ["administrador", "gestor", "responsavel_setor"] },
        telefone: { not: null },
      },
      include: {
        setores: { include: { setor: { select: { nome: true } } } },
        marcas: { include: { marca: { select: { nome: true } } } },
        permissoes: true,
      },
    });
    for (const u of usuarios) {
      const t = String(u.telefone || "").replace(/\D/g, "");
      if (t && phoneMatch(digits, t)) {
        return { ok: true, usuario: usuarioGestorDe(u), via: "usuario" };
      }
    }

    // AlertaDestino só autoriza se houver Usuario com o mesmo telefone
    // (evita inventar perfil gestor com visão de todos os setores).
    const destinos = await this.prisma.alertaDestino.findMany({
      where: { ativo: true },
      select: { telefone: true, perfil: true },
    });
    for (const d of destinos) {
      const perfil = (d.perfil || "").toLowerCase();
      if (
        !perfil.includes("gestor") &&
        !perfil.includes("master") &&
        !perfil.includes("admin") &&
        !perfil.includes("responsavel")
      ) {
        continue;
      }
      const t = String(d.telefone || "").replace(/\D/g, "");
      if (!t || !phoneMatch(digits, t)) continue;
      const u = usuarios.find((x) =>
        phoneMatch(String(x.telefone || "").replace(/\D/g, ""), t),
      );
      if (u) {
        return { ok: true, usuario: usuarioGestorDe(u), via: "destino" };
      }
    }

    return { ok: false };
  }

  async seedMemoryFromDb(telefone: string, conversaId: string) {
    const mem = await this.memory.load(telefone);
    if (mem.turns.length > 0) return;
    const recentes = await this.prisma.whatsappMensagem.findMany({
      where: { conversaId },
      orderBy: { criadoEm: "asc" },
      take: 20,
      select: { direcao: true, texto: true },
    });
    for (const m of recentes) {
      if (!m.texto?.trim()) continue;
      await this.memory.appendTurn(
        telefone,
        m.direcao === "inbound" ? "user" : "assistant",
        String(m.texto).slice(0, 1500),
      );
    }
  }

  async responder(
    texto: string,
    usuario: UsuarioLogado,
    opts?: { telefone?: string },
  ): Promise<string> {
    const t = texto.trim() || "oi";
    const telefone = opts?.telefone || "";

    let history: { role: "user" | "assistant"; content: string }[] = [];
    let slotsHint = "";
    if (telefone) {
      const mem = await this.memory.load(telefone);
      history = this.memory.historyForLlm(mem);
      slotsHint = this.memory.slotsHint(mem.slots);
      await this.memory.appendTurn(telefone, "user", t);
    }

    const chave =
      (await this.integr.segredo("openrouter", "chaveApi")) ||
      process.env.OPENROUTER_API_KEY ||
      "";
    if (!chave) {
      const msg =
        "Oi. Ainda preciso da chave de IA (OpenRouter) nas integrações para conversar com você.";
      if (telefone) await this.memory.appendTurn(telefone, "assistant", msg);
      return msg;
    }

    const cfg = await this.integr.config("openrouter");
    const modelo =
      process.env.GESTOR_LLM_MODEL?.trim() ||
      (typeof cfg.modelo === "string" && cfg.modelo.trim()
        ? cfg.modelo.trim()
        : "") ||
      process.env.OPENROUTER_MODELO?.trim() ||
      MODELO_PADRAO;

    try {
      const slotPatch: Partial<GestorSlots> = {};
      const system = slotsHint
        ? `${SYSTEM_ORQUESTRADOR}\n\n${slotsHint}`
        : SYSTEM_ORQUESTRADOR;

      const resposta = await chatComTools({
        chave,
        modelo,
        system,
        user: t,
        history,
        tools: this.tools.defs(),
        executeTool: async (name, args) => {
          const result = await this.tools.execute(name, args, usuario);
          this.captureSlots(name, args, result, slotPatch);
          return result;
        },
        maxRounds: 6,
        temperature: 0.3,
        timeoutMs: 40_000,
      });

      const formatted = formatWhatsapp(resposta);
      if (telefone) {
        await this.memory.appendTurn(
          telefone,
          "assistant",
          formatted,
          slotPatch,
        );
      }
      return formatted;
    } catch (e) {
      this.log.warn(`Orquestrador gestor falhou: ${e}`);
      return "Deu uma falha aqui agora. Manda de novo em instantes, por favor.";
    }
  }

  private captureSlots(
    name: string,
    args: Record<string, unknown>,
    result: unknown,
    patch: Partial<GestorSlots>,
  ) {
    const r = result as Record<string, unknown>;
    if (name === "periodo_resolver" && r.de && r.ate) {
      patch.ultimoPeriodo = {
        de: String(r.de),
        ate: String(r.ate),
        label: r.label != null ? String(r.label) : undefined,
      };
    }
    if (name === "sku_resolver" || name === "sku_analise") {
      const melhor = r.melhor as { sku?: string } | undefined;
      const canon =
        r.sku_canonico != null ? String(r.sku_canonico) : melhor?.sku;
      if (canon) patch.ultimoSku = canon;
    }
    if (name === "reclamacoes_listar" && r.sku_canonico) {
      patch.ultimoSku = String(r.sku_canonico);
    }
    if (name === "setor_resumo" && typeof args.nome === "string" && args.nome) {
      const nomes = r.nomes_oficiais as string[] | undefined;
      patch.ultimoSetor = nomes?.[0] || args.nome;
    }
    if (typeof args.causa === "string" && args.causa) {
      patch.ultimaCausa = args.causa;
    }
    if (name === "planos_listar" || name === "plano_status") {
      patch.ultimoTema = "plano";
    }
    if (name === "clickup_card") patch.ultimoTema = "clickup";
  }
}
