import { randomUUID } from "node:crypto";
import { avisoMLValido, pushShopeeValido } from "./canal-assinatura";
import type {
  CanalReal,
  CasoCompletoML,
  ClienteML,
  ClienteShopee,
  DevolucaoShopee,
} from "./canal-clientes";
import type { RegistroChamadas } from "./canal-registro";
import { hojeEmSaoPaulo, inserir, type Transacao, timestamp } from "./treino";

/**
 * Captura dos canais: recebe o aviso, busca a reclamação inteira na API do canal, mapeia para a
 * reclamação em Triagem e grava. A chave externa (`claim.id` ou `return_sn`) evita duplicar, e o
 * mesmo caso que volta atualiza a reclamação. Cada campo que veio do canal fica marcado em
 * `camposCanal` e só muda com motivo (ver `ServicoEscrita`).
 */

export const NOME_DO_CANAL: Record<CanalReal, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

export interface CasoNormalizado {
  canal: CanalReal;
  /** claim.id (Mercado Livre) ou return_sn (Shopee). */
  idExterno: string;
  pedido: string;
  sku: string;
  texto: string;
  motivo: string;
  /** AAAA-MM-DD. */
  prazoMarketplace: string | null;
  valor: number;
  status: string;
  /** ISO 8601 de quando o caso foi aberto no canal. */
  abertoEm: string;
  /** Muda a cada atualização do caso no canal; é o que diz se algo mudou. */
  versao: string;
  comprador: {
    nome: string;
    email: string;
    telefone: string;
    cidade: string;
    uf: string;
  };
  fotos: { nome: string; url: string }[];
  /** O que o canal não trouxe (texto, SKU), para a pessoa saber que falta. */
  faltou: string[];
  bruto: unknown;
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

export function mapearML(c: CasoCompletoML): CasoNormalizado {
  const order = objeto(c.order);
  const itens = Array.isArray(order.order_items) ? order.order_items : [];
  const item = objeto(objeto(itens[0]).item);
  const comprador = objeto(order.buyer);
  const fone = objeto(comprador.phone);
  const endereco = objeto(objeto(order.shipping).receiver_address);
  const sku = texto(item.seller_sku).trim();
  const problema = texto(c.detail.problem).trim();
  const prazo = texto(c.detail.due_date);
  const faltou: string[] = [];
  if (!problema) faltou.push("texto do comprador");
  if (!sku) faltou.push("SKU");
  return {
    canal: "mercadolivre",
    idExterno: String(c.claim.id),
    pedido: c.claim.resource === "order" ? String(c.claim.resource_id) : "",
    sku,
    texto: problema,
    motivo: texto(c.motivo?.name) || texto(c.detail.description),
    prazoMarketplace: /^\d{4}-\d{2}-\d{2}/.test(prazo)
      ? prazo.slice(0, 10)
      : null,
    valor: numero(order.total_amount),
    status: c.claim.status,
    abertoEm: c.claim.date_created,
    versao: c.claim.last_updated,
    comprador: {
      nome: [texto(comprador.first_name), texto(comprador.last_name)]
        .filter(Boolean)
        .join(" "),
      email: texto(comprador.email),
      telefone: fone.number
        ? `(${texto(fone.area_code)}) ${texto(fone.number)}`
        : "",
      cidade: texto(objeto(endereco.city).name),
      uf: texto(objeto(endereco.state).name),
    },
    fotos: c.anexos.flatMap((a) =>
      a.url ? [{ nome: a.filename ?? "foto", url: a.url }] : [],
    ),
    faltou,
    bruto: c,
  };
}

export function mapearShopee(d: DevolucaoShopee): CasoNormalizado {
  const item = d.item?.[0] ?? {};
  const sku = (item.item_sku || item.variation_sku || "").trim();
  const problema = (d.text_reason ?? "").trim();
  const faltou: string[] = [];
  if (!problema) faltou.push("texto do comprador");
  if (!sku) faltou.push("SKU");
  return {
    canal: "shopee",
    idExterno: d.return_sn,
    pedido: d.order_sn,
    sku,
    texto: problema,
    motivo: [d.reason, d.cancel_reason].filter(Boolean).join(" / "),
    prazoMarketplace: d.return_ship_due_date
      ? new Date(d.return_ship_due_date * 1000).toISOString().slice(0, 10)
      : null,
    valor: numero(d.refund_amount),
    status: d.status,
    abertoEm: new Date((d.create_time ?? 0) * 1000).toISOString(),
    versao: String(d.update_time ?? d.create_time ?? ""),
    comprador: {
      nome: d.user?.username ?? "",
      // A Shopee entrega o e-mail mascarado; é o que fica guardado.
      email: d.user?.email ?? "",
      telefone: "",
      cidade: "",
      uf: "",
    },
    fotos: (d.image ?? []).map((url, i) => ({ nome: `foto-${i + 1}`, url })),
    faltou,
    bruto: d,
  };
}

// ---------- Gravação ----------

export type AcaoDaCaptura = "criada" | "atualizada" | "duplicada";

export interface ResultadoGravacao {
  acao: AcaoDaCaptura;
  reclamacaoId: string;
}

export interface RepositorioCaptura {
  /** Versão que já está gravada para o caso, ou null se nunca chegou. */
  versaoGravada(
    canal: CanalReal,
    idExterno: string,
    simulado: boolean,
  ): Promise<string | null>;
  gravarCaso(
    caso: CasoNormalizado,
    opcoes: { simulado: boolean; agora: Date },
  ): Promise<ResultadoGravacao>;
}

const chaveExterna = (id: string, simulado: boolean) =>
  simulado ? `treino-${id}` : id;

/** Campos (nomes de `compararEstados`) que, se vieram do canal, só mudam com motivo. */
export function camposQueVieramDoCanal(
  caso: CasoNormalizado,
  achouProduto: boolean,
): string[] {
  const c: string[] = ["protocoloExterno"];
  if (caso.texto) c.push("descricao");
  if (caso.pedido) c.push("pedido");
  if (achouProduto) c.push("produtoId");
  if (caso.comprador.nome) c.push("clienteNome");
  if (caso.comprador.cidade) c.push("cidade");
  if (caso.comprador.uf) c.push("uf");
  if (caso.prazoMarketplace) c.push("prazoMarketplace");
  return c;
}

/** SQL parametrizado por um executor: roda igual na API (Prisma) e nos testes (PGlite). */
export class RepositorioCapturaSql implements RepositorioCaptura {
  constructor(private readonly transacao: Transacao) {}

