import type { PrismaClient } from "@prisma/client";
import type {
  RepositorioAuth,
  SessaoRegistro,
  UsuarioRegistro,
} from "@sac-aisa/auth";

const INCLUIR = {
  setores: { include: { setor: true } },
  marcas: { include: { marca: true } },
  permissoes: true,
} as const;

/** Consultas parametrizadas pelo Prisma. Nenhum SQL montado à mão. */
export class RepositorioPrisma implements RepositorioAuth {
  constructor(private readonly prisma: PrismaClient) {}

  private paraRegistro(u: {
    id: string;
    login: string;
    nome: string;
    perfil: UsuarioRegistro["perfil"];
    senhaHash: string;
    ativo: boolean;
    modoTreino: boolean;
    setores: { setor: { nome: string } }[];
    marcas: { marca: { nome: string } }[];
    permissoes: { chave: string; permitido: boolean }[];
  }): UsuarioRegistro {
    return {
      id: u.id,
      login: u.login,
      nome: u.nome,
      perfil: u.perfil,
      senhaHash: u.senhaHash,
      ativo: u.ativo,
      modoTreino: u.modoTreino,
      setores: u.setores.map((s) => s.setor.nome),
      marcas: u.marcas.map((m) => m.marca.nome),
      permissoes: u.permissoes.map((p) => ({
        chave: p.chave,
        permitido: p.permitido,
      })),
    };
  }

  async buscarUsuarioPorLogin(login: string) {
    const u = await this.prisma.usuario.findUnique({
      where: { login },
      include: INCLUIR,
    });
    return u ? this.paraRegistro(u) : null;
  }

  async buscarUsuarioPorId(id: string) {
    const u = await this.prisma.usuario.findUnique({
      where: { id },
      include: INCLUIR,
    });
    return u ? this.paraRegistro(u) : null;
  }

  async criarSessao(sessao: SessaoRegistro) {
    await this.prisma.sessao.create({
      data: {
        id: sessao.id,
        usuarioId: sessao.usuarioId,
        expiraEm: sessao.expiraEm,
      },
    });
  }

  async buscarSessao(id: string) {
    const s = await this.prisma.sessao.findUnique({ where: { id } });
    return s
      ? { id: s.id, usuarioId: s.usuarioId, expiraEm: s.expiraEm }
      : null;
  }

  async apagarSessao(id: string) {
    await this.prisma.sessao.deleteMany({ where: { id } });
  }
}
