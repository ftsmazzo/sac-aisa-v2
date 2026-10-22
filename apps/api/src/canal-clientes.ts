import { assinaturaShopee } from "./canal-assinatura";
import type { RegistroChamadas } from "./canal-registro";
import { cifrar, decifrar, fimDoSegredo } from "./segredos";

/**
 * Clientes REAIS do Mercado Livre e da Shopee. A URL base vem da configuração: apontada para o
 * marketplace simulado hoje, para a API de verdade depois. Nada aqui sabe qual dos dois é.
 * Tokens ficam cifrados (AES-256-GCM, a mesma chave das integrações). Nunca vão para log nem erro.
 */

export type Http = typeof fetch;
export type CanalReal = "mercadolivre" | "shopee";

export const BASE_REAL: Record<CanalReal, string> = {
  mercadolivre: "https://api.mercadolibre.com",
  shopee: "https://openplatform.shopee.com.br",
};

export class ErroCanal extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroCanal";
  }
}

// ---------- Tokens ----------

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601. */
  expiraEm: string;
  /** user_id (Mercado Livre) ou shop_id (Shopee) que a autorização devolveu. */
  dono: string;
}

export interface ArmazemToken {
  ler(canal: CanalReal): Promise<Tokens | null>;
  gravar(canal: CanalReal, t: Tokens): Promise<void>;
}

export class ArmazemMemoria implements ArmazemToken {
  private t = new Map<CanalReal, Tokens>();
  async ler(canal: CanalReal) {
    return this.t.get(canal) ?? null;
  }
  async gravar(canal: CanalReal, t: Tokens) {
    this.t.set(canal, { ...t });
  }
}

export interface RegistroPersistido {
  config: Record<string, unknown>;
  segredos: Record<string, { cifrado: string; fim: string }>;
}

/** Onde os tokens cifrados moram: a mesma linha de `IntegracaoConfig` do canal. */
export interface PersistenciaSegredos {
  ler(canal: CanalReal): Promise<RegistroPersistido | null>;
  gravar(canal: CanalReal, r: RegistroPersistido): Promise<void>;
}

export class ArmazemCifrado implements ArmazemToken {
  constructor(
    private readonly pers: PersistenciaSegredos,
    private readonly chave: Buffer,
  ) {}

  async ler(canal: CanalReal): Promise<Tokens | null> {
    const r = await this.pers.ler(canal);
    const a = r?.segredos.accessToken;
    const f = r?.segredos.refreshToken;
    if (!r || !a || !f) return null;
    try {
      return {
        accessToken: decifrar(a.cifrado, this.chave, `${canal}:accessToken`),
        refreshToken: decifrar(f.cifrado, this.chave, `${canal}:refreshToken`),
        expiraEm: String(r.config.tokenExpiraEm ?? ""),
        dono: String(r.config.tokenDono ?? ""),
      };
    } catch {
      return null;
    }
  }

  async gravar(canal: CanalReal, t: Tokens): Promise<void> {
    const r = (await this.pers.ler(canal)) ?? { config: {}, segredos: {} };
    await this.pers.gravar(canal, {
      config: { ...r.config, tokenExpiraEm: t.expiraEm, tokenDono: t.dono },
      segredos: {
        ...r.segredos,
        accessToken: {
          cifrado: cifrar(t.accessToken, this.chave, `${canal}:accessToken`),
          fim: fimDoSegredo(t.accessToken),
        },
        refreshToken: {
          cifrado: cifrar(t.refreshToken, this.chave, `${canal}:refreshToken`),
          fim: fimDoSegredo(t.refreshToken),
        },
      },
    });
  }
}

/** Renova um pouco antes de vencer, para a chamada não cair no meio. */
const MARGEM_MS = 60_000;

function expirado(t: Tokens, agora: Date): boolean {
  const e = Date.parse(t.expiraEm);
  return !Number.isFinite(e) || e - agora.getTime() < MARGEM_MS;
}

async function lerJson(r: Response): Promise<Record<string, unknown>> {
  const j = (await r.json().catch(() => null)) as unknown;
  return typeof j === "object" && j !== null && !Array.isArray(j)
    ? (j as Record<string, unknown>)
    : {};
}

const juntar = (base: string, caminho: string) =>
  `${base.replace(/\/+$/, "")}${caminho}`;

