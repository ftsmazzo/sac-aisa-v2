import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { type PedidoComUsuario, Requer } from "../auth.guard";
import { ServicoIntegracoes } from "../integracoes";
import { ConhecimentoService } from "../whatsapp/conhecimento.service";
import { ServicoIaAdmin } from "./admin";
import { ErroIa, ServicoIa } from "./ia";
import { ProvedorOpenRouter } from "./provedor";
import { RepositorioIaPrisma } from "./repositorio";

/** Chave e configuração do cartão OpenRouter de /admin/integracoes. */
export function fonteOpenRouter(integr: ServicoIntegracoes) {
  return {
    chave: () => integr.segredo("openrouter", "chaveApi"),
    config: () => integr.config("openrouter"),
  };
}

export function criarServicoIa(
  prisma: PrismaClient,
  integr: ServicoIntegracoes,
) {
  return new ServicoIa(
    new RepositorioIaPrisma(prisma),
    fonteOpenRouter(integr),
    (chave) =>
      new ProvedorOpenRouter(
        chave,
        undefined,
        process.env.PUBLIC_API_URL || "https://sac-aisa.local",
      ),
    process.env,
  );
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

async function comErros<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (!(e instanceof ErroIa)) throw e;
    if (e.status === 403) throw new ForbiddenException(e.message);
    if (e.status === 404) throw new NotFoundException(e.message);
    throw new BadRequestException(e.message);
  }
}

function idValido(id: string) {
  if (!ID.test(id)) throw new NotFoundException("Reclamação não encontrada.");
  return id;
}

const aceiteSchema = z
  .object({
    registroId: z.string().regex(ID),
    aceite: z.enum(["aceita", "alterada", "recusada"]),
    causaId: z.string().max(40).optional(),
    textoFinal: z.string().max(3000).optional(),
  })
  .strict();

const respostaSchema = z
  .object({
    chave: z.string().max(60),
    valor: z.string().max(1000).optional(),
    dispensada: z.boolean().optional(),
    motivo: z.string().max(300).optional(),
    origem: z.enum(["atendente", "ia_confirmada"]).optional(),
  })
  .strict();

function ler<S extends z.ZodTypeAny>(esquema: S, corpo: unknown): z.output<S> {
  const r = esquema.safeParse(corpo);
  if (!r.success) throw new BadRequestException("Corpo inválido.");
  return r.data;
}

/** A IA propõe; nada aqui grava causa, setor ou estado. Cada rota confere a permissão no serviço. */
@Controller("reclamacoes")
export class ControladorIa {
  private readonly servico: ServicoIa;

  constructor(
    @Inject(PrismaClient) prisma: PrismaClient,
    @Inject(ServicoIntegracoes) integr: ServicoIntegracoes,
  ) {
    this.servico = criarServicoIa(prisma, integr);
  }

  @Requer("ia.usar")
  @Get(":id/ia")
  painel(
    @Param("id") id: string,
    @Query("causaId") causaId: string | undefined,
    @Req() req: PedidoComUsuario,
  ) {
    return comErros(() =>
      this.servico.painel(
        usuarioDe(req),
        idValido(id),
        typeof causaId === "string" && causaId.length <= 40
          ? causaId
          : undefined,
      ),
    );
  }

  @Requer("ia.usar")
  @Post(":id/ia/analisar")
  @HttpCode(200)
  analisar(@Param("id") id: string, @Req() req: PedidoComUsuario) {
    return comErros(() => this.servico.analisar(usuarioDe(req), idValido(id)));
  }

  @Requer("ia.usar")
  @Post(":id/ia/resposta")
  @HttpCode(200)
  sugerir(@Param("id") id: string, @Req() req: PedidoComUsuario) {
    return comErros(() =>
      this.servico.sugerirResposta(usuarioDe(req), idValido(id)),
    );
  }

  @Requer("ia.usar")
  @Post(":id/ia/pergunta")
  @HttpCode(200)
  pergunta(@Param("id") id: string, @Req() req: PedidoComUsuario) {
    return comErros(() =>
      this.servico.novaPergunta(usuarioDe(req), idValido(id)),
    );
  }