  versaoGravada(canal: CanalReal, idExterno: string, simulado: boolean) {
    return this.transacao(async (exec) => {
      const r = await exec(
        `SELECT c.payload->>'versao' AS versao
           FROM capturas_canal c JOIN canais k ON k.id = c."canalId"
          WHERE lower(k.nome) = lower($1) AND c."idExterno" = $2`,
        [NOME_DO_CANAL[canal], chaveExterna(idExterno, simulado)],
      );
      return r.length ? String(r[0].versao ?? "") : null;
    });
  }

  gravarCaso(
    caso: CasoNormalizado,
    opcoes: { simulado: boolean; agora: Date },
  ): Promise<ResultadoGravacao> {
    return this.transacao(async (exec) => {
      const nomeCanal = NOME_DO_CANAL[caso.canal];
      let canalId: string;
      const achado = await exec(
        `SELECT id FROM canais WHERE lower(nome) = lower($1)`,
        [nomeCanal],
      );
      if (achado.length) canalId = String(achado[0].id);
      else {
        canalId = `canal-${nomeCanal.toLowerCase().replace(/\s+/g, "-")}`;
        await inserir(exec, "canais", [
          ["id", canalId],
          ["nome", nomeCanal],
          ["tipo", "marketplace", '"CanalTipo"'],
          ["ativo", true, "boolean"],
        ]);
      }

      const chave = chaveExterna(caso.idExterno, opcoes.simulado);
      const payload = JSON.stringify({
        canal: caso.canal,
        versao: caso.versao,
        status: caso.status,
        caso: caso.bruto,
      });
      const agoraTs = timestamp(opcoes.agora);

      const existente = await exec(
        `SELECT id, "reclamacaoId", payload->>'versao' AS versao
           FROM capturas_canal WHERE "canalId" = $1 AND "idExterno" = $2`,
        [canalId, chave],
      );

      if (existente.length) {
        const e = existente[0];
        const reclamacaoId = String(e.reclamacaoId ?? "");
        if (String(e.versao ?? "") === caso.versao) {
          return { acao: "duplicada", reclamacaoId };
        }
        await exec(
          `UPDATE capturas_canal SET payload = $1::jsonb, status = 'aceito'::"CapturaStatus" WHERE id = $2`,
          [payload, e.id],
        );
        if (reclamacaoId) {
          // O prazo do canal vale sempre; o texto só muda enquanto ninguém do SAC mexeu na triagem.
          await exec(
            `UPDATE reclamacoes
                SET "prazoMarketplace" = $1::date,
                    descricao = CASE WHEN estado IN ('triagem', 'aguardando_cliente') AND $2 <> '' THEN $2 ELSE descricao END,
                    "alteradoEm" = $3::timestamp
              WHERE id = $4`,
            [caso.prazoMarketplace, caso.texto, agoraTs, reclamacaoId],
          );
          for (const [i, f] of caso.fotos.entries()) {
            const ja = await exec(
              `SELECT 1 FROM reclamacao_fotos WHERE "reclamacaoId" = $1 AND caminho = $2`,
              [reclamacaoId, `canal:${f.url}`],
            );
            if (ja.length === 0) {
              await inserir(exec, "reclamacao_fotos", [
                ["id", `foto-${randomUUID()}`],
                ["reclamacaoId", reclamacaoId],
                ["nome", f.nome || `foto-${i + 1}`],
                ["caminho", `canal:${f.url}`],
              ]);
            }
          }
        }
        return { acao: "atualizada", reclamacaoId };
      }

      // Caso novo: produto pelo SKU (direto ou pelo de-para), marca pela categoria do produto.
      let produto: { id: string; categoria: string } | null = null;
      if (caso.sku) {
        const p = await exec(
          `SELECT id, categoria FROM produtos WHERE codigo = $1`,
          [caso.sku],
        );
        const d = p.length
          ? p
          : await exec(
              `SELECT p.id, p.categoria FROM sku_depara d JOIN produtos p ON p.codigo = d."skuDestino" WHERE d."skuOrigem" = $1`,
              [caso.sku],
            );
        if (d.length) {
          produto = { id: String(d[0].id), categoria: String(d[0].categoria) };
        }
      }
      const cat = produto?.categoria.toUpperCase() ?? "";
      const nomeMarca = cat.includes("ARTMAQ")
        ? "ARTMAQ"
        : cat.includes("ARAUCA")
          ? "ARAUCA"
          : "AISA";
      const marca = produto
        ? await exec(`SELECT id FROM marcas WHERE upper(nome) = $1`, [
            nomeMarca,
          ])
        : [];

      const id = `canal-${randomUUID()}`;
      const abertura = hojeEmSaoPaulo(new Date(caso.abertoEm));
      const observacao = [
        caso.motivo && `Motivo no canal: ${caso.motivo}.`,
        caso.faltou.length > 0 &&
          `O canal não trouxe: ${caso.faltou.join(", ")}.`,
      ]
        .filter(Boolean)
        .join(" ");
      const linha = await exec(
        `INSERT INTO reclamacoes
           (id, "canalId", "marcaId", "produtoId", estado, "estadoDesde", "prazoMarketplace", "dataAbertura",
            descricao, observacao, pedido, "clienteNome", cidade, uf, "protocoloExterno",
            "origemRegistro", treino, "camposCanal", "criadoEm", "alteradoEm")
         VALUES ($1, $2, $3, $4, 'triagem'::"EstadoJornada", $5::timestamp, $6::date, $7::date,
            $8, $9, $10, $11, $12, $13, $14, 'canal', $15::boolean, $16::jsonb, $5::timestamp, $5::timestamp)
         RETURNING numero`,
        [
          id,
          canalId,
          marca.length ? String(marca[0].id) : null,
          produto?.id ?? null,
          agoraTs,
          caso.prazoMarketplace,
          abertura,
          caso.texto || "(o canal não enviou o texto do comprador)",
          observacao,
          caso.pedido,
          caso.comprador.nome,
          caso.comprador.cidade,
          caso.comprador.uf,
          caso.idExterno,
          opcoes.simulado,
          JSON.stringify(camposQueVieramDoCanal(caso, produto !== null)),
        ],
      );
      void linha;
      await inserir(exec, "custos", [
        ["reclamacaoId", id],
        ["estorno", caso.valor, "numeric"],
      ]);
      await inserir(exec, "estado_historico", [
        ["id", `${id}-h1`],
        ["reclamacaoId", id],
        ["de", null, '"EstadoJornada"'],
        ["para", "triagem", '"EstadoJornada"'],
        ["quando", agoraTs, "timestamp"],
        ["autorNome", `Canal ${nomeCanal}`],
        ["origem", "canal"],
      ]);
      for (const [i, f] of caso.fotos.entries()) {
        await inserir(exec, "reclamacao_fotos", [
          ["id", `foto-${randomUUID()}`],
          ["reclamacaoId", id],
          ["nome", f.nome || `foto-${i + 1}`],
          ["caminho", `canal:${f.url}`],
        ]);
      }
      await inserir(exec, "capturas_canal", [
        ["id", `cap-${randomUUID()}`],
        ["canalId", canalId],
        ["idExterno", chave],
        ["payload", payload, "jsonb"],
        ["status", "aceito", '"CapturaStatus"'],
        ["reclamacaoId", id],
        ["capturadoEm", agoraTs, "timestamp"],
      ]);
      return { acao: "criada", reclamacaoId: id };
    });
  }
}

// ---------- Fila ----------

export interface JobCaptura {
  canal: CanalReal;
  id: string;
}

/** Fila simples em memória, uma coisa de cada vez: o aviso responde logo e o trabalho vem depois. */
export class FilaCaptura {
  private aguardando = new Set<string>();
  private cadeia: Promise<void> = Promise.resolve();

