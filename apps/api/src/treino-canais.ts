/**
 * Cargas fictícias no formato que as APIs entregam (levantamento dos caminhos do Mercado Livre
 * e da Shopee) e a leitura delas para os campos da reclamação. Nada aqui é dado de cliente:
 * nomes, e-mails e telefones são inventados e inválidos de propósito (`.invalid`, DDD 00).
 */

export type CanalSimulado = "mercadolivre" | "shopee";

export const CANAIS_SIMULADOS: readonly CanalSimulado[] = [
  "mercadolivre",
  "shopee",
];

export const NOME_DO_CANAL: Record<CanalSimulado, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

/** O que sai de uma carga de canal e entra na reclamação (e no registro da captura). */
export interface DadosDoCanal {
  /** Chave que evita duplicar: claim.id no Mercado Livre, return_sn na Shopee. */
  idExterno: string;
  pedido: string;
  sku: string;
  texto: string;
  /** AAAA-MM-DD. */
  prazoMarketplace: string;
  valor: number;
  comprador: {
    nome: string;
    email: string;
    telefone: string;
    cidade: string;
    uf: string;
  };
}

const DIA_MS = 86_400_000;

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

interface Texto {
  problema: string;
  titulo: string;
  motivoId: string;
  motivo: string;
}

const TEXTOS_ML: Texto[] = [
  {
    problema:
      "Recebi o produto e a solda de uma das alças já veio solta. Mandei foto pelo chat e ninguém respondeu. Quero a troca ou o dinheiro de volta.",
    titulo: "Produto com defeito",
    motivoId: "PDD9939",
    motivo: "O produto chegou com defeito",
  },
  {
    problema:
      "Veio faltando uma peça da montagem. A caixa estava lacrada, então não foi extravio. Preciso da peça para usar o produto.",
    titulo: "Produto incompleto",
    motivoId: "PDD9940",
    motivo: "O produto chegou incompleto",
  },
  {
    problema:
      "Comprei o modelo da foto do anúncio e chegou outro. A cor e o tamanho são diferentes do que está no pedido.",
    titulo: "Produto diferente do anunciado",
    motivoId: "PDD9941",
    motivo: "Recebi um produto diferente do anunciado",
  },
];

const TEXTOS_SHOPEE: { reason: string; texto: string }[] = [
  {
    reason: "NONFUNCTIONAL",
    texto:
      "Produto chegou com a pintura descascando e um ponto de ferrugem. Anexei as fotos. Gostaria de devolver e receber o reembolso.",
  },
  {
    reason: "MISSING_ITEM",
    texto:
      "Faltou um item do kit. Na embalagem só veio uma parte do que comprei. Peço o envio do que falta ou a devolução.",
  },
  {
    reason: "DAMAGED",
    texto:
      "A caixa chegou amassada e o produto está com avaria. Quero devolver para reembolso.",
  },
];

const CIDADES: { cidade: string; uf: string }[] = [
  { cidade: "Campinas", uf: "SP" },
  { cidade: "Curitiba", uf: "PR" },
  { cidade: "Belo Horizonte", uf: "MG" },
  { cidade: "Goiânia", uf: "GO" },
  { cidade: "Recife", uf: "PE" },
];

const preencher = (n: number, largura = 3) => String(n).padStart(largura, "0");

/** Carga fictícia de uma reclamação do Mercado Livre: claim, detalhe e pedido, como a API entrega. */
export function cargaMercadoLivre(
  n: number,
  sku: string,
  nomeProduto: string,
  agora: Date,
) {
  const t = TEXTOS_ML[n % TEXTOS_ML.length];
  const local = CIDADES[n % CIDADES.length];
  const idPedido = 2_000_000_000_000 + n;
  const idClaim = 9_000_000_000 + n;
  const criada = agora.toISOString();
  const prazo = new Date(agora.getTime() + 3 * DIA_MS).toISOString();
  return {
    claim: {
      id: idClaim,
      resource: "order",
      resource_id: idPedido,
      status: "opened",
      type: "mediations",
      stage: "claim",
      reason_id: t.motivoId,
      date_created: criada,
      last_updated: criada,
      players: [
        { role: "complainant", user_id: 900_000_000 + n },
        { role: "respondent", user_id: 100_000_001 },
      ],
    },
    detail: {
      title: t.titulo,
      description: t.motivo,
      problem: t.problema,
      due_date: prazo,
    },
    order: {
      id: idPedido,
      total_amount: 289.9,
      order_items: [
        {
          item: {
            id: `MLB${preencher(n, 10)}`,
            title: nomeProduto,
            seller_sku: sku,
          },
          quantity: 1,
          unit_price: 289.9,
        },
      ],
      buyer: {
        id: 900_000_000 + n,
        nickname: `TREINO_COMPRADOR_${preencher(n)}`,
        first_name: "Comprador",
        last_name: `Fictício ${preencher(n)}`,
        email: `treino${preencher(n)}@exemplo.invalid`,
        phone: { area_code: "00", number: `9000${preencher(n, 5)}` },
      },
      shipping: {
        receiver_address: {
          city: { name: local.cidade },
          state: { id: `BR-${local.uf}`, name: local.uf },
        },
      },
    },
  };
}

