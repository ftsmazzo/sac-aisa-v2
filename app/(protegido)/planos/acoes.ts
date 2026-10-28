"use server";

import { cookies } from "next/headers";
import { urlDaApi } from "@/lib/sessao";

async function post(caminho: string, corpo?: unknown) {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) return { ok: false as const, mensagem: "Sua sessão terminou." };
  try {
    const r = await fetch(`${urlDaApi()}${caminho}`, {
      method: "POST",
      headers: {
        cookie: `sac_sessao=${encodeURIComponent(token)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo ?? {}),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as {
      message?: string;
      resultado?: string;
      reabrir?: boolean;
      card?: string;
      id?: string;
      vinculados?: number;
    };
    if (!r.ok) {
      return {
        ok: false as const,
        mensagem:
          typeof dados.message === "string"
            ? dados.message
            : "Não foi possível gravar o plano.",
      };
    }
    return { ok: true as const, ...dados };
  } catch {
    return { ok: false as const, mensagem: "Não foi possível gravar o plano." };
  }
}

export type CorpoPlano = {
  titulo: string;
  descricao: string;
  causaId: string;
  produtoId?: string;
  bancadaId?: string;
  setorRespId?: string;
  origem?: string;
  prioridade?: string;
  responsavel?: string;
  prazo?: string;
  baselineInicio?: string;
  baselineFim?: string;
  reclamacaoIds?: string[];
};

export async function criarPlano(corpo: CorpoPlano) {
  return post("/planos", corpo);
}

export async function medirPlano(id: string) {
  return post(`/planos/${encodeURIComponent(id)}/efeito`);
}

export type SugestaoPlano = {
  ok: true;
  titulo: string;
  descricao: string;
  prioridade: "baixa" | "media" | "alta";
  avisos: string[];
  fonte: "ia" | "regra";
  aviso?: string;
  custoUsd?: number;
};

export async function sugerirPlano(corpo: {
  sku?: string;
  produtoId?: string;
  causaId?: string;
  bancadaId?: string;
  baselineInicio?: string;
  baselineFim?: string;
  reclamacaoIds?: string[];
}): Promise<SugestaoPlano | { ok: false; mensagem: string }> {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) return { ok: false, mensagem: "Sua sessão terminou." };
  try {
    const r = await fetch(`${urlDaApi()}/planos/sugerir`, {
      method: "POST",
      headers: {
        cookie: `sac_sessao=${encodeURIComponent(token)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return {
        ok: false,
        mensagem:
          typeof dados.message === "string"
            ? dados.message
            : "Não foi possível sugerir o plano.",
      };
    }
    return {
      ok: true,
      titulo: String(dados.titulo ?? ""),
      descricao: String(dados.descricao ?? ""),
      prioridade:
        dados.prioridade === "baixa" || dados.prioridade === "alta"
          ? dados.prioridade
          : "media",
      avisos: Array.isArray(dados.avisos)
        ? dados.avisos.filter((a): a is string => typeof a === "string")
        : [],
      fonte: dados.fonte === "regra" ? "regra" : "ia",
      aviso: typeof dados.aviso === "string" ? dados.aviso : undefined,
      custoUsd: typeof dados.custoUsd === "number" ? dados.custoUsd : undefined,
    };
  } catch {
    return { ok: false, mensagem: "Não foi possível sugerir o plano." };
  }
}