  @Requer("ia.usar")
  @Post(":id/ia/aceite")
  @HttpCode(200)
  async aceite(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    const e = ler(aceiteSchema, corpo);
    await comErros(() => this.servico.aceite(usuarioDe(req), idValido(id), e));
    return { ok: true };
  }

  @Requer("reclamacoes.editar")
  @Post(":id/ia/respostas")
  @HttpCode(200)
  async resposta(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    const e = ler(respostaSchema, corpo);
    await comErros(() =>
      this.servico.responder(usuarioDe(req), idValido(id), e),
    );
    return { ok: true };
  }
}

/** Perfil da empresa e perguntas obrigatórias: só administrador e gestor, e cada mudança é auditada. */
@Controller("admin/ia")
export class ControladorIaAdmin {
  private readonly admin: ServicoIaAdmin;
  private readonly servico: ServicoIa;

  constructor(
    @Inject(PrismaClient) prisma: PrismaClient,
    @Inject(ServicoIntegracoes) integr: ServicoIntegracoes,
  ) {
    this.admin = new ServicoIaAdmin(new RepositorioIaPrisma(prisma));
    this.servico = criarServicoIa(prisma, integr);
  }

  @Requer("ia.gerir")
  @Get("perfil")
  perfil(@Req() req: PedidoComUsuario) {
    return comErros(() => this.admin.perfil(usuarioDe(req)));
  }

  @Requer("ia.gerir")
  @Post("perfil")
  @HttpCode(200)
  publicarPerfil(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    return comErros(() => this.admin.publicarPerfil(usuarioDe(req), corpo));
  }

  @Requer("ia.gerir")
  @Get("perguntas")
  perguntas(@Req() req: PedidoComUsuario) {
    return comErros(() => this.admin.perguntas(usuarioDe(req)));
  }

  @Requer("ia.gerir")
  @Post("perguntas")
  @HttpCode(200)
  salvarPergunta(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    return comErros(() => this.admin.salvarPergunta(usuarioDe(req), corpo));
  }

  @Requer("ia.gerir")
  @Post("perguntas/simular")
  @HttpCode(200)
  simular(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    return comErros(() => this.admin.simular(usuarioDe(req), corpo));
  }

  @Requer("integracoes.gerir")
  @Get("qualidade")
  qualidade(@Req() req: PedidoComUsuario) {
    return comErros(() => this.servico.qualidade(usuarioDe(req)));
  }

  /** Consumo do dia, para o cartão do OpenRouter em /admin/integracoes. */
  @Requer("integracoes.gerir")
  @Get("consumo")
  consumo(@Req() req: PedidoComUsuario) {
    return comErros(() => this.servico.consumoDoDia(usuarioDe(req)));
  }
}

/** RAG do agente gestor: sincronizar fontes curadas e importar URL allowlist. */
@Controller("admin/ia/conhecimento")
export class ControladorConhecimento {
  constructor(
    @Inject(ConhecimentoService)
    private readonly conhecimento: ConhecimentoService,
  ) {}

  @Requer("ia.gerir")
  @Get()
  resumo(@Req() req: PedidoComUsuario) {
    void usuarioDe(req);
    return this.conhecimento.resumo();
  }

  @Requer("ia.gerir")
  @Post("sincronizar")
  @HttpCode(200)
  sincronizar(@Req() req: PedidoComUsuario) {
    void usuarioDe(req);
    return this.conhecimento.sincronizar();
  }

  @Requer("ia.gerir")
  @Post("importar-url")
  @HttpCode(200)
  async importarUrl(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    void usuarioDe(req);
    const url =
      typeof corpo === "object" &&
      corpo &&
      "url" in corpo &&
      typeof (corpo as { url: unknown }).url === "string"
        ? (corpo as { url: string }).url
        : "";
    return this.conhecimento.importarUrl(url);
  }
}
