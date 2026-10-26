/** Tipos e funções puras da tela de usuários (admin). A senha nunca volta da API. */

export type PerfilId =
  | "administrador"
  | "gestor"
  | "operacao"
  | "responsavel_setor";

export interface UsuarioAdmin {
  id: string;
  login: string;
  nome: string;
  perfil: PerfilId;
  ativo: boolean;
  telefone: string | null;
  setores: { id: string; nome: string }[];
  marcas: { id: string; nome: string }[];
}

export interface OpcoesUsuarios {
  perfis: { valor: PerfilId; rotulo: string }[];
  setores: { id: string; nome: string }[];
  marcas: { id: string; nome: string }[];
}

export interface PainelUsuarios {
  usuarios: UsuarioAdmin[];
  opcoes: OpcoesUsuarios;
}

export interface RascunhoUsuario {
  login: string;
  nome: string;
  perfil: PerfilId;
  ativo: boolean;
  telefone: string;
  /** Na criação é obrigatória; na edição, vazia = manter. Nunca é preenchida com valor salvo. */
  senha: string;
  setorIds: string[];
  marcaIds: string[];
}

export const rascunhoNovo = (): RascunhoUsuario => ({
  login: "",
  nome: "",
  perfil: "operacao",
  ativo: true,
  telefone: "",
  senha: "",
  setorIds: [],
  marcaIds: [],
});

export const rascunhoDe = (u: UsuarioAdmin): RascunhoUsuario => ({
  login: u.login,
  nome: u.nome,
  perfil: u.perfil,
  ativo: u.ativo,
  telefone: u.telefone ?? "",
  senha: "",
  setorIds: u.setores.map((s) => s.id),
  marcaIds: u.marcas.map((m) => m.id),
});

/** Setores e marcas só valem para o responsável de setor. */
export const usaSetoresEMarcas = (p: PerfilId) => p === "responsavel_setor";

/** Mensagem de erro de tela antes de chamar a API; null quando está tudo certo. */
export function validarRascunho(
  r: RascunhoUsuario,
  modo: "criar" | "editar",
): string | null {
  if (modo === "criar" && !r.login.trim()) return "Informe o login.";
  if (!r.nome.trim()) return "Informe o nome.";
  if (modo === "criar" && !r.senha) return "Informe a senha inicial.";
  if (r.perfil === "responsavel_setor" && r.setorIds.length === 0) {
    return "Escolha ao menos um setor para o responsável de setor.";
  }
  return null;
}

/** Corpo do POST (criar) ou do PATCH (editar). Senha vazia na edição não é enviada. */
export function montarCorpo(r: RascunhoUsuario, modo: "criar" | "editar") {
  const resp = usaSetoresEMarcas(r.perfil);
  const corpo: Record<string, unknown> = {
    nome: r.nome.trim(),
    perfil: r.perfil,
    telefone: r.telefone.trim(),
    setorIds: resp ? r.setorIds : [],
    marcaIds: resp ? r.marcaIds : [],
  };
  if (modo === "criar") {
    corpo.login = r.login.trim().toLowerCase();
    corpo.senha = r.senha;
  } else {
    corpo.ativo = r.ativo;
    if (r.senha) corpo.senha = r.senha;
  }
  return corpo;
}

export function mensagemUsuarios(status: number, mensagem?: string): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Só o administrador pode gerir usuários.";
  if (status === 405) {
    return "A gravação não chegou ao servidor. Atualize a página e tente de novo.";
  }
  if (status === 502) return "Serviço indisponível no momento.";
  return mensagem || "Não foi possível concluir. Tente de novo.";
}

/** A API às vezes devolve a mensagem como texto e às vezes como lista. */
export function textoDaResposta(
  dados: Record<string, unknown>,
): string | undefined {
  const m = dados.message;
  if (typeof m === "string" && m.trim()) return m;
  if (Array.isArray(m)) {
    const partes = m.filter(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
    if (partes.length > 0) return partes.join(" ");
  }
  return undefined;
}
