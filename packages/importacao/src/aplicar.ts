import type { Linha, Tabelas } from "./converter";

/** Executa um comando com parâmetros. Prisma e PGlite se encaixam aqui. */
export type Executor = (sql: string, params: unknown[]) => Promise<unknown>;

type Tipo = "text" | "int" | "bool" | "num" | "date" | "ts" | { enum: string };

interface Coluna {
  nome: string;
  tipo: Tipo;
}

interface Especificacao {
  tabela: keyof Tabelas;
  colunas: Coluna[];
}

const t = (nome: string, tipo: Tipo = "text"): Coluna => ({ nome, tipo });

/** Ordem de gravação: quem é referenciado vem antes de quem referencia. */
const ORDEM: Especificacao[] = [
  { tabela: "marcas", colunas: [t("id"), t("nome"), t("ativa", "bool")] },
  {
    tabela: "canais",
    colunas: [
      t("id"),
      t("nome"),
      t("tipo", { enum: "CanalTipo" }),
      t("ativo", "bool"),
    ],
  },
  {
    tabela: "bancadas",
    colunas: [t("id"), t("codigo"), t("nome"), t("ativa", "bool")],
  },
  { tabela: "setores", colunas: [t("id"), t("nome"), t("ativo", "bool")] },
  {
    tabela: "produtos",
    colunas: [
      t("id"),
      t("codigo"),
      t("nome"),
      t("familia"),
      t("categoria"),
      t("ativo", "bool"),
    ],
  },
  {
    tabela: "causas",
    colunas: [
      t("id"),
      t("categoria"),
      t("nome"),
      t("origem", { enum: "OrigemCausa" }),
      t("acao"),
      t("ordem", "int"),
      t("setorId"),
    ],
  },
  {
    tabela: "reclamacoes",
    colunas: [
      t("id"),
      t("numero", "int"),
      t("protocoloExterno"),
      t("marcaId"),
      t("canalId"),
      t("produtoId"),
      t("bancadaId"),
      t("causaId"),
      t("setorRespId"),
      t("setorRespManual", "bool"),
      t("causaManual", "bool"),
      t("situacao", { enum: "Situacao" }),
      t("devolucao", { enum: "Devolucao" }),
      t("dataAbertura", "date"),
      t("dataAcao", "date"),
      t("dataRecebimento", "date"),
      t("descricao"),
      t("laudo"),
      t("procedencia"),
      t("solucao"),
      t("observacao"),
      t("garantia"),
      t("clienteNome"),
      t("cidade"),
      t("uf"),
      t("transportadora"),
      t("peca"),
      t("rascunho", "bool"),
      t("origemRegistro"),
      t("criadoEm", "ts"),
      t("alteradoEm", "ts"),
    ],
  },
  {
    tabela: "custos",
    colunas: [
      t("reclamacaoId"),
      t("freteEnvio", "num"),
      t("freteRetorno", "num"),
      t("valorPeca", "num"),
      t("estorno", "num"),
      t("desconto", "num"),
      t("guia", "num"),
    ],
  },
  {
    tabela: "reclamacao_causas",
    colunas: [
      t("id"),
      t("reclamacaoId"),
      t("causaId"),
      t("primaria", "bool"),
      t("ordem", "int"),
    ],
  },
  {
    tabela: "usuarios",
    colunas: [
      t("id"),
      t("login"),
      t("nome"),
      t("perfil", { enum: "Perfil" }),
      t("senhaHash"),
      t("ativo", "bool"),
      t("telefone"),
      t("criadoEm", "ts"),
      t("alteradoEm", "ts"),
    ],
  },
  {
    tabela: "vendas_dia",
    colunas: [
      t("id"),
      t("sku"),
      t("descricao"),
      t("data", "date"),
      t("quantidade", "int"),
    ],
  },
];

function marcador(c: Coluna, n: number): string {
  if (typeof c.tipo === "object") return `$${n}::"${c.tipo.enum}"`;
  switch (c.tipo) {
    case "int":
      return `$${n}::int`;
    case "bool":
      return `$${n}::boolean`;
    case "num":
      return `$${n}::numeric`;
    case "date":
      return `$${n}::date`;
    case "ts":
      return `$${n}::timestamptz`;
    default:
      return `$${n}::text`;
  }
}

/** Nomes de tabela e coluna vêm só das constantes acima; os valores vão por parâmetro. */
export function sqlInserir(spec: Especificacao, linhas = 1): string {
  const cols = spec.colunas.map((c) => `"${c.nome}"`).join(", ");
  const grupos: string[] = [];
  for (let l = 0; l < linhas; l++) {
    const base = l * spec.colunas.length;
    grupos.push(
      `(${spec.colunas.map((c, i) => marcador(c, base + i + 1)).join(", ")})`,
    );
  }
  return `INSERT INTO "${spec.tabela}" (${cols}) VALUES ${grupos.join(", ")} ON CONFLICT DO NOTHING`;
}

/** O Postgres aceita até 65535 parâmetros por comando; ficamos bem abaixo. */
const PARAMETROS_POR_COMANDO = 20000;

/** Grava todas as tabelas. Rodar de novo não duplica: conflito é ignorado. */
export async function aplicarTabelas(
  exec: Executor,
  tabelas: Tabelas,
): Promise<Record<string, number>> {
  const lidas: Record<string, number> = {};
  for (const spec of ORDEM) {
    const linhas: Linha[] = tabelas[spec.tabela];
    const porLote = Math.max(
      1,
      Math.floor(PARAMETROS_POR_COMANDO / spec.colunas.length),
    );
    for (let i = 0; i < linhas.length; i += porLote) {
      const lote = linhas.slice(i, i + porLote);
      await exec(
        sqlInserir(spec, lote.length),
        lote.flatMap((linha) => spec.colunas.map((c) => linha[c.nome] ?? null)),
      );
    }
    lidas[spec.tabela] = linhas.length;
  }
  // Os números importados são explícitos; a sequência precisa continuar depois do maior.
  await exec(
    `SELECT setval(pg_get_serial_sequence('reclamacoes', 'numero'), GREATEST((SELECT COALESCE(MAX(numero), 0) FROM reclamacoes), 1))`,
    [],
  );
  return lidas;
}
