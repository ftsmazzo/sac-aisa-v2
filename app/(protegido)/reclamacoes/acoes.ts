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

export type ResultadoAnalise =
  | { ok: true; id: string }
  | { ok: false; status: number; mensagem: string };

/**
 * Registra (sem `analiseId`) ou edita a análise do setor. O setor da análise é o da própria
 * reclamação e quem confere permissão e escopo é a API; aqui só se leva o corpo.
 */
export async function salvarAnalise(
  reclamacaoId: string,
  analiseId: string | null,
  corpo: Record<string, unknown>,
): Promise<ResultadoAnalise> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) {
    return { ok: false, status: 401, mensagem: MENSAGEM_POR_STATUS[401] };
  }
  try {
    const r = await fetch(
      `${urlDaApi()}/reclamacoes/${encodeURIComponent(reclamacaoId)}/analise${analiseId ? `/${encodeURIComponent(analiseId)}` : ""}`,
      {
        method: analiseId ? "PATCH" : "POST",
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
      message?: string;
    };
    if (r.ok && dados.id) return { ok: true, id: dados.id };
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

export type ResultadoEstado =
  | {
      ok: true;
      id: string;
      numero: number;
      estado: string;
      reabertura: boolean;
    }
  | { ok: false; status: number; mensagem: string };

/**
 * Muda o estado da jornada. Quem decide se a pessoa pode, e se o motivo é obrigatório,
 * é a API; aqui só se leva o pedido e se traduz o erro.
 */
export async function mudarEstado(
  id: string,
  para: string,
  motivo?: string,
): Promise<ResultadoEstado> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) {
    return { ok: false, status: 401, mensagem: MENSAGEM_POR_STATUS[401] };
  }
  try {
    const r = await fetch(
      `${urlDaApi()}/reclamacoes/${encodeURIComponent(id)}/estado`,
      {
        method: "POST",
        headers: {
          cookie: `sac_sessao=${encodeURIComponent(token)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(motivo ? { para, motivo } : { para }),
        cache: "no-store",
      },
    );
    const dados = (await r.json().catch(() => ({}))) as {
      id?: string;
      numero?: number;
      estado?: string;
      reabertura?: boolean;
      message?: string;
    };
    if (r.ok && dados.id && typeof dados.numero === "number") {
      return {
        ok: true,
        id: dados.id,
        numero: dados.numero,
        estado: dados.estado ?? para,
        reabertura: dados.reabertura === true,
      };
    }
    return {
      ok: false,
      status: r.status,
      mensagem:
        r.status < 500 && dados.message
          ? dados.message
          : (MENSAGEM_POR_STATUS[r.status] ?? MENSAGEM_GENERICA),
    };
  } catch {
    return { ok: false, status: 502, mensagem: MENSAGEM_GENERICA };
  }
}

async function postJson(
  caminho: string,
  corpo: unknown,
): Promise<{ ok: true } | { ok: false; status: number; mensagem: string }> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) {
    return { ok: false, status: 401, mensagem: MENSAGEM_POR_STATUS[401] };
  }
  try {
    const r = await fetch(`${urlDaApi()}${caminho}`, {
      method: "POST",
      headers: {
        cookie: `sac_sessao=${encodeURIComponent(token)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    if (r.ok) return { ok: true };
    const dados = (await r.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      status: r.status,
      mensagem:
        r.status < 500 && dados.message
          ? dados.message
          : (MENSAGEM_POR_STATUS[r.status] ?? MENSAGEM_GENERICA),
    };
  } catch {
    return { ok: false, status: 502, mensagem: MENSAGEM_GENERICA };
  }
}

export async function sugerirResposta(id: string) {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) {
    return { ok: false as const, mensagem: MENSAGEM_POR_STATUS[401] };
  }
  try {
    const r = await fetch(
      `${urlDaApi()}/reclamacoes/${encodeURIComponent(id)}/ia/resposta`,
      {
        method: "POST",
        headers: {
          cookie: `sac_sessao=${encodeURIComponent(token)}`,
          "content-type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      },
    );
    const dados = (await r.json().catch(() => ({}))) as {
      disponivel?: boolean;
      texto?: string;
      aviso?: string;
      message?: string;
    };
    if (!r.ok) {
      return {
        ok: false as const,
        mensagem: dados.message ?? MENSAGEM_GENERICA,
      };
    }
    if (!dados.disponivel || !dados.texto) {
      return {
        ok: false as const,
        mensagem: dados.aviso ?? "A IA não sugeriu agora. Escreva você.",
      };
    }
    return { ok: true as const, texto: dados.texto };
  } catch {
    return { ok: false as const, mensagem: MENSAGEM_GENERICA };
  }
}

export async function enviarResposta(id: string, texto: string) {
  return postJson(`/reclamacoes/${encodeURIComponent(id)}/resposta`, {
    texto,
  });
}

export async function enviarFoto(
  id: string,
  corpo: { nome: string; tipo: string; conteudo: string },
) {
  return postJson(`/reclamacoes/${encodeURIComponent(id)}/fotos`, corpo);
}

export async function registrarAcompanhamento(id: string, valor: string) {
  return postJson(`/reclamacoes/${encodeURIComponent(id)}/acompanhamento`, {
    valor,
  });
}
