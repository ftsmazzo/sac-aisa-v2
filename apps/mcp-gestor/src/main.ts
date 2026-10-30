/**
 * MCP stdio do agente gestor (só leitura).
 *
 * Uso (Cursor mcp.json):
 *   command: npx
 *   args: ["tsx", "apps/mcp-gestor/src/main.ts"]
 *   env: DATABASE_URL, OPENROUTER_API_KEY (RAG), opcional GESTOR_MCP_LOGIN
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  GESTOR_TOOL_DEFS,
  GestorTools,
  usuarioGestorDe,
} from "@sac-aisa/gestor-tools";

const prisma = new PrismaClient();
const EMBED_PADRAO = "openai/text-embedding-3-small";

async function embed(texto: string): Promise<number[]> {
  const chave = process.env.OPENROUTER_API_KEY || "";
  if (!chave) throw new Error("OPENROUTER_API_KEY ausente para embedding");
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://sac-aisa.local",
      "X-Title": "SAC AISA MCP RAG",
    },
    body: JSON.stringify({
      model: process.env.GESTOR_EMBED_MODEL?.trim() || EMBED_PADRAO,
      input: texto.slice(0, 8000),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(
      `Embedding ${res.status}: ${(await res.text()).slice(0, 160)}`,
    );
  }
  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const emb = json.data?.[0]?.embedding;
  if (!emb?.length) throw new Error("Embedding vazio");
  return emb;
}

const tools = new GestorTools(prisma, { embed });

async function usuarioMcp(): Promise<UsuarioLogado> {
  const login = (process.env.GESTOR_MCP_LOGIN || "").trim().toLowerCase();
  const u = await prisma.usuario.findFirst({
    where: {
      ativo: true,
      perfil: { in: ["administrador", "gestor"] },
      ...(login ? { login } : {}),
    },
    include: {
      setores: { include: { setor: { select: { nome: true } } } },
      marcas: { include: { marca: { select: { nome: true } } } },
      permissoes: true,
    },
    orderBy: { criadoEm: "asc" },
  });
  if (!u) {
    throw new Error(
      "Nenhum usuário administrador/gestor ativo para o MCP. Crie um ou defina GESTOR_MCP_LOGIN.",
    );
  }
  return usuarioGestorDe(u);
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const server = new Server(
  { name: "sac-aisa-gestor", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: GESTOR_TOOL_DEFS.map((d) => ({
    name: d.function.name,
    description: d.function.description,
    inputSchema: d.function.parameters,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments || {}) as Record<string, unknown>;
  try {
    const usuario = await usuarioMcp();
    const resultado = await tools.execute(name, args, usuario);
    return jsonResult(resultado);
  } catch (e) {
    return jsonResult({
      erro: e instanceof Error ? e.message : String(e),
    });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