// ---------- Mercado Livre ----------

export interface ConfigML {
  baseUrl: string;
  appId: string;
  segredo: string;
  redirectUri: string;
}

export interface ClaimML {
  id: number;
  resource: string;
  resource_id: number;
  status: string;
  type?: string;
  reason_id: string;
  date_created: string;
  last_updated: string;
}

export interface CasoCompletoML {
  claim: ClaimML;
  detail: {
    title?: string;
    description?: string;
    problem?: string;
    due_date?: string | null;
  };
  motivo: { id?: string; name?: string } | null;
  order: Record<string, unknown> | null;
  anexos: { filename?: string; url?: string }[];
}

export class ClienteML {
  private renovando: Promise<Tokens> | null = null;

  constructor(
    private readonly cfg: ConfigML,
    private readonly armazem: ArmazemToken,
    private readonly http: Http,
    private readonly agora: () => Date = () => new Date(),
    private readonly registro?: RegistroChamadas,
  ) {}

  private med<T>(etapa: string, detalhe: string, fn: () => Promise<T>) {
    return this.registro
      ? this.registro.medir("mercadolivre", etapa, detalhe, fn)
      : fn();
  }

  private async pedirToken(f: Record<string, string>): Promise<Tokens> {
    const r = await this.http(juntar(this.cfg.baseUrl, "/oauth/token"), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.cfg.appId,
        client_secret: this.cfg.segredo,
        ...f,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await lerJson(r);
    if (r.status !== 200 || typeof j.access_token !== "string") {
      throw new ErroCanal(
        r.status,
        `O Mercado Livre recusou a autorização (${r.status}${typeof j.error === "string" ? `: ${j.error}` : ""}).`,
      );
    }
    const t: Tokens = {
      accessToken: j.access_token,
      refreshToken: String(j.refresh_token ?? ""),
      expiraEm: new Date(
        this.agora().getTime() + Number(j.expires_in ?? 21_600) * 1000,
      ).toISOString(),
      dono: String(j.user_id ?? ""),
    };
    await this.armazem.gravar("mercadolivre", t);
    return t;
  }

  /** Troca o code da autorização por token. Quem autoriza é o administrador da conta vendedora. */
  autorizar(code: string): Promise<Tokens> {
    return this.med("trocou o code por token", "POST /oauth/token", () =>
      this.pedirToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.cfg.redirectUri,
      }),
    );
  }

  private renovar(atual: Tokens): Promise<Tokens> {
    // O refresh token é de uso único: duas renovações ao mesmo tempo perderiam a conta.
    this.renovando ??= this.med("renovou o token", "refresh_token", () =>
      this.pedirToken({
        grant_type: "refresh_token",
        refresh_token: atual.refreshToken,
      }),
    ).finally(() => {
      this.renovando = null;
    });
    return this.renovando;
  }

  private async token(): Promise<Tokens> {
    const t = await this.armazem.ler("mercadolivre");
    if (!t) {
      throw new ErroCanal(401, "O Mercado Livre ainda não foi autorizado.");
    }
    return expirado(t, this.agora()) ? this.renovar(t) : t;
  }

  private async obter<T>(caminho: string, tentarDeNovo = true): Promise<T> {
    const t = await this.token();
    const r = await this.http(juntar(this.cfg.baseUrl, caminho), {
      headers: {
        authorization: `Bearer ${t.accessToken}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 401 && tentarDeNovo) {
      await this.renovar(t);
      return this.obter<T>(caminho, false);
    }
    const bruto = (await r.json().catch(() => null)) as unknown;
    if (r.status !== 200) {
      const j =
        typeof bruto === "object" && bruto !== null && !Array.isArray(bruto)
          ? (bruto as Record<string, unknown>)
          : {};
      throw new ErroCanal(
        r.status,
        `O Mercado Livre respondeu ${r.status}${typeof j.message === "string" ? `: ${j.message}` : ""}.`,
      );
    }
    return bruto as T;
  }

  /** As reclamações abertas em que a loja é a vendedora (respondent). Pagina até acabar. */
  async buscarAbertas(): Promise<ClaimML[]> {
    const t = await this.token();
    const todas: ClaimML[] = [];
    const limite = 50;
    for (let offset = 0; offset < 1000; offset += limite) {
      const q = new URLSearchParams({
        "players.user_id": t.dono,
        "players.role": "respondent",
        status: "opened",
        limit: String(limite),
        offset: String(offset),
      });
      const pag = await this.med(
        "buscou as reclamações abertas",
        `GET /post-purchase/v1/claims/search (offset ${offset})`,
        () =>
          this.obter<{ data: ClaimML[]; paging: { total: number } }>(
            `/post-purchase/v1/claims/search?${q.toString()}`,
          ),
      );
      todas.push(...pag.data);
      if (offset + limite >= pag.paging.total) break;
    }
    return todas;
  }

  /** A reclamação inteira: dados, detalhe (com o problema relatado), motivo, pedido e anexos. */
  async caso(id: string | number): Promise<CasoCompletoML> {
    const base = `/post-purchase/v1/claims/${encodeURIComponent(String(id))}`;
    const claim = await this.med("buscou a reclamação", `GET ${base}`, () =>
      this.obter<ClaimML>(base),
    );
    const detail = await this.med(
      "buscou o detalhe",
      `GET ${base}/detail`,
      () => this.obter<CasoCompletoML["detail"]>(`${base}/detail`),
    );
    const motivo = await this.med(
      "buscou o motivo",
      `GET /post-purchase/v1/claims/reasons/${claim.reason_id}`,
      () =>
        this.obter<{ id?: string; name?: string }>(
          `/post-purchase/v1/claims/reasons/${encodeURIComponent(claim.reason_id)}`,
        ),
    ).catch(() => null);
    const order =
      claim.resource === "order"
        ? await this.med(
            "buscou o pedido",
            `GET /orders/${claim.resource_id}`,
            () =>
              this.obter<Record<string, unknown>>(
                `/orders/${claim.resource_id}`,
              ),
          ).catch(() => null)
        : null;
    // O contrato dos anexos não está no levantamento: conferir no console do Mercado Livre.
    const anexos = await this.med(
      "buscou os anexos",
      `GET ${base}/attachments`,
      () => this.obter<CasoCompletoML["anexos"]>(`${base}/attachments`),
    ).catch(() => []);
    return {
      claim,
      detail,
      motivo,
      order,
      anexos: Array.isArray(anexos) ? anexos : [],
    };
  }
}

// ---------- Shopee ----------

export interface ConfigShopee {
  baseUrl: string;
  partnerId: string;
  partnerKey: string;
  shopId: string;
}

export interface DevolucaoShopee {
  return_sn: string;
  order_sn: string;
  status: string;
  reason: string;
  text_reason: string;
  refund_amount: number;
  create_time: number;
  update_time: number;
  return_ship_due_date: number;
  image: string[];
  cancel_reason?: string;
  user?: { username?: string; email?: string };
  item: {
    item_sku?: string;
    variation_sku?: string;
    name?: string;
    amount?: number;
  }[];
}

export class ClienteShopee {
  private renovando: Promise<Tokens> | null = null;

  constructor(
    private readonly cfg: ConfigShopee,
    private readonly armazem: ArmazemToken,
    private readonly http: Http,
    private readonly agora: () => Date = () => new Date(),
    private readonly registro?: RegistroChamadas,
  ) {}

  private med<T>(etapa: string, detalhe: string, fn: () => Promise<T>) {
    return this.registro
      ? this.registro.medir("shopee", etapa, detalhe, fn)
      : fn();
  }

  private ts() {
    return Math.floor(this.agora().getTime() / 1000);
  }

  private async postar(
    caminho: string,
    corpo: unknown,
    loja?: { accessToken: string; shopId: string },
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const timestamp = this.ts();
    const sign = assinaturaShopee(this.cfg.partnerKey, {
      partnerId: this.cfg.partnerId,
      caminho,
      timestamp,
      accessToken: loja?.accessToken,
      shopId: loja?.shopId,
    });
    const q = new URLSearchParams({
      partner_id: this.cfg.partnerId,
      timestamp: String(timestamp),
      sign,
      ...(loja ? { access_token: loja.accessToken, shop_id: loja.shopId } : {}),
    });
    const r = await this.http(
      `${juntar(this.cfg.baseUrl, caminho)}?${q.toString()}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return { status: r.status, json: await lerJson(r) };
  }

  private guardar(j: Record<string, unknown>): Promise<Tokens> {
    const t: Tokens = {
      accessToken: String(j.access_token ?? ""),
      refreshToken: String(j.refresh_token ?? ""),
      expiraEm: new Date(
        this.agora().getTime() + Number(j.expire_in ?? 14_400) * 1000,
      ).toISOString(),
      dono: String(j.shop_id ?? this.cfg.shopId),
    };
    return this.armazem.gravar("shopee", t).then(() => t);
  }

  /** Troca o code (uso único, cerca de 10 minutos) por token. Quem autoriza é o dono da loja. */
  autorizar(code: string, shopId: string = this.cfg.shopId): Promise<Tokens> {
    return this.med(
      "trocou o code por token",
      "POST /api/v2/auth/token/get",
      async () => {
        const r = await this.postar("/api/v2/auth/token/get", {
          code,
          shop_id: Number(shopId),
          partner_id: Number(this.cfg.partnerId),
        });
        if (
          r.status !== 200 ||
          r.json.error ||
          typeof r.json.access_token !== "string"
        ) {
          throw new ErroCanal(
            r.status,
            `A Shopee recusou a autorização (${String(r.json.error || r.status)}).`,
          );
        }
        return this.guardar(r.json);
      },
    );
  }

  private renovar(atual: Tokens): Promise<Tokens> {
    // Cada renovação devolve um refresh token novo e invalida o antigo: uma de cada vez.
    this.renovando ??= this.med(
      "renovou o token",
      "POST /api/v2/auth/access_token/get",
      async () => {
        const r = await this.postar("/api/v2/auth/access_token/get", {
          refresh_token: atual.refreshToken,
          shop_id: Number(atual.dono || this.cfg.shopId),
          partner_id: Number(this.cfg.partnerId),
        });
        if (
          r.status !== 200 ||
          r.json.error ||
          typeof r.json.access_token !== "string"
        ) {
          throw new ErroCanal(
            r.status,
            `A Shopee recusou a renovação (${String(r.json.error || r.status)}).`,
          );
        }
        return this.guardar(r.json);
      },
    ).finally(() => {
      this.renovando = null;
    });
    return this.renovando;
  }

  private async token(): Promise<Tokens> {
    const t = await this.armazem.ler("shopee");
    if (!t) throw new ErroCanal(401, "A Shopee ainda não autorizou a loja.");
    return expirado(t, this.agora()) ? this.renovar(t) : t;
  }

  private async chamarLoja(
    caminho: string,
    corpo: unknown,
    tentarDeNovo = true,
  ): Promise<Record<string, unknown>> {
    const t = await this.token();
    const r = await this.postar(caminho, corpo, {
      accessToken: t.accessToken,
      shopId: t.dono || this.cfg.shopId,
    });
    if (r.json.error === "error_auth" && tentarDeNovo) {
      await this.renovar(t);
      return this.chamarLoja(caminho, corpo, false);
    }
    if (r.status !== 200 || r.json.error) {
      throw new ErroCanal(
        r.status,
        `A Shopee respondeu ${r.status}${typeof r.json.message === "string" ? `: ${r.json.message}` : ""}.`,
      );
    }
    return (r.json.response ?? {}) as Record<string, unknown>;
  }

  /** Devoluções atualizadas na janela (em segundos). Pagina até `more` acabar. */
  async listarAtualizadas(
    deS: number,
    ateS: number,
  ): Promise<DevolucaoShopee[]> {
    const todas: DevolucaoShopee[] = [];
    for (let pagina = 1; pagina <= 50; pagina++) {
      const resp = await this.med(
        "listou as devoluções",
        `POST /api/v2/returns/get_return_list (página ${pagina})`,
        () =>
          this.chamarLoja("/api/v2/returns/get_return_list", {
            page_no: pagina,
            page_size: 50,
            update_time_from: deS,
            update_time_to: ateS,
          }),
      );
      todas.push(...((resp.return as DevolucaoShopee[] | undefined) ?? []));
      if (!resp.more) break;
    }
    return todas;
  }

  async detalhe(returnSn: string): Promise<DevolucaoShopee> {
    const resp = await this.med(
      "buscou o detalhe da devolução",
      "POST /api/v2/returns/get_return_detail",
      () =>
        this.chamarLoja("/api/v2/returns/get_return_detail", {
          return_sn: returnSn,
        }),
    );
    return resp as unknown as DevolucaoShopee;
  }
}