  constructor(
    private readonly tratar: (j: JobCaptura) => Promise<void>,
    private readonly registro?: RegistroChamadas,
    private readonly tentativas = 3,
    private readonly espera = (n: number) => 200 * 2 ** n,
  ) {}

  enfileirar(j: JobCaptura): boolean {
    const k = `${j.canal}:${j.id}`;
    if (this.aguardando.has(k)) {
      this.registro?.registrar({
        canal: j.canal,
        etapa: "aviso repetido ignorado na fila",
        detalhe: `o caso ${j.id} já está aguardando processamento`,
        ok: true,
      });
      return false;
    }
    this.aguardando.add(k);
    this.cadeia = this.cadeia.then(() => this.executar(k, j));
    return true;
  }

  private async executar(k: string, j: JobCaptura): Promise<void> {
    this.aguardando.delete(k);
    for (let n = 0; n < this.tentativas; n++) {
      try {
        await this.tratar(j);
        return;
      } catch {
        if (n + 1 < this.tentativas) {
          await new Promise((r) => setTimeout(r, this.espera(n)));
        }
      }
    }
    this.registro?.registrar({
      canal: j.canal,
      etapa: "desistiu do caso",
      detalhe: `o caso ${j.id} falhou ${this.tentativas} vezes; a busca periódica tenta de novo`,
      ok: false,
    });
  }

