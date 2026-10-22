import type { UsuarioLogado } from "@sac-aisa/auth";
import { validarSenhaNova } from "@sac-aisa/auth";
import { type Perfil, temPermissao } from "@sac-aisa/domain";

export const PERFIS: readonly Perfil[] = [
  "administrador",
  "gestor",
  "operacao",
  "responsavel_setor",
];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  operacao: "SAC (operação)",
  responsavel_setor: "Responsável de setor",
};

export class ErroUsuario extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface UsuarioVisao {
  id: string;
  login: string;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
  telefone: string;
  setores: { id: string; nome: string }[];
  marcas: { id: string; nome: string }[];
}

export interface OpcoesUsuario {
  perfis: { valor: Perfil; rotulo: string }[];
  setores: { id: string; nome: string }[];
  marcas: { id: string; nome: string }[];
}

export interface EntradaUsuario {
  login?: string;
  nome?: string;
  perfil?: Perfil;
  ativo?: boolean;
  telefone?: string;
  /** Só na criação ou na troca de senha. Nunca volta em resposta nem vai para a auditoria. */
  senha?: string;
  setorIds?: string[];
  marcaIds?: string[];
}

const CAMPOS = [
  "login",
  "nome",
  "perfil",
  "ativo",
  "telefone",
  "senha",
  "setorIds",
  "marcaIds",
] as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LOGIN = /^[a-z0-9._-]{3,40}$/;

function ids(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 50) return null;
  if (!v.every((x) => typeof x === "string" && ID.test(x))) return null;
  return [...new Set(v as string[])];
}

export function lerEntradaUsuario(
  corpo: unknown,
  modo: "criar" | "editar",
): { ok: true; entrada: EntradaUsuario } | { ok: false; mensagem: string } {
  const erro = (mensagem: string) => ({ ok: false as const, mensagem });
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return erro("Corpo inválido.");
  }
  const c = corpo as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (!(CAMPOS as readonly string[]).includes(k)) {
      return erro(`Campo não aceito: "${k}".`);
    }
  }
  const e: EntradaUsuario = {};
  if ("login" in c) {
    const v = typeof c.login === "string" ? c.login.trim().toLowerCase() : "";
    if (!LOGIN.test(v)) {
      return erro(
        "Login com 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.",
      );
    }
    e.login = v;
  }
  if ("nome" in c) {
    const v = typeof c.nome === "string" ? c.nome.trim() : "";
    if (v === "" || v.length > 120) {
      return erro("Informe o nome (até 120 letras).");
    }
    e.nome = v;
  }
  if ("perfil" in c) {
    if (!PERFIS.includes(c.perfil as Perfil)) return erro("Perfil inválido.");
    e.perfil = c.perfil as Perfil;
  }
  if ("ativo" in c) {
    if (typeof c.ativo !== "boolean") return erro('Valor inválido em "ativo".');
    e.ativo = c.ativo;
  }
  if ("telefone" in c) {
    const v = typeof c.telefone === "string" ? c.telefone.trim() : null;
    if (v === null || v.length > 30) return erro("Telefone inválido.");
    e.telefone = v;
  }
  if ("senha" in c) {
    if (typeof c.senha !== "string" || c.senha === "") {
      return erro("Informe a senha.");
    }
    e.senha = c.senha;
  }
  for (const campo of ["setorIds", "marcaIds"] as const) {
    if (!(campo in c)) continue;
    const l = ids(c[campo]);
    if (!l) return erro(`Lista inválida em "${campo}".`);
    e[campo] = l;
  }
  if (modo === "criar") {
    if (e.login === undefined) return erro("Informe o login.");
    if (e.nome === undefined) return erro("Informe o nome.");
    if (e.perfil === undefined) return erro("Informe o perfil.");
    if (e.senha === undefined) return erro("Informe a senha.");
  } else if (Object.keys(e).length === 0) {
    return erro("Nenhuma alteração enviada.");
  }
  return { ok: true, entrada: e };
}

