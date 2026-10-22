/** Resumo do arquivo, calculado no navegador antes de enviar qualquer coisa. */
export interface ResumoArquivo {
  reclamacoes: number;
  vendas: number;
  usuarios: number;
  causasGravadas: number;
  fotos: number;
  primeiraData: string | null;
  ultimaData: string | null;
}

export type LeituraArquivo =
  | { ok: true; resumo: ResumoArquivo; arquivo: unknown }
  | { ok: false; mensagem: string };

const tamanho = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export function lerArquivoDeImportacao(texto: string): LeituraArquivo {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, mensagem: "O arquivo não é um JSON válido." };
  }
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return {
      ok: false,
      mensagem: "O arquivo não parece um backup do sac-renato.",
    };
  }
  const o = bruto as Record<string, unknown>;
  const regs = o.regs;
  if (!Array.isArray(regs) || regs.length === 0) {
    return {
      ok: false,
      mensagem:
        "O arquivo não tem reclamações. Use o arquivo gerado a partir do dump.",
    };
  }

  const datas = regs
    .map((r) => (r as { data?: unknown } | null)?.data)
    .filter(
      (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d),
    )
    .map((d) => d.slice(0, 10))
    .sort();

  return {
    ok: true,
    arquivo: bruto,
    resumo: {
      reclamacoes: regs.length,
      vendas: tamanho(o.vendas),
      usuarios: tamanho(o.usuarios),
      causasGravadas: tamanho(o.causasExtras),
      fotos: typeof o.fotos === "number" ? o.fotos : 0,
      primeiraData: datas[0] ?? null,
      ultimaData: datas[datas.length - 1] ?? null,
    },
  };
}

/** "2026-10-20" vira "20/10/2026". */
export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export interface RelatorioImportacao {
  lidas: number;
  importadas: number;
  semData: number[];
  causaDefinidaNoBackup: number;
  causaInferida: number;
  semCanal: number;
  semSku: number;
  produtosCriadosDasReclamacoes: number;
  usuariosInativos: number;
  vendasLidas: number;
  contagens: Record<string, number>;
  ignorados: { fotos: number; auditoria: number };
  avisos: string[];
}

export interface RespostaImportacao {
  modo: "simular" | "gravar";
  relatorio: RelatorioImportacao;
  gravado: Record<string, number> | null;
}

export const NOMES_TABELAS: Record<string, string> = {
  marcas: "Marcas",
  canais: "Canais",
  bancadas: "Bancadas",
  setores: "Setores",
  produtos: "Produtos",
  causas: "Causas",
  reclamacoes: "Reclamações",
  custos: "Custos",
  reclamacao_causas: "Causas por reclamação",
  usuarios: "Usuários (inativos)",
  vendas_dia: "Vendas por dia",
};

/** Mensagem para a pessoa quando a API recusa ou falha. */
export function mensagemImportacao(
  status: number,
  mensagemDaApi?: string,
): string {
  switch (status) {
    case 400:
      return mensagemDaApi || "O arquivo não foi aceito.";
    case 401:
      return "Sua sessão expirou. Entre de novo.";
    case 403:
      return "Só administrador pode importar.";
    case 409:
      return "Já existe uma importação em andamento. Aguarde terminar.";
    case 413:
      return "O arquivo é grande demais para enviar.";
    default:
      return "Não foi possível importar agora. Tente de novo em instantes.";
  }
}

export const LIMITE_ARQUIVO_BYTES = 24 * 1024 * 1024;