  /** Espera a fila esvaziar (os testes e a tela de simulação usam). */
  async ocioso(): Promise<void> {
    let c: Promise<void>;
    do {
      c = this.cadeia;
      await c;
    } while (c !== this.cadeia);
  }
}

// ---------- Serviço ----------

export interface ContextoCaptura {
  ml: ClienteML;
  shopee: ClienteShopee;
  segredoML: string;
  partnerKey: string;
  /** O canal aponta para o marketplace simulado: o que entra dele é treino. */
  simulado: Record<CanalReal, boolean>;
}

export type RespostaAviso = { status: 200 | 400 | 401 };

const JANELA_BUSCA_S = 7 * 86_400;

export class ServicoCaptura {
  readonly fila: FilaCaptura;

  constructor(
    private readonly contexto: () => Promise<ContextoCaptura>,
    private readonly repo: RepositorioCaptura,
    readonly registro: RegistroChamadas,
    private readonly agora: () => Date = () => new Date(),
    opcoesFila: {
      tentativas?: number;
      espera?: (n: number) => number;
      aoGravar?: (r: ResultadoGravacao) => Promise<void> | void;
    } = {},
  ) {
    this.fila = new FilaCaptura(
      async (j) => {
        const r = await this.processar(j);
        await opcoesFila.aoGravar?.(r);
      },
      registro,
      opcoesFila.tentativas,
      opcoesFila.espera,
    );
  }