export interface AuditoriaUsuario {
  usuarioId: string;
  usuarioNome: string;
  acao: "usuario.criar" | "usuario.editar";
  alvo: string;
  detalhe: string;
  extra: { campos: string[] };
}

export interface RepositorioUsuarios {
  listar(): Promise<UsuarioVisao[]>;
  obter(id: string): Promise<UsuarioVisao | null>;
  opcoes(): Promise<{
    setores: { id: string; nome: string }[];
    marcas: { id: string; nome: string }[];
  }>;
  loginExiste(login: string): Promise<boolean>;
  /** Quantos dos ids existem de fato. */
  contarExistentes(tipo: "setores" | "marcas", ids: string[]): Promise<number>;
  criar(args: {
    login: string;
    nome: string;
    perfil: Perfil;
    senhaHash: string;
    telefone: string;
    setorIds: string[];
    marcaIds: string[];
    criadoPorId: string;
    auditoria: AuditoriaUsuario;
  }): Promise<{ id: string }>;
  atualizar(args: {
    id: string;
    dados: {
      nome?: string;
      perfil?: Perfil;
      ativo?: boolean;
      telefone?: string;
      senhaHash?: string;
    };
    setorIds?: string[];
    marcaIds?: string[];
    /** Troca de senha e desativação encerram as sessões abertas. Setor, marca e perfil valem já na próxima chamada. */
    encerrarSessoes: boolean;
    auditoria: AuditoriaUsuario;
  }): Promise<void>;
}

/** Só o administrador mexe em usuário; o perfil e a permissão são conferidos juntos. */
function exigirAdministrador(u: UsuarioLogado) {
  if (
    u.perfil !== "administrador" ||
    !temPermissao(u.permissoes, "usuarios.gerir")
  ) {
    throw new ErroUsuario(403, "Sem permissão para esta ação.");
  }
}

export type Hash = (senha: string) => Promise<string>;

export class ServicoUsuarios {
  constructor(
    private readonly repo: RepositorioUsuarios,
    private readonly hash: Hash,
  ) {}

  async listar(u: UsuarioLogado): Promise<{
    usuarios: UsuarioVisao[];
    opcoes: OpcoesUsuario;
  }> {
    exigirAdministrador(u);
    const [usuarios, o] = await Promise.all([
      this.repo.listar(),
      this.repo.opcoes(),
    ]);
    return {
      usuarios,
      opcoes: {
        perfis: PERFIS.map((valor) => ({
          valor,
          rotulo: ROTULO_PERFIL[valor],
        })),
        ...o,
      },
    };
  }

  private async conferirVinculos(
    perfil: Perfil,
    setorIds: string[],
    marcaIds: string[],
  ) {
    if (perfil === "responsavel_setor" && setorIds.length === 0) {
      throw new ErroUsuario(
        400,
        "O responsável de setor precisa de ao menos um setor: sem setor ele não vê nada.",
      );
    }
    if (
      setorIds.length &&
      (await this.repo.contarExistentes("setores", setorIds)) !==
        setorIds.length
    ) {
      throw new ErroUsuario(400, "Setor inexistente.");
    }
    if (
      marcaIds.length &&
      (await this.repo.contarExistentes("marcas", marcaIds)) !== marcaIds.length
    ) {
      throw new ErroUsuario(400, "Marca inexistente.");
    }
  }

