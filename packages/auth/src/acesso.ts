import { temPermissao } from "@sac-aisa/domain";
import type { UsuarioLogado } from "./servico";

export interface PedidoAcesso {
  publico: boolean;
  usuario: UsuarioLogado | null;
  /** Permissões que a rota exige. Vazio = basta estar logado. */
  requeridas: string[];
  metodo: string;
  origem: string | null;
  origensPermitidas: string[];
}

export type DecisaoAcesso =
  | { ok: true }
  | { ok: false; status: 401 | 403; motivo: string };

const METODOS_SEGUROS = ["GET", "HEAD", "OPTIONS"];

/**
 * Regra única de acesso, usada pela API em toda rota. O padrão é negar:
 * só rota marcada como pública passa sem login.
 */
export function decidirAcesso(p: PedidoAcesso): DecisaoAcesso {
  const escreve = !METODOS_SEGUROS.includes(p.metodo.toUpperCase());
  if (escreve && p.origem && !p.origensPermitidas.includes(p.origem)) {
    return { ok: false, status: 403, motivo: "Origem não permitida." };
  }
  if (p.publico) return { ok: true };
  if (!p.usuario) {
    return { ok: false, status: 401, motivo: "Entre para continuar." };
  }
  const usuario = p.usuario;
  const faltando = p.requeridas.find(
    (c) => !temPermissao(usuario.permissoes, c),
  );
  if (faltando) {
    return { ok: false, status: 403, motivo: "Sem permissão para esta ação." };
  }
  return { ok: true };
}

/** Lê um cookie do cabeçalho `Cookie`, sem depender de biblioteca. */
export function lerCookie(
  cabecalho: string | undefined,
  nome: string,
): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) {
      const valor = parte.slice(i + 1).trim();
      try {
        return decodeURIComponent(valor);
      } catch {
        return null;
      }
    }
  }
  return null;
}