  /** O POST do Mercado Livre (tópico post_purchase). Confere a assinatura e só enfileira. */
  async receberAvisoML(
    corpoCru: string,
    assinatura: string | undefined,
    partes: { dataId?: string; requestId?: string } = {},
  ): Promise<RespostaAviso> {
    const ctx = await this.contexto();
    if (
      !avisoMLValido(ctx.segredoML, assinatura, {
        id: partes.dataId,
        requestId: partes.requestId,
      })
    ) {
      this.registro.registrar({
        canal: "mercadolivre",
        etapa: "aviso recusado",
        detalhe: "assinatura inválida (401); nada foi gravado",
        ok: false,
      });
      return { status: 401 };
    }
    let aviso: Record<string, unknown>;
    try {
      aviso = objeto(JSON.parse(corpoCru));
    } catch {
      return { status: 400 };
    }
    const m = /claims\/(\d+)$/.exec(texto(aviso.resource));
    const acoes = Array.isArray(aviso.actions) ? aviso.actions : [];
    if (aviso.topic !== "post_purchase" || !acoes.includes("claims") || !m) {
      this.registro.registrar({
        canal: "mercadolivre",
        etapa: "aviso ignorado",
        detalhe: "não é do tópico post_purchase/claims",
        ok: true,
      });
      return { status: 200 };
    }
    this.registro.registrar({
      canal: "mercadolivre",
      etapa: "aviso recebido",
      detalhe: `POST do tópico post_purchase sobre a reclamação ${m[1]}; assinatura conferida, respondeu 200 e enfileirou`,
      ok: true,
    });
    this.fila.enfileirar({ canal: "mercadolivre", id: m[1] });
    return { status: 200 };
  }

  /** O push 29 da Shopee: confere o header Authorization sobre url|corpo e só enfileira. */
  async receberPushShopee(
    url: string,
    corpoCru: string,
    authorization: string | undefined,
  ): Promise<RespostaAviso> {
    const ctx = await this.contexto();
    if (!pushShopeeValido(ctx.partnerKey, url, corpoCru, authorization)) {
      this.registro.registrar({
        canal: "shopee",
        etapa: "aviso recusado",
        detalhe: "assinatura do push inválida (401); nada foi gravado",
        ok: false,
      });
      return { status: 401 };
    }
    let push: Record<string, unknown>;
    try {
      push = objeto(JSON.parse(corpoCru));
    } catch {
      return { status: 400 };
    }
    const sn = texto(objeto(push.data).return_sn);
    if (push.code !== 29 || !sn) {
      this.registro.registrar({
        canal: "shopee",
        etapa: "aviso ignorado",
        detalhe: `push ${String(push.code)} não é o return_updates_push (29)`,
        ok: true,
      });
      return { status: 200 };
    }
    this.registro.registrar({
      canal: "shopee",
      etapa: "aviso recebido",
      detalhe: `push 29 sobre a devolução ${sn}; assinatura conferida, respondeu 200 e enfileirou`,
      ok: true,
    });
    this.fila.enfileirar({ canal: "shopee", id: sn });
    return { status: 200 };
  }

