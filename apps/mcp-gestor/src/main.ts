/**
 * MCP stdio do agente gestor (só leitura).
 *
 * Uso (Cursor mcp.json):
 *   command: npx
 *   args: ["tsx", "apps/mcp-gestor/src/main.ts"]
 *   env: DATABASE_URL, e opcionalmente GESTOR_MCP_LOGIN
 *
 * O usuário das tools é o administrador/gestor ativo (ou o login em GESTOR_MCP_LOGIN).
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
const tools = new GestorTools(prisma);

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
