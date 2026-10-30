import { URL_OPENROUTER } from "../ia/provedor";

export type ChatToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

type ToolCall = {
  id: string;
  type?: string;
  function: { name: string; arguments?: string };
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type OpcoesOrquestrador = {
  chave: string;
  modelo: string;
  system: string;
  user: string;
  tools: ChatToolDef[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  history?: { role: "user" | "assistant"; content: string }[];
  maxRounds?: number;
  temperature?: number;
  timeoutMs?: number;
  referer?: string;
};

/**
 * Laço OpenAI-compatible (tools) via OpenRouter.
 * Sem response_format json — a resposta final é prosa WhatsApp.
 */
export async function chatComTools(opts: OpcoesOrquestrador): Promise<string> {
  const maxRounds = opts.maxRounds ?? 5;
  const history = (opts.history || []).slice(-12);
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    ...history.map(
      (h) => ({ role: h.role, content: h.content }) as ChatMessage,
    ),
    { role: "user", content: opts.user },
  ];

  const deadline = Date.now() + (opts.timeoutMs ?? 35_000);
  let usedTools = false;
  let stallNudges = 0;
  const headers = {
    Authorization: `Bearer ${opts.chave}`,
    "Content-Type": "application/json",
    "HTTP-Referer": opts.referer || "https://sac-aisa.local",
    "X-Title": "SAC AISA Gestor",
  };

  for (let round = 0; round < maxRounds; round++) {
    if (Date.now() > deadline) throw new Error("Timeout do orquestrador");

    const res = await fetch(URL_OPENROUTER, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.modelo,
        temperature: opts.temperature ?? 0.3,
        messages,
        tools: opts.tools,
        tool_choice: "auto",
      }),
      signal: AbortSignal.timeout(Math.max(3_000, deadline - Date.now())),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: ToolCall[];
        };
      }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error("Resposta LLM vazia");

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) {
      const content = (msg.content || "").trim();
      if (
        !usedTools &&
        stallNudges < 2 &&
        pareceEnrolacao(content, opts.user)
      ) {
        stallNudges++;
        messages.push({ role: "assistant", content: content || null });
        messages.push({
          role: "user",
          content:
            "Não peça confirmação, não diga “aguarde” e não reinicie a conversa. " +
            "Use o histórico. Chame periodo_resolver + a tool de dados agora e responda com os números/lista.",
        });
        continue;
      }
      return content || "Não consegui montar uma resposta agora.";
    }

    usedTools = true;
    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        args = {};
      }
      const result = await opts.executeTool(tc.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result).slice(0, 12_000),
      });
    }
  }

  const resFinal = await fetch(URL_OPENROUTER, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.modelo,
      temperature: opts.temperature ?? 0.3,
      tool_choice: "none",
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "Com os dados das tools acima, responda agora ao gestor em português, curto e factual. Sem novas tools.",
        },
      ],
    }),
    signal: AbortSignal.timeout(Math.max(3_000, deadline - Date.now())),
  });
  if (!resFinal.ok) throw new Error(`OpenRouter síntese ${resFinal.status}`);
  const jsonFinal = (await resFinal.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (
    (jsonFinal.choices?.[0]?.message?.content || "").trim() ||
    "Consultei os dados, mas não consegui resumir. Pode repetir o pedido?"
  );
}

function pareceEnrolacao(content: string, userMsg: string): boolean {
  const c = content.toLowerCase();
  const u = userMsg.toLowerCase().trim();
  if (
    /^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|eai|e aí)[\s!.?]*$/i.test(
      u,
    ) &&
    c.length < 220
  ) {
    return false;
  }
  if (!c) return true;
  if (
    /aguarde|um momento|um instante|já verifico|vou verificar|vamos verificar|pode confirmar|qual período|intervalo em mente|como posso ajudar|em que posso ajudar|olá!|ola!/.test(
      c,
    )
  ) {
    return true;
  }
  if (
    /(reclam|kit|setor|kpi|alerta|causa|ppm|status|plano|hoje|semana|ano|dias|clickup|card)/i.test(
      u,
    ) &&
    c.includes("?") &&
    !/\d/.test(c)
  ) {
    return true;
  }
  return false;
}
