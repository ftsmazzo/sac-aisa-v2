"use server";

import { cookies } from "next/headers";
import { urlDaApi } from "@/lib/sessao";

export type ResultadoSalvar =
  | { ok: true; id: string; numero: number }
  | { ok: false; status: number; mensagem: string };

const MENSAGEM_POR_STATUS: Record<number, string> = {
  401: "Sua sessão terminou. Entre de novo.",
  403: "Você não tem permissão para esta ação.",
  404: "A reclamação não existe ou não é do seu setor.",
};

const MENSAGEM_GENERICA =
  "Não foi possível salvar agora. Tente de novo em instantes.";

/**
 * Grava pela API repassando o cookie da pessoa. Quem decide permissão, escopo, causa e
 * setor é a API; esta função só leva o corpo e traduz o erro. Só no servidor.
 */
export async function salvarReclamacao(
  id: string | null,
  corpo: Record<string, unknown>,
): Promise<ResultadoSalvar> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) {
    return { ok: false, status: 401, mensagem: MENSAGEM_POR_STATUS[401] };
  }
  try {
    const r = await fetch(
      `${urlDaApi()}/reclamacoes${id ? `/${encodeURIComponent(id)}` : ""}`,
      {
        method: id ? "PATCH" : "POST",
        headers: {
          cookie: `sac_sessao=${encodeURIComponent(token)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(corpo),
        cache: "no-store",
      },
    );
    const dados = (await r.json().catch(() => ({}))) as {
      id?: string;
      numero?: number;
      message?: string;
    };
    if (r.ok && dados.id && typeof dados.numero === "number") {
      return { ok: true, id: dados.id, numero: dados.numero };
    }
    return {
      ok: false,
      status: r.status,
      mensagem:
        r.status === 400 && dados.message
          ? dados.message
          : (MENSAGEM_POR_STATUS[r.status] ?? MENSAGEM_GENERICA),
    };
  } catch {
    return { ok: false, status: 502, mensagem: MENSAGEM_GENERICA };
  }
}
