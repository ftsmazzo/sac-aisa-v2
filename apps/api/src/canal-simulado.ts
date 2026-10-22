import { randomBytes } from "node:crypto";
import { assinaturaShopee, hmacHex, iguais } from "./canal-assinatura";

/**
 * Marketplace simulado: responde como as APIs reais do Mercado Livre e da Shopee, no formato do
 * levantamento (`caminhos-reclamacoes-ml-shopee.html`), para ensaiar a captura inteira sem tocar
 * em conta de verdade. É o código REAL de captura que consome isto; trocar para o canal real é só
 * mudar a URL base e as credenciais.
 *
 * Tudo é inventado: nomes "Fictício", e-mails `.invalid`, telefones com DDD 00. Os contratos que
 * o levantamento não confirma (anexos do Mercado Livre, assinatura do aviso do Mercado Livre)
 * estão marcados no código e precisam de conferência no console de cada canal.
 */

export const CREDENCIAIS_SIMULADAS = {
  mercadolivre: {
    appId: "SIM-APP-0001",
    segredo: "sim-secret-key-mercadolivre",
    code: "TG-SIMULADO-CODE",
    userId: 100000001,
  },
  shopee: {
    partnerId: 1000001,
    partnerKey: "sim-partner-key-shopee",
    shopId: 220004993,
    code: "sim-shopee-code",
  },
} as const;

export interface PedidoSimulado {
  metodo: string;
  url: URL;
  /** Nomes em minúsculas. */
  cabecalhos: Record<string, string>;
  corpo: string;
}

export interface RespostaSimulada {
  status: number;
  json: unknown;
}

const HORA_MS = 3_600_000;
const SEGUNDOS_TOKEN_ML = 21_600;
const SEGUNDOS_TOKEN_SHOPEE = 14_400;
const JANELA_ASSINATURA_S = 300;

const preencher = (n: number, largura = 3) => String(n).padStart(largura, "0");

export function mascararEmail(email: string): string {
  const [local, dominio = ""] = email.split("@");
  const [host, ...resto] = dominio.split(".");
  return `${local.slice(0, 2)}****@${host.slice(0, 2)}*****.${resto.join(".")}`;
}

// ---------- Casos ----------

interface ModeloML {
  titulo: string;
  motivoId: string;
  motivo: string;
  problema: string;
  sku: string | null;
  produto: string;
  horasAtras: number;
  /** Horas, desde a abertura, até o prazo do canal. */
  prazoHoras: number;
  tipo?: string;
  repeteOPedidoDe?: number;
}

