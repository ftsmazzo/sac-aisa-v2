import { cookies } from "next/headers";

const COOKIE_SESSAO = "sac_sessao";

export interface UsuarioSessao {
  id: string;
  login: string;
  nome: string;
  perfil: "administrador" | "gestor" | "operacao" | "responsavel_setor";
  setores: string[];
  permissoes: string[];
}

export function urlDaApi(): string {
  return (process.env.API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

/** Pergunta à API quem está logado, repassando o cookie da pessoa. Só no servidor. */
export async function obterUsuario(): Promise<UsuarioSessao | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  try {
    const r = await fetch(`${urlDaApi()}/auth/me`, {
      headers: { cookie: `${COOKIE_SESSAO}=${encodeURIComponent(token)}` },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const corpo = (await r.json()) as { usuario?: UsuarioSessao };
    return corpo.usuario ?? null;
  } catch {
    return null;
  }
}
