import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ESTADOS, type Estado, situacao } from "@sac-aisa/domain";
import {
  type CanalSimulado,
  cargaMercadoLivre,
  cargaShopee,
  type DadosDoCanal,
  lerCargaMercadoLivre,
  lerCargaShopee,
  NOME_DO_CANAL,
} from "./treino-canais";

/**
 * Modo treino: dados fictícios de demonstração, marcados com `treino = true`.
 * Tudo aqui é SQL parametrizado por um executor, para rodar igual na API (Prisma) e nos testes
 * (PGlite). Só se lê e se grava o que o próprio treino criou: apagar nunca toca linha real.
 */

export type Linha = Record<string, unknown>;
export type Executor = (sql: string, params?: unknown[]) => Promise<Linha[]>;
export type Transacao = <T>(fn: (exec: Executor) => Promise<T>) => Promise<T>;

/** Transação do Prisma com SQL parametrizado, para a API e o script. */
export function transacaoPrisma(prisma: PrismaClient): Transacao {
  return (fn) =>
    prisma.$transaction(
      (tx) =>
        fn((sql, params = []) => tx.$queryRawUnsafe<Linha[]>(sql, ...params)),
      { timeout: 60_000, maxWait: 15_000 },
    );
}

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

type Coluna = [nome: string, valor: unknown, tipo?: string];