const MODELOS_ML: ModeloML[] = [
  {
    titulo: "Produto com defeito de montagem",
    motivoId: "PDD9939",
    motivo: "O produto chegou com defeito",
    problema:
      "A solda de uma das alças já veio solta. Mandei foto pelo chat e ninguém respondeu. Quero a troca ou o dinheiro de volta.",
    sku: "G48",
    produto: "Abafador de alumínio",
    horasAtras: 30,
    prazoHoras: 96,
  },
  {
    titulo: "Peça faltante",
    motivoId: "PDD9940",
    motivo: "O produto chegou incompleto",
    problema:
      "Veio sem o manípulo. A caixa estava lacrada, então não foi extravio. Preciso da peça para usar o produto.",
    sku: "M08",
    produto: "Alicate pressão",
    horasAtras: 26,
    prazoHoras: 96,
  },
  {
    titulo: "Dano de transporte",
    motivoId: "PDD9943",
    motivo: "O produto chegou danificado",
    problema:
      "A caixa chegou amassada pela transportadora e o produto está com a lateral torta. Tenho as fotos da entrega.",
    sku: "B60",
    produto: "Abafador de alumínio Arauca",
    horasAtras: 22,
    prazoHoras: 72,
  },
  {
    titulo: "Voltagem trocada",
    motivoId: "PDD9944",
    motivo: "O produto não funciona como esperado",
    problema:
      "Comprei a versão 220V e veio 110V. Liguei na tomada da casa e queimou o fusível. Quero a versão certa.",
    sku: "M22",
    produto: "Argola Fuxico",
    horasAtras: 18,
    prazoHoras: 96,
  },
  {
    titulo: "Prazo curto",
    motivoId: "PDD9939",
    motivo: "O produto chegou com defeito",
    problema:
      "Produto com defeito desde a abertura da caixa. O prazo para responder acaba hoje.",
    sku: "M74",
    produto: "Espátula acabamento bolo",
    horasAtras: 47,
    prazoHoras: 48,
  },
  {
    titulo: "Devolução por arrependimento",
    motivoId: "PDD9942",
    motivo: "Quero devolver o produto",
    problema:
      "Não gostei do acabamento e quero devolver. Ainda está na caixa, sem uso.",
    sku: "G48",
    produto: "Abafador de alumínio",
    horasAtras: 14,
    prazoHoras: 120,
  },
  {
    titulo: "Cancelamento",
    motivoId: "PDD9945",
    motivo: "Quero cancelar a compra",
    problema: "Quero cancelar a compra, ainda não enviaram o produto.",
    sku: "M08",
    produto: "Alicate pressão",
    horasAtras: 10,
    prazoHoras: 72,
    tipo: "cancel_purchase",
  },
  {
    titulo: "Texto mal escrito",
    motivoId: "PDD9939",
    motivo: "O produto chegou com defeito",
    problema:
      "produto qbrou msm no 1 uso nao presta kero meu dinheiro de volta ja mandei foto 2x",
    sku: "B60",
    produto: "Abafador de alumínio Arauca",
    horasAtras: 8,
    prazoHoras: 96,
  },
  {
    titulo: "Caso repetido (mesmo pedido)",
    motivoId: "PDD9939",
    motivo: "O produto chegou com defeito",
    problema:
      "Abri outra reclamação do mesmo pedido porque a primeira não foi respondida. A solda continua solta.",
    sku: "G48",
    produto: "Abafador de alumínio",
    horasAtras: 6,
    prazoHoras: 96,
    repeteOPedidoDe: 0,
  },
  {
    titulo: "Sem dado suficiente",
    motivoId: "PDD9939",
    motivo: "O produto chegou com defeito",
    problema: "",
    sku: null,
    produto: "Item sem SKU cadastrado",
    horasAtras: 5,
    prazoHoras: 96,
  },
  {
    titulo: "Produto diferente do anunciado",
    motivoId: "PDD9941",
    motivo: "Recebi um produto diferente do anunciado",
    problema:
      "Comprei o modelo da foto do anúncio e chegou outro. A cor e o tamanho são diferentes do pedido.",
    sku: "M22",
    produto: "Argola Fuxico",
    horasAtras: 3,
    prazoHoras: 96,
  },
  {
    titulo: "Atraso na entrega",
    motivoId: "PDD9946",
    motivo: "O produto não chegou",
    problema:
      "O prazo de entrega venceu há uma semana e o rastreio não anda desde o dia 12. Quero saber onde está meu pedido.",
    sku: "M74",
    produto: "Espátula acabamento bolo",
    horasAtras: 2,
    prazoHoras: 72,
  },
];

interface ModeloShopee {
  reason: string;
  texto: string;
  sku: string | null;
  produto: string;
  horasAtras: number;
  prazoHoras: number;
  valor: number;
  status?: string;
  cancelReason?: string;
  repeteOPedidoDe?: number;
}