  async criar(u: UsuarioLogado, e: EntradaUsuario) {
    exigirAdministrador(u);
    const login = e.login as string;
    const perfil = e.perfil as Perfil;
    const problema = validarSenhaNova(e.senha as string, login);
    if (problema) throw new ErroUsuario(400, problema);
    if (await this.repo.loginExiste(login)) {
      throw new ErroUsuario(400, "Esse login já existe.");
    }
    const setorIds = e.setorIds ?? [];
    const marcaIds = e.marcaIds ?? [];
    await this.conferirVinculos(perfil, setorIds, marcaIds);
    const r = await this.repo.criar({
      login,
      nome: e.nome as string,
      perfil,
      senhaHash: await this.hash(e.senha as string),
      telefone: e.telefone ?? "",
      setorIds,
      marcaIds,
      criadoPorId: u.id,
      auditoria: {
        usuarioId: u.id,
        usuarioNome: u.nome,
        acao: "usuario.criar",
        alvo: `Usuário ${login}`,
        detalhe: `Usuário criado com perfil ${ROTULO_PERFIL[perfil]}.`,
        extra: { campos: ["login", "nome", "perfil", "setores", "marcas"] },
      },
    });
    return { id: r.id };
  }

  async editar(u: UsuarioLogado, id: string, e: EntradaUsuario) {
    exigirAdministrador(u);
    if (e.login !== undefined) {
      throw new ErroUsuario(400, "O login não muda depois de criado.");
    }
    const atual = await this.repo.obter(id);
    if (!atual) throw new ErroUsuario(404, "Usuário não encontrado.");
    // Quem administra não tira o próprio acesso por engano.
    if (
      id === u.id &&
      ((e.ativo !== undefined && !e.ativo) ||
        (e.perfil !== undefined && e.perfil !== "administrador"))
    ) {
      throw new ErroUsuario(
        400,
        "Você não pode desativar nem rebaixar a própria conta.",
      );
    }

    const perfil = e.perfil ?? atual.perfil;
    const setorIds = e.setorIds ?? atual.setores.map((s) => s.id);
    const marcaIds = e.marcaIds ?? atual.marcas.map((m) => m.id);
    await this.conferirVinculos(perfil, setorIds, marcaIds);

    const dados: Parameters<RepositorioUsuarios["atualizar"]>[0]["dados"] = {};
    const campos: string[] = [];
    if (e.nome !== undefined && e.nome !== atual.nome) {
      dados.nome = e.nome;
      campos.push("nome");
    }
    if (e.perfil !== undefined && e.perfil !== atual.perfil) {
      dados.perfil = e.perfil;
      campos.push("perfil");
    }
    if (e.ativo !== undefined && e.ativo !== atual.ativo) {
      dados.ativo = e.ativo;
      campos.push("ativo");
    }
    if (e.telefone !== undefined && e.telefone !== atual.telefone) {
      dados.telefone = e.telefone;
      campos.push("telefone");
    }
    if (e.senha !== undefined) {
      const problema = validarSenhaNova(e.senha, atual.login);
      if (problema) throw new ErroUsuario(400, problema);
      dados.senhaHash = await this.hash(e.senha);
      campos.push("senha");
    }
    const mesmaLista = (a: string[], b: string[]) =>
      a.length === b.length && a.every((x) => b.includes(x));
    const mudouSetores =
      e.setorIds !== undefined &&
      !mesmaLista(
        e.setorIds,
        atual.setores.map((s) => s.id),
      );
    const mudouMarcas =
      e.marcaIds !== undefined &&
      !mesmaLista(
        e.marcaIds,
        atual.marcas.map((m) => m.id),
      );
    if (mudouSetores) campos.push("setores");
    if (mudouMarcas) campos.push("marcas");
    if (campos.length === 0) return { id, alterou: false };

    await this.repo.atualizar({
      id,
      dados,
      setorIds: mudouSetores ? setorIds : undefined,
      marcaIds: mudouMarcas ? marcaIds : undefined,
      encerrarSessoes: dados.senhaHash !== undefined || dados.ativo === false,
      auditoria: {
        usuarioId: u.id,
        usuarioNome: u.nome,
        acao: "usuario.editar",
        alvo: `Usuário ${atual.login}`,
        detalhe: `Campos alterados: ${campos.join(", ")}.`,
        extra: { campos },
      },
    });
    return { id, alterou: true };
  }
}
