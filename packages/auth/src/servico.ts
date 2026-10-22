import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import {
  hashSenha,
  hashToken,
  LimiteTentativas,
  novoToken,
  SESSAO_DURACAO_MS,
  verificarSenha,
} from "./seguranca";

export interface UsuarioRegistro {
  id: string;
  login: string;
  nome: string;
  perfil: Perfil;
  senhaHash: string;
  ativo: boolean;
  setores: string[];
  /** Marcas que o responsável de setor enxerga (nomes). Vazia = todas. */
  marcas?: string[];
  permissoes: { chave: string; permitido: boolean }[];
}

export interface SessaoRegistro {
  /** Hash do token, nunca o token. */
  id: string;
  usuarioId: string;
  expiraEm: Date;
}

export interface RepositorioAuth {
  buscarUsuarioPorLogin(login: string): Promise<UsuarioRegistro | null>;
  buscarUsuarioPorId(id: string): Promise<UsuarioRegistro | null>;
  criarSessao(sessao: SessaoRegistro): Promise<void>;
  buscarSessao(id: string): Promise<SessaoRegistro | null>;
  apagarSessao(id: string): Promise<void>;
}

export interface UsuarioLogado {
  id: string;
  login: string;
  nome: string;
  perfil: Perfil;
  setores: string[];
  marcas?: string[];
  permissoes: string[];
}

export class ErroAuth extends Error {
  constructor(
    readonly codigo: "credenciais" | "bloqueado",
    mensagem: string,
    readonly esperarSegundos?: number,
  ) {
    super(mensagem);
    this.name = "ErroAuth";
  }
}

let hashParaTempoIgual: Promise<string> | null = null;

/** Usado quando o usuário não existe, para o tempo de resposta não revelar isso. */
function hashFalso(): Promise<string> {
  hashParaTempoIgual ??= hashSenha("senha-inexistente-para-igualar-o-tempo");
  return hashParaTempoIgual;
}

function paraLogado(u: UsuarioRegistro): UsuarioLogado {
  return {
    id: u.id,
    login: u.login,
    nome: u.nome,
    perfil: u.perfil,
    setores: u.setores,
    marcas: u.marcas ?? [],
    permissoes: mesclarPermissoes(u.perfil, u.permissoes),
  };
}

export class ServicoAuth {
  constructor(
    private readonly repo: RepositorioAuth,
    private readonly limite: LimiteTentativas = new LimiteTentativas(),
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async entrar(loginBruto: string, senha: string, ip: string) {
    const login = loginBruto.trim().toLowerCase();
    const chaves = [`ip:${ip}`, `login:${login}`];

    for (const chave of chaves) {
      const espera = this.limite.segundosBloqueado(chave);
      if (espera !== null) {
        throw new ErroAuth(
          "bloqueado",
          "Muitas tentativas. Tente de novo em alguns minutos.",
          espera,
        );
      }
    }

    const usuario = await this.repo.buscarUsuarioPorLogin(login);
    const hash = usuario?.senhaHash ?? (await hashFalso());
    const confere = await verificarSenha(senha, hash);

    if (!usuario || !usuario.ativo || !confere) {
      for (const chave of chaves) this.limite.registrarFalha(chave);
      throw new ErroAuth("credenciais", "Usuário ou senha inválidos.");
    }

    this.limite.limpar(`login:${login}`);
    const token = novoToken();
    const expiraEm = new Date(this.agora().getTime() + SESSAO_DURACAO_MS);
    await this.repo.criarSessao({
      id: hashToken(token),
      usuarioId: usuario.id,
      expiraEm,
    });
    return { token, expiraEm, usuario: paraLogado(usuario) };
  }

  /** Devolve o usuário da sessão, ou null se o token não vale mais. */
  async validar(
    token: string | null | undefined,
  ): Promise<UsuarioLogado | null> {
    if (!token) return null;
    const id = hashToken(token);
    const sessao = await this.repo.buscarSessao(id);
    if (!sessao) return null;
    if (sessao.expiraEm.getTime() <= this.agora().getTime()) {
      await this.repo.apagarSessao(id);
      return null;
    }
    const usuario = await this.repo.buscarUsuarioPorId(sessao.usuarioId);
    if (!usuario || !usuario.ativo) {
      await this.repo.apagarSessao(id);
      return null;
    }
    return paraLogado(usuario);
  }

  async sair(token: string | null | undefined): Promise<void> {
    if (token) await this.repo.apagarSessao(hashToken(token));
  }
}