const MODELOS_SHOPEE: ModeloShopee[] = [
  {
    reason: "NONFUNCTIONAL",
    texto:
      "A solda da alça soltou na primeira semana. Anexei as fotos. Gostaria de devolver e receber o reembolso.",
    sku: "G48",
    produto: "Abafador de alumínio",
    horasAtras: 30,
    prazoHoras: 96,
    valor: 219.9,
  },
  {
    reason: "MISSING_ITEM",
    texto:
      "Faltou o manípulo do kit. Na embalagem só veio uma parte do que comprei. Peço o envio do que falta ou a devolução.",
    sku: "M08",
    produto: "Alicate pressão",
    horasAtras: 27,
    prazoHoras: 96,
    valor: 89.9,
  },
  {
    reason: "DAMAGED",
    texto:
      "A caixa chegou amassada e o produto está com avaria. Quero devolver para reembolso.",
    sku: "B60",
    produto: "Abafador de alumínio Arauca",
    horasAtras: 23,
    prazoHoras: 72,
    valor: 239.9,
  },
  {
    reason: "NONFUNCTIONAL",
    texto:
      "Pedi 220V e veio 110V. Ao ligar queimou o fusível do aparelho. Quero a versão certa ou o dinheiro.",
    sku: "M22",
    produto: "Argola Fuxico",
    horasAtras: 19,
    prazoHoras: 96,
    valor: 59.9,
  },
  {
    reason: "NONFUNCTIONAL",
    texto:
      "Produto com defeito desde a abertura. O prazo da devolução acaba hoje.",
    sku: "M74",
    produto: "Espátula acabamento bolo",
    horasAtras: 46,
    prazoHoras: 48,
    valor: 39.9,
  },
  {
    reason: "CHANGE_OF_MIND",
    texto: "Mudei de ideia. Quero devolver sem uso, na caixa original.",
    sku: "G48",
    produto: "Abafador de alumínio",
    horasAtras: 15,
    prazoHoras: 120,
    valor: 219.9,
  },
  {
    reason: "NOT_RECEIVED",
    texto:
      "Cancelei o pedido antes do envio e a loja ainda enviou. Não quero receber, peço o cancelamento.",
    sku: "M08",
    produto: "Alicate pressão",
    horasAtras: 11,
    prazoHoras: 72,
    valor: 89.9,
    status: "IN_CANCEL",
    cancelReason: "CUSTOMER_REQUEST",
  },
  {
    reason: "DAMAGED",
    texto:
      "produto veio qebrado nao funciona kero devolver ja mandei as foto pelo app",
    sku: "B60",
    produto: "Abafador de alumínio Arauca",
    horasAtras: 9,
    prazoHoras: 96,
    valor: 239.9,
  },
  {
    reason: "NONFUNCTIONAL",
    texto:
      "Devolução repetida: a primeira não foi aceita por engano. O defeito continua, a solda está solta.",
    sku: "G48",
    produto: "Abafador de alumínio",
    horasAtras: 7,
    prazoHoras: 96,
    valor: 219.9,
    repeteOPedidoDe: 0,
  },
  {
    reason: "OTHER",
    texto: "",
    sku: null,
    produto: "Item sem SKU cadastrado",
    horasAtras: 5,
    prazoHoras: 96,
    valor: 120,
  },
  {
    reason: "DIFFERENT_DESCRIPTION",
    texto:
      "Chegou um item diferente do anúncio. A cor e o tamanho não são os do pedido. Solicito devolução e reembolso.",
    sku: "M22",
    produto: "Argola Fuxico",
    horasAtras: 4,
    prazoHoras: 96,
    valor: 59.9,
  },
  {
    reason: "NOT_RECEIVED",
    texto:
      "O pedido não chegou e o prazo venceu. O rastreio parou há dias. Quero o reembolso.",
    sku: "M74",
    produto: "Espátula acabamento bolo",
    horasAtras: 2,
    prazoHoras: 72,
    valor: 39.9,
  },
];

const CIDADES: { cidade: string; uf: string }[] = [
  { cidade: "Campinas", uf: "SP" },
  { cidade: "Curitiba", uf: "PR" },
  { cidade: "Belo Horizonte", uf: "MG" },
  { cidade: "Goiânia", uf: "GO" },
  { cidade: "Recife", uf: "PE" },
];

interface Anexo {
  filename: string;
  url: string;
}

interface CasoML {
  claim: {
    id: number;
    resource: "order";
    resource_id: number;
    status: "opened" | "closed";
    type: string;
    stage: string;
    reason_id: string;
    date_created: string;
    last_updated: string;
    players: { role: string; user_id: number }[];
  };
  detail: {
    title: string;
    description: string;
    problem: string;
    due_date: string | null;
  };
  order: {
    id: number;
    total_amount: number;
    order_items: {
      item: { id: string; title: string; seller_sku: string | null };
      quantity: number;
      unit_price: number;
    }[];
    buyer: {
      id: number;
      nickname: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: { area_code: string; number: string };
    };
    shipping: {
      receiver_address: {
        city: { name: string };
        state: { id: string; name: string };
      };
    };
  };
  anexos: Anexo[];
  motivo: { id: string; name: string; detail: string };
}

interface CasoShopee {
  return_sn: string;
  order_sn: string;
  status: string;
  reason: string;
  text_reason: string;
  refund_amount: number;
  currency: string;
  create_time: number;
  update_time: number;
  return_ship_due_date: number;
  image: string[];
  cancel_reason?: string;
  user: { username: string; email: string };
  item: {
    item_id: number;
    item_sku: string;
    variation_sku: string;
    name: string;
    amount: number;
    item_price: number;
  }[];
}

interface TokensEmitidos {
  refresh: string;
  expiraEm: number;
}

export interface OpcoesMarketplace {
  agora?: () => Date;
  /** Espera artificial por chamada, para a linha do tempo mostrar tempos de verdade. */
  latenciaMs?: number;
}

export type CanalSim = "mercadolivre" | "shopee";