/** Carga fictícia de uma devolução da Shopee: return_sn, text_reason, item_sku e e-mail mascarado. */
export function cargaShopee(
  n: number,
  sku: string,
  nomeProduto: string,
  agora: Date,
) {
  const t = TEXTOS_SHOPEE[n % TEXTOS_SHOPEE.length];
  const criada = Math.floor(agora.getTime() / 1000);
  const prazo = Math.floor((agora.getTime() + 2 * DIA_MS) / 1000);
  return {
    return_sn: `TREINO${preencher(n, 9)}`,
    order_sn: `2610TREINO${preencher(n, 6)}`,
    status: "REQUESTED",
    reason: t.reason,
    text_reason: t.texto,
    refund_amount: 219.9,
    currency: "BRL",
    create_time: criada,
    update_time: criada,
    return_ship_due_date: prazo,
    image: [],
    user: {
      username: `treino_comprador_${preencher(n)}`,
      // A Shopee entrega o e-mail do comprador mascarado.
      email: "tr****@ex*****.invalid",
    },
    item: [
      {
        item_id: 7_000_000_000 + n,
        item_sku: sku,
        variation_sku: "",
        name: nomeProduto,
        amount: 1,
        item_price: 219.9,
      },
    ],
  };
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(objeto) : [];

/** Lê a carga do Mercado Livre como o SAC grava: pedido, SKU, texto, prazo e comprador. */
export function lerCargaMercadoLivre(carga: {
  claim: unknown;
  detail: unknown;
  order: unknown;
}): DadosDoCanal {
  const claim = objeto(carga.claim);
  const detail = objeto(carga.detail);
  const order = objeto(carga.order);
  const item = objeto(objeto(lista(order.order_items)[0]).item);
  const comprador = objeto(order.buyer);
  const endereco = objeto(objeto(order.shipping).receiver_address);
  const fone = objeto(comprador.phone);
  const pedido =
    claim.resource === "order" ? String(claim.resource_id ?? "") : "";
  const prazo = texto(detail.due_date);
  return {
    idExterno: String(claim.id ?? ""),
    pedido,
    sku: texto(item.seller_sku),
    texto: texto(detail.problem),
    prazoMarketplace: prazo ? prazo.slice(0, 10) : "",
    valor: numero(order.total_amount),
    comprador: {
      nome: [texto(comprador.first_name), texto(comprador.last_name)]
        .filter(Boolean)
        .join(" "),
      email: texto(comprador.email),
      telefone: `(${texto(fone.area_code)}) ${texto(fone.number)}`,
      cidade: texto(objeto(endereco.city).name),
      uf: texto(objeto(endereco.state).name),
    },
  };
}

/** Lê a carga da Shopee: sem nome nem telefone (a API não entrega), com e-mail mascarado. */
export function lerCargaShopee(carga: unknown): DadosDoCanal {
  const c = objeto(carga);
  const item = lista(c.item)[0] ?? {};
  const usuario = objeto(c.user);
  const sku = texto(item.item_sku) || texto(item.variation_sku);
  const prazo = numero(c.return_ship_due_date);
  return {
    idExterno: texto(c.return_sn),
    pedido: texto(c.order_sn),
    sku,
    texto: texto(c.text_reason),
    prazoMarketplace: prazo ? isoDia(new Date(prazo * 1000)) : "",
    valor: numero(c.refund_amount),
    comprador: {
      nome: texto(usuario.username),
      email: texto(usuario.email),
      telefone: "",
      cidade: "",
      uf: "",
    },
  };
}
