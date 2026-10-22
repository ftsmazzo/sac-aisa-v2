import { aplicarTabelas, type Executor } from "./aplicar";
import {
  type BackupLegado,
  converterBackup,
  type Relatorio,
} from "./converter";

/** Tetos para um arquivo enviado pelo navegador. O de verdade do sistema antigo é bem menor. */
export const LIMITES = {
  reclamacoes: 100_000,
  causasGravadas: 500_000,
  vendas: 500_000,
  usuarios: 1_000,
} as const;

export type ResultadoValidacao =
  | { ok: true; arquivo: BackupLegado }
  | { ok: false; mensagem: string };

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Confere o formato do arquivo recebido antes de converter qualquer coisa. */
export function validarArquivo(bruto: unknown): ResultadoValidacao {
  if (!ehObjeto(bruto)) {
    return {
      ok: false,
      mensagem: "O arquivo não parece um backup do sac-renato.",
    };
  }
  const { regs, causasExtras, vendas, usuarios } = bruto;

  if (!Array.isArray(regs) || regs.length === 0) {
    return {
      ok: false,
      mensagem: "O arquivo não tem reclamações (campo regs).",
    };
  }
  if (regs.length > LIMITES.reclamacoes) {
    return {
      ok: false,
      mensagem: `O arquivo passa do limite de ${LIMITES.reclamacoes} reclamações.`,
    };
  }
  for (const r of regs) {
    if (
      !ehObjeto(r) ||
      !Number.isInteger(r.reg) ||
      (r.reg as number) < 1 ||
      typeof r.data !== "string"
    ) {
      return {
        ok: false,
        mensagem: "Há reclamação sem número ou sem data no arquivo.",
      };
    }
  }

  const listas: [string, unknown, number][] = [
    ["causasExtras", causasExtras, LIMITES.causasGravadas],
    ["vendas", vendas, LIMITES.vendas],
    ["usuarios", usuarios, LIMITES.usuarios],
  ];
  for (const [nome, lista, limite] of listas) {
    if (lista === undefined) continue;
    if (!Array.isArray(lista)) {
      return { ok: false, mensagem: `O campo ${nome} precisa ser uma lista.` };
    }
    if (lista.length > limite) {
      return {
        ok: false,
        mensagem: `O campo ${nome} passa do limite de ${limite} itens.`,
      };
    }
  }
  return { ok: true, arquivo: bruto as unknown as BackupLegado };
}

export type ModoImportacao = "simular" | "gravar";

export interface ResultadoImportacao {
  modo: ModoImportacao;
  relatorio: Relatorio;
  /** Linhas enviadas ao banco por tabela. Nulo na simulação. */
  gravado: Record<string, number> | null;
}

export interface DependenciasImportacao {
  /** Roda tudo numa transação: ou grava tudo, ou nada. */
  transacao<T>(fn: (exec: Executor) => Promise<T>): Promise<T>;
}

/**
 * Converte o arquivo e, no modo "gravar", escreve no banco. O relatório traz só
 * contagens e avisos, nunca dado de cliente.
 */
export async function executarImportacao(
  deps: DependenciasImportacao,
  arquivo: BackupLegado,
  modo: ModoImportacao,
  catalogoProdutos?: string,
): Promise<ResultadoImportacao> {
  const { tabelas, relatorio } = converterBackup(arquivo, { catalogoProdutos });
  if (modo === "simular") return { modo, relatorio, gravado: null };
  const gravado = await deps.transacao((exec) => aplicarTabelas(exec, tabelas));
  return { modo, relatorio, gravado };
}