/** O marketplace simulado, com estado em memória. Uma instância por processo. */
export class MarketplaceSimulado {
  private readonly agora: () => Date;
  readonly latenciaMs: number;
  private casosML = new Map<number, CasoML>();
  private casosShopee = new Map<string, CasoShopee>();
  private serialML = 0;
  private serialShopee = 0;
  private ordemML: number[] = [];
  private ordemShopee: string[] = [];
  private tokensML = new Map<string, TokensEmitidos>();
  private refreshML = new Map<string, true>();
  private tokensShopee = new Map<string, TokensEmitidos>();
  private refreshShopee = new Map<string, true>();
  private codeML: string = CREDENCIAIS_SIMULADAS.mercadolivre.code;
  private codeShopee: string = CREDENCIAIS_SIMULADAS.shopee.code;

  constructor(opcoes: OpcoesMarketplace = {}) {
    this.agora = opcoes.agora ?? (() => new Date());
    this.latenciaMs = opcoes.latenciaMs ?? 0;
    this.reiniciar();
  }

  /** Volta ao conjunto inicial: 12 casos por canal, sem tokens emitidos. */
  reiniciar(): void {
    this.casosML.clear();
    this.casosShopee.clear();
    this.ordemML = [];
    this.ordemShopee = [];
    this.serialML = 0;
    this.serialShopee = 0;
    this.tokensML.clear();
    this.refreshML.clear();
    this.tokensShopee.clear();
    this.refreshShopee.clear();
    this.codeML = CREDENCIAIS_SIMULADAS.mercadolivre.code;
    this.codeShopee = CREDENCIAIS_SIMULADAS.shopee.code;
    for (let i = 0; i < MODELOS_ML.length; i++) this.criarML(i);
    for (let i = 0; i < MODELOS_SHOPEE.length; i++) this.criarShopee(i);
  }

  // ----- Criação e mudança de casos -----

