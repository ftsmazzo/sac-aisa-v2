"use server";

import { cookies } from "next/headers";
import { urlDaApi } from "@/lib/sessao";

export interface LinhaPrevia {
  sku: string;
  descricao: string;
  data: string;
  quantidade: number;
}

export interface ErroPrevia {
  linha: number;
  mensagem: string;
}

export type ResultadoPrevia =
  | { ok: true; linhas: LinhaPrevia[]; erros: ErroPrevia[]; somadas: number }
  | { ok: false; mensagem: string };

export type ResultadoGravar =
  | { ok: true; gravadas: number; somadas: number; erros: ErroPrevia[] }
  | { ok: false; mensagem: string };

const GENERICA = "Não foi possível gravar as vendas. Tente de novo.";

function mensagemDe(dados: { message?: unknown }, status: number): string {
  const m = dados.message;
  if (status === 400 && typeof m === "string" && m) return m;
  if (status === 401) return "Sua sessão terminou. Entre de novo.";
  if (status === 403) return "Você não tem permissão para gravar vendas.";
  return GENERICA;
}

async function postar(caminho: string, texto: string) {
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) return { ok: false as const, status: 401, dados: {} };
  try {
    const r = await fetch(`${urlDaApi()}${caminho}`, {
      method: "POST",
      headers: {
        cookie: `sac_sessao=${encodeURIComponent(token)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ texto }),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as {
      message?: unknown;
      linhas?: LinhaPrevia[];
      erros?: ErroPrevia[];
      somadas?: number;
      gravadas?: number;
    };
    return { ok: r.ok, status: r.status, dados };
  } catch {
    return { ok: false as const, status: 502, dados: {} };
  }
}

export async function previaVendas(texto: string): Promise<ResultadoPrevia> {
  const r = await postar("/relatorios/vendas/previa", texto);
  if (!r.ok) return { ok: false, mensagem: mensagemDe(r.dados, r.status) };
  return {
    ok: true,
    linhas: r.dados.linhas ?? [],
    erros: r.dados.erros ?? [],
    somadas: r.dados.somadas ?? 0,
  };
}

export async function gravarVendas(texto: string): Promise<ResultadoGravar> {
  const r = await postar("/relatorios/vendas", texto);
  if (!r.ok || r.dados.gravadas == null) {
    return { ok: false, mensagem: mensagemDe(r.dados, r.status) };
  }
  return {
    ok: true,
    gravadas: r.dados.gravadas,
    somadas: r.dados.somadas ?? 0,
    erros: r.dados.erros ?? [],
  };
}