  /** O caso já foi gravado alguma vez? */
  async capturado(canal: CanalReal, id: string): Promise<boolean> {
    const ctx = await this.contexto();
    return (
      (await this.repo.versaoGravada(canal, id, ctx.simulado[canal])) !== null
    );
  }

  /** Busca o caso inteiro no canal, mapeia e grava. Chamado pela fila. */
  async processar(j: JobCaptura): Promise<ResultadoGravacao> {
    const ctx = await this.contexto();
    const caso =
      j.canal === "mercadolivre"
        ? mapearML(await ctx.ml.caso(j.id))
        : mapearShopee(await ctx.shopee.detalhe(j.id));
    this.registro.registrar({
      canal: j.canal,
      etapa: "mapeou",
      detalhe: `caso ${caso.idExterno}: pedido ${caso.pedido || "—"}, SKU ${caso.sku || "—"}, prazo ${caso.prazoMarketplace ?? "—"}, ${caso.fotos.length} foto(s)${caso.faltou.length ? `; faltou ${caso.faltou.join(" e ")}` : ""}`,
      ok: true,
    });
    const r = await this.registro.medir(
      j.canal,
      "gravou",
      `caso ${caso.idExterno}`,
      () =>
        this.repo.gravarCaso(caso, {
          simulado: ctx.simulado[j.canal],
          agora: this.agora(),
        }),
    );
    const rotulo: Record<AcaoDaCaptura, string> = {
      criada: "criou a reclamação em Triagem",
      atualizada: "atualizou a reclamação do caso que voltou",
      duplicada: "caso já gravado e sem mudança: nada foi duplicado",
    };
    this.registro.registrar({
      canal: j.canal,
      etapa: rotulo[r.acao],
      detalhe: `caso ${caso.idExterno}${ctx.simulado[j.canal] ? " (treino)" : ""}`,
      ok: true,
    });
    return r;
  }

  /** Busca periódica: cobre aviso perdido. Só enfileira o que ainda não está gravado ou mudou. */
  async buscar(
    canal: CanalReal,
  ): Promise<{ vistos: number; enfileirados: number }> {
    const ctx = await this.contexto();
    let enfileirados = 0;
    let vistos = 0;
    if (canal === "mercadolivre") {
      const claims = await ctx.ml.buscarAbertas();
      vistos = claims.length;
      for (const c of claims) {
        const gravada = await this.repo.versaoGravada(
          "mercadolivre",
          String(c.id),
          ctx.simulado.mercadolivre,
        );
        if (gravada !== c.last_updated) {
          if (this.fila.enfileirar({ canal, id: String(c.id) })) enfileirados++;
        }
      }
    } else {
      const ate = Math.floor(this.agora().getTime() / 1000);
      const devs = await ctx.shopee.listarAtualizadas(
        ate - JANELA_BUSCA_S,
        ate,
      );
      vistos = devs.length;
      for (const d of devs) {
        const gravada = await this.repo.versaoGravada(
          "shopee",
          d.return_sn,
          ctx.simulado.shopee,
        );
        if (gravada !== String(d.update_time)) {
          if (this.fila.enfileirar({ canal, id: d.return_sn })) enfileirados++;
        }
      }
    }
    this.registro.registrar({
      canal,
      etapa: "busca periódica concluída",
      detalhe: `${vistos} caso(s) no canal; ${enfileirados} novo(s) ou alterado(s) para processar`,
      ok: true,
    });
    return { vistos, enfileirados };
  }
}

/** A cada intervalo, busca cada canal ativo. Erro de um não impede o outro. */
export function iniciarBuscaPeriodica(
  servico: ServicoCaptura,
  intervaloMs: number,
  ativo: (canal: CanalReal) => Promise<boolean>,
): () => void {
  let rodando = false;
  const t = setInterval(() => {
    if (rodando) return;
    rodando = true;
    void (async () => {
      try {
        for (const canal of ["mercadolivre", "shopee"] as const) {
          if (await ativo(canal).catch(() => false)) {
            await servico.buscar(canal).catch(() => undefined);
          }
        }
      } finally {
        rodando = false;
      }
    })();
  }, intervaloMs);
  t.unref();
  return () => clearInterval(t);
}
