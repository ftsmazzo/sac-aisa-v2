"use server";

import { cookies } from "next/headers";
import type { VisaoIa } from "@/lib/ia";
import { urlDaApi } from "@/lib/sessao";

export type ResultadoIa<T> =
  | { ok: true; dados: T }
  | { ok: false; status: number; mensagem: string };

const POR_STATUS: Record<number, string> = {
  401: "Sua sessão terminou. Entre de novo.",
  403: "Você não tem permissão para esta ação.",
  404: "A reclamação não existe ou não é do seu setor.",
};
const GENERICA =
  "Não foi possível agora. Siga pelo formulário normal e tente de novo depois.";

/** Repassa o cookie da pessoa. Quem decide permissão e escopo é a API; aqui só se leva o pedido. */
async function chamar<T>(
  id: string,
  caminho: string,
  metodo: "GET" | "POST",
  corpo?: Record<string, unknown>,
): Promise<ResultadoIa<T>> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) return { ok: false, status: 401, mensagem: POR_STATUS[401] };
  try {
    const r = await fetch(
      `${urlDaApi()}/reclamacoes/${encodeURIComponent(id)}/ia${caminho}`,
      {
        method: metodo,
        headers: {
          cookie: `sac_sessao=${encodeURIComponent(token)}`,
          ...(corpo ? { "content-type": "application/json" } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        cache: "no-store",
      },
    );
    const dados = (await r.json().catch(() => ({}))) as {
      message?: string;
    } & Record<string, unknown>;
    if (r.ok) return { ok: true, dados: dados as T };
    return {
      ok: false,
      status: r.status,
      mensagem:
        r.status === 400 && typeof dados.message === "string"
          ? dados.message
          : (POR_STATUS[r.status] ?? GENERICA),
    };
  } catch {
    return { ok: false, status: 502, mensagem: GENERICA };
  }
}

export async function carregarIa(id: string, causaId?: string) {
  return chamar<VisaoIa>(
    id,
    causaId ? `?causaId=${encodeURIComponent(causaId)}` : "",
    "GET",
  );
}

export async function analisarIa(id: string) {
  return chamar<VisaoIa>(id, "/analisar", "POST", {});
}

export async function novaPerguntaIa(id: string) {
  return chamar<VisaoIa>(id, "/pergunta", "POST", {});
}

export async function aceitarIa(
  id: string,
  corpo: {
    registroId: string;
    aceite: "aceita" | "alterada" | "recusada";
    causaId?: string;
    textoFinal?: string;
  },
) {
  return chamar<{ ok: true }>(id, "/aceite", "POST", corpo);
}

export async function responderIa(
  id: string,
  corpo: {
    chave: string;
    valor?: string;
    dispensada?: boolean;
    motivo?: string;
    origem?: "atendente" | "ia_confirmada";
  },
) {
  return chamar<{ ok: true }>(id, "/respostas", "POST", corpo);
}
