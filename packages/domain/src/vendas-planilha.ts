import { normalizarSku } from "./coeficiente";

export interface LinhaVenda {
  sku: string;
  descricao: string;
  data: string;
  quantidade: number;
}

export interface ErroPlanilha {
  linha: number;
  mensagem: string;
}

export interface PreviaVendas {
  linhas: LinhaVenda[];
  erros: ErroPlanilha[];
  /** Linhas repetidas do mesmo SKU e dia, somadas na quantidade que será gravada. */
  somadas: number;
}

const MAX_LINHAS = 20_000;
const MAX_QTDE = 10_000_000;

/** DD/MM/AAAA válido, também AAAA-MM-DD. */
export function dataDaPlanilha(bruto: string): string | null {
  const t = bruto.trim();
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso = t;
  else {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (ano < 1990 || ano > 2100) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return iso;
}

function quantidadeDe(bruto: string): number | null {
  const t = bruto.trim().replace(/\s/g, "");
  if (!t) return null;
  let normal = t;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) {
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d+$/.test(t)) normal = t.replace(",", ".");
  else if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0 || n > MAX_QTDE) return null;
  return Math.round(n);
}

function colunas(linha: string): string[] {
  if (linha.includes("\t")) return linha.split("\t");
  if (linha.includes(";")) return linha.split(";");
  return linha.split(",");
}

/**
 * Cola do ERP: código, descrição, data e quantidade.
 * O mesmo SKU e dia vira uma linha; gravar depois substitui a quantidade.
 */
export function lerPlanilhaVendas(texto: string): PreviaVendas {
  const erros: ErroPlanilha[] = [];
  const bruto = texto.replace(/^\uFEFF/, "");
  const linhasTexto = bruto.split(/\r?\n/).filter((l) => l.trim());
  if (linhasTexto.length === 0) {
    return {
      linhas: [],
      erros: [{ linha: 0, mensagem: "Nada para ler." }],
      somadas: 0,
    };
  }
  if (linhasTexto.length > MAX_LINHAS) {
    return {
      linhas: [],
      erros: [{ linha: 0, mensagem: "A cola passa de 20 mil linhas." }],
      somadas: 0,
    };
  }

  let inicio = 0;
  const cabecalho = linhasTexto[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    cabecalho.includes("cod") &&
    (cabecalho.includes("quant") || cabecalho.includes("qtde"))
  ) {
    inicio = 1;
  }

  const mapa = new Map<string, LinhaVenda>();
  let somadas = 0;
  for (let i = inicio; i < linhasTexto.length; i++) {
    const numero = i + 1;
    const partes = colunas(linhasTexto[i]);
    if (partes.length < 4) {
      erros.push({ linha: numero, mensagem: "Faltam colunas." });
      continue;
    }
    const sku = normalizarSku(partes[0]);
    const descricao = partes[1].trim().slice(0, 200);
    const data = dataDaPlanilha(partes[2]);
    const quantidade = quantidadeDe(partes[3]);
    if (!sku || sku.length > 80) {
      erros.push({ linha: numero, mensagem: "Código vazio ou longo demais." });
      continue;
    }
    if (!data) {
      erros.push({ linha: numero, mensagem: "Data inválida. Use DD/MM/AAAA." });
      continue;
    }
    if (quantidade === null) {
      erros.push({ linha: numero, mensagem: "Quantidade inválida." });
      continue;
    }
    const chave = `${sku}|${data}`;
    const anterior = mapa.get(chave);
    if (anterior) {
      const soma = anterior.quantidade + quantidade;
      if (soma > MAX_QTDE) {
        erros.push({
          linha: numero,
          mensagem: "Quantidade do dia passou do limite.",
        });
        continue;
      }
      anterior.quantidade = soma;
      if (descricao) anterior.descricao = descricao;
      somadas += 1;
    } else {
      mapa.set(chave, { sku, descricao, data, quantidade });
    }
  }

  return { linhas: [...mapa.values()], erros, somadas };
}
