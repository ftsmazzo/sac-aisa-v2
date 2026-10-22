export type Perfil =
  | "administrador"
  | "gestor"
  | "operacao"
  | "responsavel_setor";

/** Telas e ações do sistema. Chave = tela.acao */
export const PERMISSOES_CATALOGO = [
  { chave: "reclamacoes.ver", tela: "Reclamações", acao: "Ver" },
  { chave: "reclamacoes.criar", tela: "Reclamações", acao: "Criar" },
  { chave: "reclamacoes.editar", tela: "Reclamações", acao: "Editar" },
  {
    chave: "reclamacoes.trocar_setor",
    tela: "Reclamações",
    acao: "Trocar setor responsável",
  },
  {
    chave: "reclamacoes.analisar",
    tela: "Reclamações",
    acao: "Registrar análise do setor",
  },
  { chave: "capturas.ver", tela: "Rascunhos dos canais", acao: "Ver" },
  {
    chave: "capturas.tratar",
    tela: "Rascunhos dos canais",
    acao: "Aceitar ou descartar",
  },
  { chave: "painel.ver", tela: "Painel", acao: "Ver" },
  { chave: "planos.ver", tela: "Planos de ação", acao: "Ver" },
  { chave: "planos.gerir", tela: "Planos de ação", acao: "Criar e editar" },
  { chave: "alertas.ver", tela: "Alertas", acao: "Ver" },
  { chave: "alertas.gerir", tela: "Alertas", acao: "Gerir" },
  {
    chave: "cadastros.gerir",
    tela: "Cadastros",
    acao: "Setores, bancadas, causas, marcas",
  },
  {
    chave: "usuarios.gerir",
    tela: "Usuários",
    acao: "Criar, editar e permissões",
  },
  { chave: "integracoes.gerir", tela: "Integrações", acao: "ClickUp e canais" },
  {
    chave: "dados.importar",
    tela: "Dados",
    acao: "Importar backup do sistema antigo",
  },
] as const;

export type PermissaoChave = (typeof PERMISSOES_CATALOGO)[number]["chave"];

const TODAS: PermissaoChave[] = PERMISSOES_CATALOGO.map((p) => p.chave);

const OPERACAO: PermissaoChave[] = [
  "reclamacoes.ver",
  "reclamacoes.criar",
  "reclamacoes.editar",
  "capturas.ver",
  "capturas.tratar",
  "alertas.ver",
];

const RESPONSAVEL_SETOR: PermissaoChave[] = [
  "reclamacoes.ver",
  "reclamacoes.editar",
  "reclamacoes.analisar",
  "planos.ver",
  "planos.gerir",
  "alertas.ver",
];

const GESTOR: PermissaoChave[] = [
  "reclamacoes.ver",
  "reclamacoes.criar",
  "reclamacoes.editar",
  "reclamacoes.trocar_setor",
  "reclamacoes.analisar",
  "capturas.ver",
  "capturas.tratar",
  "painel.ver",
  "planos.ver",
  "planos.gerir",
  "alertas.ver",
  "alertas.gerir",
];

export const PERMISSOES_PADRAO: Record<Perfil, PermissaoChave[]> = {
  administrador: TODAS,
  gestor: GESTOR,
  operacao: OPERACAO,
  responsavel_setor: RESPONSAVEL_SETOR,
};

/**
 * Perfis que enxergam todos os setores. Só o responsável de setor fica restrito
 * ao(s) seu(s) setor(es); a operação registra reclamação de qualquer setor.
 */
export const PERFIS_TODOS_OS_SETORES: readonly Perfil[] = [
  "administrador",
  "gestor",
  "operacao",
];

export function veTodosOsSetores(perfil: Perfil): boolean {
  return PERFIS_TODOS_OS_SETORES.includes(perfil);
}

export function mesclarPermissoes(
  perfil: Perfil,
  overrides: { chave: string; permitido: boolean }[],
): string[] {
  if (perfil === "administrador") return [...TODAS];
  const base = new Set<string>(PERMISSOES_PADRAO[perfil]);
  for (const o of overrides) {
    if (o.permitido) base.add(o.chave);
    else base.delete(o.chave);
  }
  return [...base];
}

export function temPermissao(
  lista: string[] | undefined | null,
  chave: string,
): boolean {
  return !!lista?.includes(chave);
}

/** Responsável de setor só acessa reclamação de um setor que lhe pertence. */
export function podeVerSetor(
  perfil: Perfil,
  setoresDoUsuario: string[],
  setorDaReclamacao: string,
): boolean {
  return (
    veTodosOsSetores(perfil) || setoresDoUsuario.includes(setorDaReclamacao)
  );
}