/** Nomes de tabela e coluna vêm só das constantes deste arquivo; os valores vão por parâmetro. */
export async function inserir(
  exec: Executor,
  tabela: string,
  colunas: Coluna[],
): Promise<boolean> {
  const nomes = colunas.map(([n]) => `"${n}"`).join(", ");
  const marcas = colunas
    .map(([, , t], i) => `$${i + 1}${t ? `::${t}` : ""}`)
    .join(", ");
  const r = await exec(
    `INSERT INTO "${tabela}" (${nomes}) VALUES (${marcas}) ON CONFLICT DO NOTHING RETURNING 1 AS ok`,
    colunas.map(([, v]) => v ?? null),
  );
  return r.length > 0;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const timestamp = (d: Date) => d.toISOString().replace("Z", "");

export function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  return new Date(d.getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

// ---------- Cadastros que o treino usa ----------

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
}

interface Referencias {
  marcas: Map<string, string>;
  canais: Map<string, string>;
  causas: Map<string, string | null>;
  produtos: Produto[];
  bancadas: string[];
}

const TIPO_DO_CANAL: Record<string, "interno" | "marketplace"> = {
  "Mercado Livre": "marketplace",
  Shopee: "marketplace",
  Site: "interno",
  WhatsApp: "interno",
};

/** Usa o cadastro que existe. Marca e canal que faltarem são criados; o resto é só consultado. */
async function referencias(exec: Executor): Promise<Referencias> {
  const marcas = new Map<string, string>();
  for (const m of await exec(`SELECT id, nome FROM marcas`)) {
    marcas.set(String(m.nome).toUpperCase(), String(m.id));
  }
  for (const nome of ["AISA", "ARTMAQ", "ARAUCA"]) {
    if (marcas.has(nome)) continue;
    const id = `marca-${slug(nome)}`;
    await inserir(exec, "marcas", [
      ["id", id],
      ["nome", nome],
      ["ativa", true, "boolean"],
    ]);
    marcas.set(nome, id);
  }

  const canais = new Map<string, string>();
  for (const c of await exec(`SELECT id, nome FROM canais`)) {
    canais.set(String(c.nome).toLowerCase(), String(c.id));
  }
  for (const [nome, tipo] of Object.entries(TIPO_DO_CANAL)) {
    if (canais.has(nome.toLowerCase())) continue;
    const id = `canal-${slug(nome)}`;
    await inserir(exec, "canais", [
      ["id", id],
      ["nome", nome],
      ["tipo", tipo, '"CanalTipo"'],
      ["ativo", true, "boolean"],
    ]);
    canais.set(nome.toLowerCase(), id);
  }

  const causas = new Map<string, string | null>();
  for (const c of await exec(
    `SELECT c.id, COALESCE(r."setorId", c."setorId") AS "setorId"
       FROM causas c LEFT JOIN regras_direcionamento r ON r."causaId" = c.id`,
  )) {
    causas.set(String(c.id), c.setorId ? String(c.setorId) : null);
  }

  const produtos = (
    await exec(
      `SELECT id, codigo, nome, categoria FROM produtos WHERE ativo = true ORDER BY codigo`,
    )
  ).map((p) => ({
    id: String(p.id),
    codigo: String(p.codigo),
    nome: String(p.nome),
    categoria: String(p.categoria),
  }));

  const bancadas = (
    await exec(`SELECT id FROM bancadas WHERE ativa = true ORDER BY codigo`)
  ).map((b) => String(b.id));

  return { marcas, canais, causas, produtos, bancadas };
}

/** Produto do catálogo da marca (pela categoria); sem produto da marca, qualquer um; sem catálogo, nenhum. */
function produtoDaMarca(
  ref: Referencias,
  marca: string,
  indice: number,
): Produto | null {
  const daMarca = ref.produtos.filter((p) =>
    p.categoria.toUpperCase().includes(marca),
  );
  const base = daMarca.length ? daMarca : ref.produtos;
  return base.length ? base[indice % base.length] : null;
}

// ---------- Demonstração ----------

type Marca = "AISA" | "ARTMAQ" | "ARAUCA";
type CanalDemo = "Mercado Livre" | "Shopee" | "Site" | "WhatsApp";
type Devolucao = "NA" | "AGUARDANDO" | "RECEBIDO";

interface Custos {
  freteEnvio?: number;
  freteRetorno?: number;
  valorPeca?: number;
  estorno?: number;
  desconto?: number;
  guia?: number;
}

interface EspecDemo {
  marca: Marca;
  canal: CanalDemo;
  /** Estados por onde a reclamação passou; o último é o atual. */
  caminho: Estado[];
  /** Dias desde a abertura. */
  abertoHa: number;
  /** Horas no estado atual. */
  noEstadoHoras: number;
  causa?: string;
  devolucao: Devolucao;
  /** Dias até o prazo do marketplace (negativo = estourado). */
  prazoEmDias?: number;
  descricao: string;
  laudo?: string;
  solucao?: string;
  /** Motivo da reabertura: o último passo do caminho vira reabertura. */
  reabertura?: string;
  cidade: string;
  uf: string;
  custos?: Custos;
  transportadora?: string;
  peca?: string;
}

const T = "triagem" as const;
const AC = "aguardando_cliente" as const;
const EN = "encaminhada" as const;
const RE = "recebida" as const;
const TR = "em_tratativa" as const;
const RS = "resolvida_setor" as const;
const FI = "finalizada" as const;

/**
 * 18 reclamações, uma ou mais em cada um dos sete estados. Algumas atrasadas, para disparar
 * alertas e mostrar os relógios; uma perto do prazo do marketplace; uma reaberta.
 */
export const DEMONSTRACAO: EspecDemo[] = [
  // Triagem (3)
  {
    marca: "AISA",
    canal: "Mercado Livre",
    caminho: [T],
    abertoHa: 0,
    noEstadoHoras: 3,
    devolucao: "NA",
    prazoEmDias: 4,
    descricao:
      "Recebi hoje e a solda de uma das alças já veio solta. Mandei foto pelo chat do pedido e ninguém respondeu. Quero a troca ou o dinheiro de volta.",
    cidade: "Campinas",
    uf: "SP",
  },
  {
    marca: "ARTMAQ",
    canal: "Shopee",
    caminho: [T],
    abertoHa: 1,
    noEstadoHoras: 20,
    devolucao: "NA",
    prazoEmDias: 1,
    descricao:
      "Chegou um item diferente do que está no anúncio. A cor e o tamanho não são os do pedido. Solicito devolução e reembolso.",
    cidade: "Curitiba",
    uf: "PR",
  },
  {
    marca: "ARAUCA",
    canal: "WhatsApp",
    caminho: [T],
    abertoHa: 0,
    noEstadoHoras: 5,
    devolucao: "NA",
    descricao:
      "Cliente chamou no WhatsApp dizendo que o produto chegou amassado de um lado. Enviou duas fotos da caixa. Ainda não sabemos se o dano é do transporte.",
    cidade: "Goiânia",
    uf: "GO",
  },
  // Aguardando cliente (2)
  {
    marca: "ARTMAQ",
    canal: "Mercado Livre",
    caminho: [T, AC],
    abertoHa: 3,
    noEstadoHoras: 30,
    devolucao: "NA",
    prazoEmDias: 5,
    descricao:
      "Comprador relata que a peça não encaixa na máquina. Pedimos foto da etiqueta e do encaixe e estamos esperando o retorno dele.",
    cidade: "Belo Horizonte",
    uf: "MG",
  },
  {
    marca: "AISA",
    canal: "Shopee",
    caminho: [T, AC],
    abertoHa: 4,
    noEstadoHoras: 50,
    devolucao: "NA",
    prazoEmDias: 3,
    descricao:
      "Faltou um item do kit, segundo o comprador. Pedimos a foto do que veio na caixa para conferir contra a nota. Sem resposta até agora.",
    cidade: "Recife",
    uf: "PE",
  },
  // Encaminhada ao setor (3: uma atrasada, uma reaberta)
  {
    marca: "AISA",
    canal: "Mercado Livre",
    caminho: [T, EN],
    abertoHa: 3,
    noEstadoHoras: 40,
    causa: "solda",
    devolucao: "AGUARDANDO",
    prazoEmDias: 2,
    descricao:
      "Solda da alça rompeu na primeira semana de uso. Cliente enviou vídeo. Encaminhada à solda, o setor ainda não pegou.",
    cidade: "São Paulo",
    uf: "SP",
    custos: { freteEnvio: 38.5 },
  },
  {
    marca: "ARAUCA",
    canal: "Shopee",
    caminho: [T, EN],
    abertoHa: 1,
    noEstadoHoras: 6,
    causa: "ferrugem",
    devolucao: "NA",
    descricao:
      "Pintura descascando e ponto de ferrugem perto da dobradiça. Fotos anexadas pelo comprador.",
    cidade: "Curitiba",
    uf: "PR",
  },
  {
    marca: "ARTMAQ",
    canal: "Mercado Livre",
    caminho: [T, EN, RE, TR, RS, FI, EN],
    abertoHa: 12,
    noEstadoHoras: 10,
    causa: "pintura",
    devolucao: "RECEBIDO",
    reabertura:
      "Cliente avisou que o defeito de pintura voltou depois do retrabalho.",
    descricao:
      "Pintura com falha na lateral. Foi retrabalhada, finalizada, e o cliente informou que o defeito voltou.",
    laudo: "Retrabalho de pintura feito; lote de tinta sob revisão.",
    solucao: "Repintura e envio de volta ao cliente.",
    cidade: "Campinas",
    uf: "SP",
    custos: { freteEnvio: 42, freteRetorno: 42 },
  },
  // Recebida pelo setor (2)
  {
    marca: "AISA",
    canal: "Mercado Livre",
    caminho: [T, EN, RE],
    abertoHa: 6,
    noEstadoHoras: 20,
    causa: "defeito",
    devolucao: "RECEBIDO",
    descricao:
      "Produto parou de funcionar no terceiro uso. Já voltou para a fábrica e o setor recebeu hoje cedo.",
    cidade: "Goiânia",
    uf: "GO",
    custos: { freteEnvio: 35, freteRetorno: 35 },
  },
  {
    marca: "ARTMAQ",
    canal: "Shopee",
    caminho: [T, EN, RE],
    abertoHa: 10,
    noEstadoHoras: 50,
    causa: "avaria",
    devolucao: "AGUARDANDO",
    prazoEmDias: 6,
    descricao:
      "Caixa chegou amassada e o produto veio com avaria. O setor recebeu o caso e espera o produto voltar, que ainda não chegou.",
    cidade: "Recife",
    uf: "PE",
    custos: { freteEnvio: 56 },
    transportadora: "Transportadora Exemplo",
  },
  // Em tratativa (3: uma atrasada, uma com custo alto)
  {
    marca: "ARAUCA",
    canal: "Mercado Livre",
    caminho: [T, EN, RE, TR],
    abertoHa: 7,
    noEstadoHoras: 60,
    causa: "solda",
    devolucao: "RECEBIDO",
    descricao:
      "Solda aberta na junção da base. O produto voltou e está na bancada para retrabalho. Passou da meta de tratativa.",
    laudo: "Junção com falta de penetração. Retrabalho na solda.",
    cidade: "Belo Horizonte",
    uf: "MG",
    custos: { freteEnvio: 40, freteRetorno: 40, valorPeca: 22 },
  },
  {
    marca: "AISA",
    canal: "Site",
    caminho: [T, EN, RE, TR],
    abertoHa: 2,
    noEstadoHoras: 10,
    causa: "pecas",
    devolucao: "NA",
    descricao:
      "Cliente do site recebeu o produto sem o manípulo. O setor separou a peça para reenvio.",
    laudo: "Peça faltante conferida na separação.",
    cidade: "São Paulo",
    uf: "SP",
    custos: { valorPeca: 18, freteEnvio: 26 },
    peca: "Manípulo",
  },
  {
    marca: "ARTMAQ",
    canal: "Shopee",
    caminho: [T, EN, RE, TR],
    abertoHa: 5,
    noEstadoHoras: 30,
    causa: "cuba_furada",
    devolucao: "RECEBIDO",
    descricao:
      "Cuba chegou furada. Produto devolvido e em análise. A empresa vai estornar o valor e substituir.",
    laudo: "Furo de fabricação na cuba.",
    cidade: "Curitiba",
    uf: "PR",
    custos: { freteEnvio: 48, freteRetorno: 48, estorno: 620, valorPeca: 90 },
  },
  // Resolvida no setor técnico (2: uma esperando finalização há mais de 24 h)
  {
    marca: "AISA",
    canal: "Mercado Livre",
    caminho: [T, EN, RE, TR, RS],
    abertoHa: 8,
    noEstadoHoras: 30,
    causa: "defeito",
    devolucao: "RECEBIDO",
    descricao:
      "Produto com defeito de funcionamento, devolvido. O setor técnico trocou o componente e devolveu a solução, mas o SAC ainda não finalizou.",
    laudo: "Componente com falha. Substituído e testado.",
    solucao: "Troca do componente e envio do produto reparado.",
    cidade: "Campinas",
    uf: "SP",
    custos: { freteEnvio: 36, freteRetorno: 36, valorPeca: 45 },
  },
  {
    marca: "ARAUCA",
    canal: "WhatsApp",
    caminho: [T, EN, RE, TR, RS],
    abertoHa: 4,
    noEstadoHoras: 5,
    causa: "kit",
    devolucao: "NA",
    descricao:
      "Cliente comprou o kit e recebeu só parte. O setor conferiu e mandou o que faltava.",
    laudo: "Kit incompleto na expedição.",
    solucao: "Envio do item que faltava no kit.",
    cidade: "Goiânia",
    uf: "GO",
    custos: { freteEnvio: 24, valorPeca: 30 },
  },
  // Finalizada no SAC (3)
  {
    marca: "ARTMAQ",
    canal: "Mercado Livre",
    caminho: [T, EN, RE, TR, RS, FI],
    abertoHa: 15,
    noEstadoHoras: 72,
    causa: "avaria",
    devolucao: "RECEBIDO",
    descricao:
      "Produto chegou amassado. A transportadora reconheceu a avaria e o produto foi trocado.",
    laudo: "Avaria de transporte confirmada.",
    solucao: "Produto novo enviado; reclamação encerrada com o comprador.",
    cidade: "Recife",
    uf: "PE",
    custos: { freteEnvio: 52, freteRetorno: 52 },
    transportadora: "Transportadora Exemplo",
  },
  {
    marca: "AISA",
    canal: "Shopee",
    caminho: [T, EN, RE, TR, RS, FI],
    abertoHa: 20,
    noEstadoHoras: 120,
    causa: "erro_envio",
    devolucao: "NA",
    descricao:
      "Foi enviado um modelo diferente do comprado. O correto foi despachado e o comprador confirmou o recebimento.",
    laudo: "Erro na separação do pedido.",
    solucao: "Reenvio do modelo correto.",
    cidade: "São Paulo",
    uf: "SP",
    custos: { freteEnvio: 30, freteRetorno: 30 },
  },
  {
    marca: "ARAUCA",
    canal: "Site",
    caminho: [T, EN, RE, TR, RS, FI],
    abertoHa: 9,
    noEstadoHoras: 48,
    causa: "prazo",
    devolucao: "NA",
    descricao:
      "Cliente reclamou do prazo de entrega, que passou do combinado. Pedimos desculpas e demos desconto no próximo pedido.",
    laudo: "Atraso na produção do lote.",
    solucao: "Desconto no próximo pedido e aviso do novo prazo.",
    cidade: "Curitiba",
    uf: "PR",
    custos: { desconto: 40 },
  },
];

const AUTOR_SAC = "Equipe SAC (treino)";
const AUTOR_SETOR = "Setor técnico (treino)";

const idDemo = (i: number) => `treino-demo-${String(i + 1).padStart(2, "0")}`;

/** Instante de cada passo do caminho: espalhados entre a abertura e a entrada no estado atual. */
function instantes(e: EspecDemo, agora: Date): Date[] {
  const inicio = agora.getTime() - e.abertoHa * DIA_MS - 2 * HORA_MS;
  const fim = Math.max(agora.getTime() - e.noEstadoHoras * HORA_MS, inicio);
  const n = e.caminho.length;
  if (n === 1) return [new Date(fim)];
  return e.caminho.map(
    (_, i) => new Date(inicio + ((fim - inicio) * i) / (n - 1)),
  );
}

const autorDo = (para: Estado) =>
  para === "recebida" || para === "em_tratativa" || para === "resolvida_setor"
    ? AUTOR_SETOR
    : AUTOR_SAC;

export interface ResultadoCarga {
  criadas: number;
  jaExistiam: number;
}

/** Cria as reclamações de demonstração. Rodar de novo não duplica: cada uma tem id fixo. */
export async function carregarDemonstracao(
  transacao: Transacao,
  agora: Date = new Date(),
): Promise<ResultadoCarga> {
  return transacao(async (exec) => {
    const ref = await referencias(exec);
    const hoje = hojeEmSaoPaulo(agora);
    let criadas = 0;

    for (const [i, e] of DEMONSTRACAO.entries()) {
      const id = idDemo(i);
      const quando = instantes(e, agora);
      const atual = e.caminho[e.caminho.length - 1];
      const setorId = e.causa ? (ref.causas.get(e.causa) ?? null) : null;
      const causaId = e.causa && ref.causas.has(e.causa) ? e.causa : null;
      const produto = produtoDaMarca(ref, e.marca, i);
      const bancadaId =
        e.causa && ref.bancadas.length
          ? ref.bancadas[i % ref.bancadas.length]
          : null;

      const dataAbertura = somarDias(hoje, -e.abertoHa);
      const resolvida = atual === "resolvida_setor" || atual === "finalizada";
      const passoResolvido = e.caminho.indexOf(RS);
      const dataAcao = resolvida
        ? quando[passoResolvido >= 0 ? passoResolvido : quando.length - 1]
            .toISOString()
            .slice(0, 10)
        : null;
      const passoRecebida = e.caminho.indexOf(RE);
      const dataRecebimento =
        e.devolucao === "RECEBIDO" && passoRecebida >= 0
          ? quando[passoRecebida].toISOString().slice(0, 10)
          : null;

      // Marketplace entrega a carga como a API; é dela que vêm pedido, texto e comprador.
      let canal: DadosDoCanal | null = null;
      let carga: unknown = null;
      if (e.canal === "Mercado Livre") {
        const c = cargaMercadoLivre(
          i + 1,
          produto?.codigo ?? "",
          produto?.nome ?? "",
          quando[0],
        );
        c.detail.problem = e.descricao;
        carga = c;
        canal = lerCargaMercadoLivre(c);
      } else if (e.canal === "Shopee") {
        const c = cargaShopee(
          i + 1,
          produto?.codigo ?? "",
          produto?.nome ?? "",
          quando[0],
        );
        c.text_reason = e.descricao;
        carga = c;
        canal = lerCargaShopee(c);
      }

      const prazo =
        e.prazoEmDias === undefined ? null : somarDias(hoje, e.prazoEmDias);
      const n3 = String(i + 1).padStart(3, "0");
      const criada = await inserir(exec, "reclamacoes", [
        ["id", id],
        ["canalId", ref.canais.get(e.canal.toLowerCase())],
        ["marcaId", ref.marcas.get(e.marca)],
        ["produtoId", produto?.id ?? null],
        ["bancadaId", bancadaId],
        ["causaId", causaId],
        ["setorRespId", setorId],
        [
          "situacao",
          situacao({ dataAcao, devolucao: e.devolucao }),
          '"Situacao"',
        ],
        ["estado", atual, '"EstadoJornada"'],
        ["estadoDesde", timestamp(quando[quando.length - 1]), "timestamp"],
        ["prazoMarketplace", prazo, "date"],
        ["devolucao", e.devolucao, '"Devolucao"'],
        ["dataAbertura", dataAbertura, "date"],
        ["dataAcao", dataAcao, "date"],
        ["dataRecebimento", dataRecebimento, "date"],
        ["descricao", e.descricao],
        ["laudo", e.laudo ?? ""],
        ["solucao", e.solucao ?? ""],
        ["pedido", canal?.pedido || `TREINO-PED-${n3}`],
        ["clienteNome", canal?.comprador.nome || `Cliente Fictício ${n3}`],
        ["cidade", e.cidade],
        ["uf", e.uf],
        ["transportadora", e.transportadora ?? ""],
        ["peca", e.peca ?? ""],
        ["origemRegistro", "demonstracao"],
        ["treino", true, "boolean"],
        ["criadoEm", timestamp(quando[0]), "timestamp"],
        ["alteradoEm", timestamp(quando[quando.length - 1]), "timestamp"],
      ]);
      if (!criada) continue;
      criadas++;

      for (const [k, para] of e.caminho.entries()) {
        const reabriu =
          e.reabertura !== undefined && k === e.caminho.length - 1;
        await inserir(exec, "estado_historico", [
          ["id", `${id}-h${k + 1}`],
          ["reclamacaoId", id],
          ["de", k === 0 ? null : e.caminho[k - 1], '"EstadoJornada"'],
          ["para", para, '"EstadoJornada"'],
          ["quando", timestamp(quando[k]), "timestamp"],
          ["autorNome", autorDo(para)],
          ["motivo", reabriu ? (e.reabertura ?? "") : ""],
          ["origem", "sistema"],
          ["reabertura", reabriu, "boolean"],
        ]);
      }

      const c = e.custos ?? {};
      await inserir(exec, "custos", [
        ["reclamacaoId", id],
        ["freteEnvio", c.freteEnvio ?? 0, "numeric"],
        ["freteRetorno", c.freteRetorno ?? 0, "numeric"],
        ["valorPeca", c.valorPeca ?? 0, "numeric"],
        ["estorno", c.estorno ?? 0, "numeric"],
        ["desconto", c.desconto ?? 0, "numeric"],
        ["guia", c.guia ?? 0, "numeric"],
      ]);

      if (causaId) {
        await inserir(exec, "reclamacao_causas", [
          ["id", `${id}-c1`],
          ["reclamacaoId", id],
          ["causaId", causaId],
          ["primaria", true, "boolean"],
        ]);
      }

      const passoTratativa = e.caminho.indexOf(TR);
      if (setorId && passoTratativa >= 0) {
        await inserir(exec, "analises_setor", [
          ["id", `${id}-a1`],
          ["reclamacaoId", id],
          ["setorId", setorId],
          ["produtoPrecisaVoltar", e.devolucao !== "NA", "boolean"],
          ["produtoRecebidoEm", dataRecebimento, "date"],
          ["conclusao", e.laudo ?? ""],
          ["resultado", e.solucao ?? ""],
          ["criadoEm", timestamp(quando[passoTratativa]), "timestamp"],
        ]);
      }

      if (canal && carga) {
        await inserir(exec, "capturas_canal", [
          ["id", `${id}-cap`],
          ["canalId", ref.canais.get(e.canal.toLowerCase())],
          ["idExterno", `treino-${canal.idExterno}`],
          ["payload", JSON.stringify(carga), "jsonb"],
          ["status", "aceito", '"CapturaStatus"'],
          ["reclamacaoId", id],
          ["capturadoEm", timestamp(quando[0]), "timestamp"],
        ]);
      }
    }
    return { criadas, jaExistiam: DEMONSTRACAO.length - criadas };
  });
}

// ---------- Simulador de canal ----------

export interface ResultadoSimulacao {
  id: string;
  numero: number;
  canal: string;
  idExterno: string;
}

function marcaDoProduto(p: Produto | null): Marca {
  const c = p?.categoria.toUpperCase() ?? "";
  if (c.includes("ARTMAQ")) return "ARTMAQ";
  if (c.includes("ARAUCA")) return "ARAUCA";
  return "AISA";
}

/**
 * Cria uma reclamação de treino em Triagem, origem "simulado", a partir de uma carga fictícia no
 * formato do canal. Pedido, SKU, texto, prazo e comprador saem da carga, como a API entregaria.
 */
export async function simularCanal(
  transacao: Transacao,
  canal: CanalSimulado,
  agora: Date = new Date(),
): Promise<ResultadoSimulacao> {
  const nomeCanal = NOME_DO_CANAL[canal];
  return transacao(async (exec) => {
    const ref = await referencias(exec);
    const canalId = ref.canais.get(nomeCanal.toLowerCase());
    if (!canalId) throw new Error("Canal não encontrado.");

    const contagem = await exec(
      `SELECT count(*)::int AS n FROM capturas_canal WHERE "idExterno" LIKE 'treino-%'`,
    );
    let seq = 1000 + Number(contagem[0]?.n ?? 0);
    const produto = produtoDaMarca(ref, "AISA", seq);
    const sku = produto?.codigo ?? "";
    const nome = produto?.nome ?? "";

    const montar = (n: number) => {
      if (canal === "mercadolivre") {
        const c = cargaMercadoLivre(n, sku, nome, agora);
        return { carga: c as unknown, dados: lerCargaMercadoLivre(c) };
      }
      const c = cargaShopee(n, sku, nome, agora);
      return { carga: c as unknown, dados: lerCargaShopee(c) };
    };

    let m = montar(seq);
    // O id do caso é a chave que evita duplicar; se já existir, passa para o próximo número.
    while (
      (
        await exec(
          `SELECT 1 FROM capturas_canal WHERE "canalId" = $1 AND "idExterno" = $2`,
          [canalId, `treino-${m.dados.idExterno}`],
        )
      ).length > 0
    ) {
      seq++;
      m = montar(seq);
    }

    const id = `treino-sim-${randomUUID()}`;
    const marca = marcaDoProduto(produto);
    const linha = await exec(
      `INSERT INTO "reclamacoes"
         ("id","canalId","marcaId","produtoId","estado","estadoDesde","prazoMarketplace","dataAbertura",
          "descricao","pedido","clienteNome","cidade","uf","origemRegistro","treino","criadoEm","alteradoEm")
       VALUES ($1,$2,$3,$4,'triagem'::"EstadoJornada",$5::timestamp,$6::date,$7::date,
          $8,$9,$10,$11,$12,'simulado',true,$5::timestamp,$5::timestamp)
       RETURNING numero`,
      [
        id,
        canalId,
        ref.marcas.get(marca) ?? null,
        produto?.id ?? null,
        timestamp(agora),
        m.dados.prazoMarketplace || null,
        hojeEmSaoPaulo(agora),
        m.dados.texto,
        m.dados.pedido,
        m.dados.comprador.nome,
        m.dados.comprador.cidade,
        m.dados.comprador.uf,
      ],
    );
    await inserir(exec, "custos", [["reclamacaoId", id]]);
    await inserir(exec, "estado_historico", [
      ["id", `${id}-h1`],
      ["reclamacaoId", id],
      ["de", null, '"EstadoJornada"'],
      ["para", "triagem", '"EstadoJornada"'],
      ["quando", timestamp(agora), "timestamp"],
      ["autorNome", `Canal ${nomeCanal} (simulado)`],
      ["origem", "sistema"],
    ]);
    await inserir(exec, "capturas_canal", [
      ["id", `${id}-cap`],
      ["canalId", canalId],
      ["idExterno", `treino-${m.dados.idExterno}`],
      ["payload", JSON.stringify(m.carga), "jsonb"],
      ["status", "aceito", '"CapturaStatus"'],
      ["reclamacaoId", id],
      ["capturadoEm", timestamp(agora), "timestamp"],
    ]);
    return {
      id,
      numero: Number(linha[0].numero),
      canal: nomeCanal,
      idExterno: m.dados.idExterno,
    };
  });
}

// ---------- Apagar e resumir ----------

export interface ResultadoApagar {
  reclamacoes: number;
}

const DE_TREINO = `SELECT id FROM reclamacoes WHERE treino = true`;

/**
 * Apaga só o que é de treino: as reclamações com `treino = true` e o que pende delas
 * (captura, alerta, auditoria, registro de IA). Histórico, custos e análises saem em cascata.
 * Toda condição passa por `treino = true`; nenhuma linha real é alcançada.
 */
export async function apagarTreino(
  transacao: Transacao,
): Promise<ResultadoApagar> {
  return transacao(async (exec) => {
    for (const tabela of [
      "capturas_canal",
      "alertas",
      "auditoria",
      "ia_registros",
    ]) {
      await exec(
        `DELETE FROM "${tabela}" WHERE "reclamacaoId" IN (${DE_TREINO})`,
      );
    }
    const r = await exec(
      `WITH d AS (DELETE FROM reclamacoes WHERE treino = true RETURNING 1)
       SELECT count(*)::int AS n FROM d`,
    );
    return { reclamacoes: Number(r[0]?.n ?? 0) };
  });
}

export interface ResumoTreino {
  reclamacoes: number;
  porEstado: Record<Estado, number>;
}

export async function resumoTreino(exec: Executor): Promise<ResumoTreino> {
  const linhas = await exec(
    `SELECT estado::text AS estado, count(*)::int AS n FROM reclamacoes WHERE treino = true GROUP BY estado`,
  );
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<
    Estado,
    number
  >;
  let total = 0;
  for (const l of linhas) {
    porEstado[l.estado as Estado] = Number(l.n);
    total += Number(l.n);
  }
  return { reclamacoes: total, porEstado };
}
