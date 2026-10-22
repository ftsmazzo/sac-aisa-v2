import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { type Prisma, PrismaClient } from "@prisma/client";
import { hashSenha } from "@sac-aisa/auth";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import {
  type AuditoriaUsuario,
  ErroUsuario,
  lerEntradaUsuario,
  type RepositorioUsuarios,
  ServicoUsuarios,
  type UsuarioVisao,
} from "./usuarios";

const VISAO = {
  setores: { select: { setor: { select: { id: true, nome: true } } } },
  marcas: { select: { marca: { select: { id: true, nome: true } } } },
} as const;

function paraVisao(u: {
  id: string;
  login: string;
  nome: string;
  perfil: UsuarioVisao["perfil"];
  ativo: boolean;
  telefone: string | null;
  setores: { setor: { id: string; nome: string } }[];
  marcas: { marca: { id: string; nome: string } }[];
}): UsuarioVisao {
  return {
    id: u.id,
    login: u.login,
    nome: u.nome,
    perfil: u.perfil,
    ativo: u.ativo,
    telefone: u.telefone ?? "",
    setores: u.setores.map((s) => s.setor),
    marcas: u.marcas.map((m) => m.marca),
  };
}

function registroAuditoria(a: AuditoriaUsuario) {
  return {
    usuarioId: a.usuarioId,
    usuarioNome: a.usuarioNome,
    acao: a.acao,
    alvo: a.alvo,
    detalhe: a.detalhe,
    extra: a.extra as unknown as Prisma.InputJsonValue,
  };
}

/** Usuários pelo Prisma: o dado, os vínculos e a auditoria entram na mesma transação. */
export class RepositorioUsuariosPrisma implements RepositorioUsuarios {
  constructor(private readonly prisma: PrismaClient) {}

  async listar() {
    const l = await this.prisma.usuario.findMany({
      orderBy: { nome: "asc" },
      include: VISAO,
    });
    return l.map(paraVisao);
  }

  async obter(id: string) {
    const u = await this.prisma.usuario.findUnique({
      where: { id },
      include: VISAO,
    });
    return u ? paraVisao(u) : null;
  }

  async opcoes() {
    const [setores, marcas] = await Promise.all([
      this.prisma.setor.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      this.prisma.marca.findMany({
        where: { ativa: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
    ]);
    return { setores, marcas };
  }

  async loginExiste(login: string) {
    return (await this.prisma.usuario.count({ where: { login } })) > 0;
  }

  contarExistentes(tipo: "setores" | "marcas", ids: string[]) {
    return tipo === "setores"
      ? this.prisma.setor.count({ where: { id: { in: ids } } })
      : this.prisma.marca.count({ where: { id: { in: ids } } });
  }

  criar(args: Parameters<RepositorioUsuarios["criar"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.create({
        data: {
          login: args.login,
          nome: args.nome,
          perfil: args.perfil,
          senhaHash: args.senhaHash,
          telefone: args.telefone || null,
          criadoPorId: args.criadoPorId,
          setores: { create: args.setorIds.map((setorId) => ({ setorId })) },
          marcas: { create: args.marcaIds.map((marcaId) => ({ marcaId })) },
        },
        select: { id: true },
      });
      await tx.auditoria.create({ data: registroAuditoria(args.auditoria) });
      return u;
    });
  }

  async atualizar(args: Parameters<RepositorioUsuarios["atualizar"]>[0]) {
    await this.prisma.$transaction(async (tx) => {
      const { telefone, ...resto } = args.dados;
      await tx.usuario.update({
        where: { id: args.id },
        data: {
          ...resto,
          ...(telefone !== undefined ? { telefone: telefone || null } : {}),
        },
      });
      if (args.setorIds) {
        await tx.usuarioSetor.deleteMany({ where: { usuarioId: args.id } });
        await tx.usuarioSetor.createMany({
          data: args.setorIds.map((setorId) => ({
            usuarioId: args.id,
            setorId,
          })),
        });
      }
      if (args.marcaIds) {
        await tx.usuarioMarca.deleteMany({ where: { usuarioId: args.id } });
        await tx.usuarioMarca.createMany({
          data: args.marcaIds.map((marcaId) => ({
            usuarioId: args.id,
            marcaId,
          })),
        });
      }
      if (args.encerrarSessoes) {
        await tx.sessao.deleteMany({ where: { usuarioId: args.id } });
      }
      await tx.auditoria.create({ data: registroAuditoria(args.auditoria) });
    });
  }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Só o administrador. O serviço confere perfil e permissão de novo: quem decide é o servidor. */
@Controller("admin/usuarios")
export class ControladorUsuarios {
  private readonly servico: ServicoUsuarios;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoUsuarios(
      new RepositorioUsuariosPrisma(prisma),
      hashSenha,
    );
  }

  @Requer("usuarios.gerir")
  @Get()
  listar(@Req() req: PedidoComUsuario) {
    return this.comErros(() => this.servico.listar(this.quem(req)));
  }

  @Requer("usuarios.gerir")
  @Post()
  criar(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const r = lerEntradaUsuario(corpo, "criar");
    if (!r.ok) throw new BadRequestException(r.mensagem);
    return this.comErros(() => this.servico.criar(this.quem(req), r.entrada));
  }

  @Requer("usuarios.gerir")
  @Patch(":id")
  editar(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    if (!ID.test(id)) throw new NotFoundException("Usuário não encontrado.");
    const r = lerEntradaUsuario(corpo, "editar");
    if (!r.ok) throw new BadRequestException(r.mensagem);
    return this.comErros(() =>
      this.servico.editar(this.quem(req), id, r.entrada),
    );
  }

  private quem(req: PedidoComUsuario) {
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    return req.usuario;
  }

  private async comErros<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (!(e instanceof ErroUsuario)) throw e;
      if (e.status === 403) throw new ForbiddenException(e.message);
      if (e.status === 404) throw new NotFoundException(e.message);
      throw new BadRequestException(e.message);
    }
  }
}