  private criarML(indice: number): number {
    const m = MODELOS_ML[indice % MODELOS_ML.length];
    const n = this.serialML++;
    const agora = this.agora().getTime();
    const criada = new Date(agora - m.horasAtras * HORA_MS);
    const claimId = 5_108_684_400 + n;
    const origem =
      m.repeteOPedidoDe !== undefined
        ? this.casosML.get(this.ordemML[m.repeteOPedidoDe])
        : undefined;
    const pedidoId = origem?.order.id ?? 2_000_000_900_000 + n;
    const local = CIDADES[n % CIDADES.length];
    const preco = 289.9;
    const caso: CasoML = {
      claim: {
        id: claimId,
        resource: "order",
        resource_id: pedidoId,
        status: "opened",
        type: m.tipo ?? "mediations",
        stage: "claim",
        reason_id: m.motivoId,
        date_created: criada.toISOString(),
        last_updated: criada.toISOString(),
        players: [
          { role: "complainant", user_id: 900_000_000 + n },
          {
            role: "respondent",
            user_id: CREDENCIAIS_SIMULADAS.mercadolivre.userId,
          },
        ],
      },
      detail: {
        title: m.titulo,
        description: m.motivo,
        problem: m.problema,
        due_date: new Date(
          criada.getTime() + m.prazoHoras * HORA_MS,
        ).toISOString(),
      },
      order: {
        id: pedidoId,
        total_amount: preco,
        order_items: [
          {
            item: {
              id: `MLB${preencher(n, 10)}`,
              title: m.produto,
              seller_sku: m.sku,
            },
            quantity: 1,
            unit_price: preco,
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
      // O levantamento não confirma o contrato dos anexos: conferir no console do Mercado Livre.
      anexos:
        m.sku && indice % 3 === 0
          ? [
              {
                filename: `foto-${claimId}-1.jpg`,
                url: `https://exemplo.invalid/ml/${claimId}/1.jpg`,
              },
              {
                filename: `foto-${claimId}-2.jpg`,
                url: `https://exemplo.invalid/ml/${claimId}/2.jpg`,
              },
            ]
          : [],
      motivo: { id: m.motivoId, name: m.motivo, detail: m.titulo },
    };
    this.casosML.set(claimId, caso);
    this.ordemML.push(claimId);
    return claimId;
  }

  private criarShopee(indice: number): string {
    const m = MODELOS_SHOPEE[indice % MODELOS_SHOPEE.length];
    const n = this.serialShopee++;
    const agora = this.agora().getTime();
    const criada = Math.floor((agora - m.horasAtras * HORA_MS) / 1000);
    const sn = `TREINO${preencher(n + 1, 9)}`;
    const origem =
      m.repeteOPedidoDe !== undefined
        ? this.casosShopee.get(this.ordemShopee[m.repeteOPedidoDe])
        : undefined;
    const caso: CasoShopee = {
      return_sn: sn,
      order_sn: origem?.order_sn ?? `2610TREINO${preencher(n + 1, 6)}`,
      status: m.status ?? "REQUESTED",
      reason: m.reason,
      text_reason: m.texto,
      refund_amount: m.valor,
      currency: "BRL",
      create_time: criada,
      update_time: criada,
      return_ship_due_date: criada + m.prazoHoras * 3600,
      image:
        m.sku && indice % 3 === 0
          ? [
              `https://exemplo.invalid/shopee/${sn}/1.jpg`,
              `https://exemplo.invalid/shopee/${sn}/2.jpg`,
            ]
          : [],
      ...(m.cancelReason ? { cancel_reason: m.cancelReason } : {}),
      user: {
        username: `treino_comprador_${preencher(n + 1)}`,
        // A Shopee entrega o e-mail do comprador mascarado.
        email: mascararEmail(`treino${preencher(n + 1)}@exemplo.invalid`),
      },
      item: [
        {
          item_id: 7_000_000_000 + n,
          item_sku: m.sku ?? "",
          variation_sku: "",
          name: m.produto,
          amount: 1,
          item_price: m.valor,
        },
      ],
    };
    this.casosShopee.set(sn, caso);
    this.ordemShopee.push(sn);
    return sn;
  }

  /** Um caso novo no canal, do próximo modelo da lista. Devolve o id do canal. */
  novoCaso(canal: CanalSim): string {
    if (canal === "mercadolivre") {
      return String(this.criarML(this.serialML));
    }
    return this.criarShopee(this.serialShopee);
  }

  ids(canal: CanalSim): string[] {
    return canal === "mercadolivre"
      ? this.ordemML.map(String)
      : [...this.ordemShopee];
  }

  ultimoId(canal: CanalSim): string | null {
    const l = this.ids(canal);
    return l.length ? l[l.length - 1] : null;
  }

  /** Muda um caso no canal: encerra, estica o prazo ou acrescenta texto do comprador. */
  atualizar(
    canal: CanalSim,
    id: string,
    mudanca: {
      encerrar?: boolean;
      prazoMaisDias?: number;
      acrescentar?: string;
    },
  ): boolean {
    const agora = this.agora();
    if (canal === "mercadolivre") {
      const c = this.casosML.get(Number(id));
      if (!c) return false;
      if (mudanca.encerrar) c.claim.status = "closed";
      if (mudanca.prazoMaisDias && c.detail.due_date) {
        c.detail.due_date = new Date(
          new Date(c.detail.due_date).getTime() +
            mudanca.prazoMaisDias * 86_400_000,
        ).toISOString();
      }
      if (mudanca.acrescentar) {
        c.detail.problem = `${c.detail.problem} ${mudanca.acrescentar}`.trim();
      }
      c.claim.last_updated = agora.toISOString();
      return true;
    }
    const c = this.casosShopee.get(id);
    if (!c) return false;
    if (mudanca.encerrar) c.status = "COMPLETED";
    if (mudanca.prazoMaisDias) {
      c.return_ship_due_date += mudanca.prazoMaisDias * 86_400;
    }
    if (mudanca.acrescentar) {
      c.text_reason = `${c.text_reason} ${mudanca.acrescentar}`.trim();
    }
    c.update_time = Math.floor(agora.getTime() / 1000);
    return true;
  }

  // ----- Avisos que o canal enviaria -----

  /** O POST do tópico post_purchase. Assinatura simplificada (HMAC do corpo): conferir o formato real no console. */
  avisoML(claimId: string): { corpo: string; assinatura: string } {
    const corpo = JSON.stringify({
      resource: `post-purchase/v1/claims/${claimId}`,
      user_id: CREDENCIAIS_SIMULADAS.mercadolivre.userId,
      topic: "post_purchase",
      actions: ["claims"],
      sent: this.agora().toISOString(),
    });
    return {
      corpo,
      assinatura: hmacHex(CREDENCIAIS_SIMULADAS.mercadolivre.segredo, corpo),
    };
  }

  /** O push 29: traz o número e o que mudou, assinado no header Authorization (HMAC de url|corpo). */
  pushShopee(
    returnSn: string,
    url: string,
    mudanca: { campo: string; antigo: string; novo: string } = {
      campo: "return_status",
      antigo: "REQUESTED",
      novo: "JUDGING",
    },
  ): { corpo: string; authorization: string } {
    const c = this.casosShopee.get(returnSn);
    const ts = Math.floor(this.agora().getTime() / 1000);
    const corpo = JSON.stringify({
      code: 29,
      shop_id: CREDENCIAIS_SIMULADAS.shopee.shopId,
      timestamp: ts,
      data: {
        order_sn: c?.order_sn ?? "",
        return_sn: returnSn,
        updated_values: [
          {
            update_field: mudanca.campo,
            old_value: mudanca.antigo,
            new_value: mudanca.novo,
            update_time: ts,
          },
        ],
      },
    });
    return {
      corpo,
      authorization: hmacHex(
        CREDENCIAIS_SIMULADAS.shopee.partnerKey,
        `${url}|${corpo}`,
      ),
    };
  }

  /** Gera um code novo (os codes são de uso único), como o redirecionamento da autorização faria. */
  emitirCode(canal: CanalSim): string {
    const code = `${canal === "mercadolivre" ? "TG" : "sh"}-${randomBytes(6).toString("hex")}`;
    if (canal === "mercadolivre") this.codeML = code;
    else this.codeShopee = code;
    return code;
  }

  codeAtual(canal: CanalSim): string {
    return canal === "mercadolivre" ? this.codeML : this.codeShopee;
  }

  // ----- HTTP -----

  /** `fetch` em memória, para os testes e para o uso sem rede. */
  get fetch(): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const cab: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => {
        cab[k.toLowerCase()] = v;
      });
      const r = this.tratar({
        metodo: init?.method ?? "GET",
        url,
        cabecalhos: cab,
        corpo: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(JSON.stringify(r.json), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  tratar(req: PedidoSimulado): RespostaSimulada {
    const p = req.url.pathname;
    if (p === "/oauth/token") return this.oauthML(req);
    if (p.startsWith("/post-purchase/") || p.startsWith("/orders/")) {
      return this.apiML(req);
    }
    if (p.startsWith("/api/v2/")) return this.apiShopee(req);
    return {
      status: 404,
      json: { message: "Recurso não encontrado no marketplace simulado." },
    };
  }

  // ----- Mercado Livre -----

  private emitirTokensML(): Record<string, unknown> {
    const access = `APP_USR-sim-${randomBytes(8).toString("hex")}`;
    const refresh = `TG-sim-${randomBytes(8).toString("hex")}`;
    this.tokensML.set(access, {
      refresh,
      expiraEm: this.agora().getTime() + SEGUNDOS_TOKEN_ML * 1000,
    });
    this.refreshML.set(refresh, true);
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: SEGUNDOS_TOKEN_ML,
      scope: "offline_access read write",
      user_id: CREDENCIAIS_SIMULADAS.mercadolivre.userId,
      refresh_token: refresh,
    };
  }

  private oauthML(req: PedidoSimulado): RespostaSimulada {
    const cred = CREDENCIAIS_SIMULADAS.mercadolivre;
    if (req.metodo.toUpperCase() !== "POST") {
      return { status: 405, json: { message: "Use POST." } };
    }
    if (
      !(req.cabecalhos["content-type"] ?? "").includes(
        "application/x-www-form-urlencoded",
      )
    ) {
      return {
        status: 400,
        json: {
          error: "invalid_request",
          message: "Os dados vão no corpo, em x-www-form-urlencoded.",
        },
      };
    }
    const f = new URLSearchParams(req.corpo);
    if (
      f.get("client_id") !== cred.appId ||
      !iguais(f.get("client_secret") ?? "", cred.segredo)
    ) {
      return {
        status: 401,
        json: {
          error: "invalid_client",
          message: "client_id ou client_secret inválido.",
        },
      };
    }
    const grant = f.get("grant_type");
    if (grant === "authorization_code") {
      if (!f.get("redirect_uri")) {
        return {
          status: 400,
          json: { error: "invalid_request", message: "Falta redirect_uri." },
        };
      }
      if (f.get("code") !== this.codeML) {
        return {
          status: 400,
          json: {
            error: "invalid_grant",
            message: "Code inválido ou já usado.",
          },
        };
      }
      this.codeML = "";
      return { status: 200, json: this.emitirTokensML() };
    }
    if (grant === "refresh_token") {
      const r = f.get("refresh_token") ?? "";
      if (!this.refreshML.has(r)) {
        return {
          status: 400,
          json: {
            error: "invalid_grant",
            message: "refresh_token inválido ou já usado.",
          },
        };
      }
      this.refreshML.delete(r);
      return { status: 200, json: this.emitirTokensML() };
    }
    return {
      status: 400,
      json: {
        error: "unsupported_grant_type",
        message: "grant_type não aceito.",
      },
    };
  }

  private autorizadoML(req: PedidoSimulado): boolean {
    const h = req.cabecalhos.authorization ?? "";
    const t = this.tokensML.get(h.replace(/^Bearer\s+/i, ""));
    return !!t && t.expiraEm > this.agora().getTime();
  }

  private apiML(req: PedidoSimulado): RespostaSimulada {
    if (!this.autorizadoML(req)) {
      return {
        status: 401,
        json: {
          message: "invalid_token",
          error: "not_found",
          status: 401,
          cause: [],
        },
      };
    }
    const p = req.url.pathname;
    const q = req.url.searchParams;

    if (p === "/post-purchase/v1/claims/search") {
      const cred = CREDENCIAIS_SIMULADAS.mercadolivre;
      if (
        q.get("players.user_id") !== String(cred.userId) ||
        q.get("players.role") !== "respondent"
      ) {
        return {
          status: 400,
          json: {
            message: "Informe players.user_id e players.role=respondent.",
            error: "bad_request",
            status: 400,
          },
        };
      }
      const limit = Number(q.get("limit") ?? 30);
      const offset = Number(q.get("offset") ?? 0);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !(offset >= 0) ||
        offset + limit >= 10_000
      ) {
        return {
          status: 400,
          json: {
            message:
              "limit vai até 100 e offset + limit fica abaixo de 10.000.",
            error: "bad_request",
            status: 400,
          },
        };
      }
      const status = q.get("status");
      const todos = [...this.casosML.values()]
        .filter((c) => !status || c.claim.status === status)
        .sort((a, b) =>
          b.claim.date_created.localeCompare(a.claim.date_created),
        );
      return {
        status: 200,
        json: {
          data: todos.slice(offset, offset + limit).map((c) => c.claim),
          paging: { total: todos.length, limit, offset },
        },
      };
    }

    const motivo =
      /^\/post-purchase\/v1\/claims\/reasons\/([A-Za-z0-9]+)$/.exec(p);
    if (motivo) {
      const c = [...this.casosML.values()].find(
        (x) => x.motivo.id === motivo[1],
      );
      return c
        ? { status: 200, json: c.motivo }
        : {
            status: 404,
            json: {
              message: "Motivo não encontrado.",
              error: "not_found",
              status: 404,
            },
          };
    }

    const claim =
      /^\/post-purchase\/v1\/claims\/(\d+)(?:\/(detail|attachments))?$/.exec(p);
    if (claim) {
      const c = this.casosML.get(Number(claim[1]));
      if (!c) {
        return {
          status: 404,
          json: {
            message: "Reclamação não encontrada.",
            error: "not_found",
            status: 404,
          },
        };
      }
      if (claim[2] === "detail") return { status: 200, json: c.detail };
      if (claim[2] === "attachments") return { status: 200, json: c.anexos };
      return { status: 200, json: c.claim };
    }

    const pedido = /^\/orders\/(\d+)$/.exec(p);
    if (pedido) {
      const c = [...this.casosML.values()].find(
        (x) => x.order.id === Number(pedido[1]),
      );
      return c
        ? { status: 200, json: c.order }
        : {
            status: 404,
            json: {
              message: "Pedido não encontrado.",
              error: "not_found",
              status: 404,
            },
          };
    }
    return {
      status: 404,
      json: {
        message: "Recurso não encontrado.",
        error: "not_found",
        status: 404,
      },
    };
  }

  // ----- Shopee -----

  private erroShopee(
    status: number,
    error: string,
    message: string,
  ): RespostaSimulada {
    return {
      status,
      json: { request_id: randomBytes(6).toString("hex"), error, message },
    };
  }

  private emitirTokensShopee(): Record<string, unknown> {
    const access = `sim-access-${randomBytes(8).toString("hex")}`;
    const refresh = `sim-refresh-${randomBytes(8).toString("hex")}`;
    this.tokensShopee.set(access, {
      refresh,
      expiraEm: this.agora().getTime() + SEGUNDOS_TOKEN_SHOPEE * 1000,
    });
    this.refreshShopee.set(refresh, true);
    return {
      request_id: randomBytes(6).toString("hex"),
      error: "",
      message: "",
      access_token: access,
      refresh_token: refresh,
      expire_in: SEGUNDOS_TOKEN_SHOPEE,
      shop_id: CREDENCIAIS_SIMULADAS.shopee.shopId,
      partner_id: CREDENCIAIS_SIMULADAS.shopee.partnerId,
    };
  }

  private apiShopee(req: PedidoSimulado): RespostaSimulada {
    const cred = CREDENCIAIS_SIMULADAS.shopee;
    const caminho = req.url.pathname;
    const q = req.url.searchParams;
    if (req.metodo.toUpperCase() !== "POST") {
      return this.erroShopee(405, "error_method", "Use POST.");
    }
    const ts = Number(q.get("timestamp"));
    const agoraS = Math.floor(this.agora().getTime() / 1000);
    if (!Number.isFinite(ts) || Math.abs(agoraS - ts) > JANELA_ASSINATURA_S) {
      return this.erroShopee(
        403,
        "error_auth",
        "Timestamp fora da janela de 5 minutos.",
      );
    }
    if (q.get("partner_id") !== String(cred.partnerId)) {
      return this.erroShopee(403, "error_auth", "partner_id inválido.");
    }

    const semToken =
      caminho === "/api/v2/auth/token/get" ||
      caminho === "/api/v2/auth/access_token/get";
    const accessToken = q.get("access_token") ?? "";
    const shopId = q.get("shop_id") ?? "";
    const esperada = assinaturaShopee(cred.partnerKey, {
      partnerId: cred.partnerId,
      caminho,
      timestamp: ts,
      ...(semToken ? {} : { accessToken, shopId }),
    });
    if (!iguais(q.get("sign") ?? "", esperada)) {
      return this.erroShopee(403, "error_sign", "Wrong sign.");
    }

    let corpo: Record<string, unknown> = {};
    try {
      corpo = req.corpo
        ? (JSON.parse(req.corpo) as Record<string, unknown>)
        : {};
    } catch {
      return this.erroShopee(400, "error_param", "Corpo inválido.");
    }

    if (caminho === "/api/v2/auth/token/get") {
      if (corpo.code !== this.codeShopee || corpo.shop_id !== cred.shopId) {
        return this.erroShopee(
          403,
          "error_auth",
          "Code inválido, já usado ou de outra loja.",
        );
      }
      this.codeShopee = "";
      return { status: 200, json: this.emitirTokensShopee() };
    }
    if (caminho === "/api/v2/auth/access_token/get") {
      const r = String(corpo.refresh_token ?? "");
      if (!this.refreshShopee.has(r) || corpo.shop_id !== cred.shopId) {
        return this.erroShopee(
          403,
          "error_auth",
          "refresh_token inválido ou já usado.",
        );
      }
      this.refreshShopee.delete(r);
      return { status: 200, json: this.emitirTokensShopee() };
    }

    const t = this.tokensShopee.get(accessToken);
    if (
      !t ||
      t.expiraEm <= this.agora().getTime() ||
      shopId !== String(cred.shopId)
    ) {
      return this.erroShopee(403, "error_auth", "Invalid access_token.");
    }

    if (caminho === "/api/v2/returns/get_return_list") {
      const pagina = Number(corpo.page_no ?? 1);
      const tamanho = Number(corpo.page_size ?? 50);
      const temCriacao =
        corpo.create_time_from !== undefined &&
        corpo.create_time_to !== undefined;
      const temUpdate =
        corpo.update_time_from !== undefined &&
        corpo.update_time_to !== undefined;
      if (
        !Number.isInteger(pagina) ||
        pagina < 1 ||
        !Number.isInteger(tamanho) ||
        tamanho < 1 ||
        tamanho > 100 ||
        (!temCriacao && !temUpdate)
      ) {
        return this.erroShopee(
          400,
          "error_param",
          "Informe page_no, page_size (até 100) e uma janela de datas.",
        );
      }
      const de = Number(
        temCriacao ? corpo.create_time_from : corpo.update_time_from,
      );
      const ate = Number(
        temCriacao ? corpo.create_time_to : corpo.update_time_to,
      );
      const campo = temCriacao ? "create_time" : "update_time";
      const todos = [...this.casosShopee.values()]
        .filter((c) => c[campo] >= de && c[campo] <= ate)
        .sort((a, b) => b.create_time - a.create_time);
      const fatia = todos.slice((pagina - 1) * tamanho, pagina * tamanho);
      return {
        status: 200,
        json: {
          request_id: randomBytes(6).toString("hex"),
          error: "",
          message: "",
          response: { more: pagina * tamanho < todos.length, return: fatia },
        },
      };
    }
    if (caminho === "/api/v2/returns/get_return_detail") {
      const c = this.casosShopee.get(String(corpo.return_sn ?? ""));
      if (!c)
        return this.erroShopee(
          404,
          "error_not_found",
          "Devolução não encontrada.",
        );
      return {
        status: 200,
        json: {
          request_id: randomBytes(6).toString("hex"),
          error: "",
          message: "",
          response: c,
        },
      };
    }
    return this.erroShopee(404, "error_not_found", "Caminho não encontrado.");
  }
}
