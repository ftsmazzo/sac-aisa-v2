import "reflect-metadata";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes } from "@sac-aisa/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { manipuladorSimulado, type ServicoCanais } from "./canais.controller";
import {
  assinaturaShopee,
  avisoMLValido,
  cabecalhoAvisoML,
  hmacHex,
  pushShopeeValido,
} from "./canal-assinatura";
import {
  mapearML,
  mapearShopee,
  RepositorioCapturaSql,
  ServicoCaptura,
} from "./canal-captura";
import { CenariosSimulados } from "./canal-cenarios";
import {
  ArmazemCifrado,
  ArmazemMemoria,
  ClienteML,
  ClienteShopee,
  ErroCanal,
  type RegistroPersistido,
} from "./canal-clientes";
import { faltaParaFuncionar, RegistroChamadas } from "./canal-registro";
import { CREDENCIAIS_SIMULADAS, MarketplaceSimulado } from "./canal-simulado";
import {
  type AuditoriaNova,
  camposDoCanalAlterados,
  ErroEscrita,
  estadoVazio,
  lerEntrada,
  type RegistroAtual,
  type RepositorioEscrita,
  ServicoEscrita,
} from "./reclamacoes-escrita";
import type { Executor, Transacao } from "./treino";

const T0 = new Date("2026-10-22T15:00:00Z");
const TS0 = Math.floor(T0.getTime() / 1000);
const BASE = "http://marketplace.simulado";
const URL_PUSH = "http://api.simulada/webhooks/shopee";

const migracao = (nome: string) =>
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "prisma",
      "migrations",
      nome,
      "migration.sql",
    ),
    "utf8",
  );

let db: PGlite;
const exec: Executor = async (sql, params = []) =>
  (await db.query(sql, params)).rows as Record<string, unknown>[];
const transacao: Transacao = (fn) => fn(exec);
const contar = async (sql: string, params: unknown[] = []) =>
  Number((await exec(sql, params))[0]?.n ?? 0);

beforeAll(async () => {
  db = new PGlite();
  for (const m of [
    "20261022000000_base_v2",
    "20261023000000_integracoes",
    "20261024000000_clickup_sincronizacao",
    "20261025000000_jornada",
    "20261026000000_treino",
    "20261027000000_canal_captura",
  ]) {
    await db.exec(migracao(m));
  }
  await db.exec(`
    INSERT INTO marcas (id, nome, ativa) VALUES ('m-aisa', 'AISA', true), ('m-art', 'ARTMAQ', true), ('m-ara', 'ARAUCA', true);
    INSERT INTO canais (id, nome, tipo) VALUES
      ('canal-mercado-livre', 'Mercado Livre', 'marketplace'), ('canal-shopee', 'Shopee', 'marketplace');
    INSERT INTO produtos (id, codigo, nome, categoria) VALUES
      ('p-g48', 'G48', 'Abafador de alumínio', 'PRODUTO AISA'),
      ('p-m08', 'M08', 'Alicate pressão', 'PRODUTO AISA'),
      ('p-b60', 'B60', 'Abafador Arauca', 'PRODUTO ARAUCA'),
      ('p-m22', 'M22', 'Argola Fuxico', 'PRODUTO ARTMAQ'),
      ('p-m74', 'M74', 'Espátula', 'PRODUTO AISA');
    INSERT INTO reclamacoes (id, "canalId", "dataAbertura", "alteradoEm", descricao, "origemRegistro")
      VALUES ('real-1', 'canal-shopee', '2026-10-01', now(), 'Reclamação real do teste', 'web');
  `);
});
afterAll(async () => {
  await db.close();
});

/** Tudo novo a cada teste: marketplace, relógio, tokens, registro e fila. */
function montar(opcoes: { simulado?: boolean } = {}) {
  let agora = T0;
  const relogio = () => agora;
  const sim = new MarketplaceSimulado({ agora: relogio });
  const chamadas: { metodo: string; caminho: string }[] = [];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    chamadas.push({ metodo: init?.method ?? "GET", caminho: u.pathname });
    return sim.fetch(input, init);
  }) as typeof fetch;
  const armazem = new ArmazemMemoria();
  const registro = new RegistroChamadas(300, relogio);
  const ml = new ClienteML(
    {
      baseUrl: BASE,
      appId: CREDENCIAIS_SIMULADAS.mercadolivre.appId,
      segredo: CREDENCIAIS_SIMULADAS.mercadolivre.segredo,
      redirectUri: "https://sac.exemplo.invalid/callback",
    },
    armazem,
    http,
    relogio,
    registro,
  );
  const shopee = new ClienteShopee(
    {
      baseUrl: BASE,
      partnerId: String(CREDENCIAIS_SIMULADAS.shopee.partnerId),
      partnerKey: CREDENCIAIS_SIMULADAS.shopee.partnerKey,
      shopId: String(CREDENCIAIS_SIMULADAS.shopee.shopId),
    },
    armazem,
    http,
    relogio,
    registro,
  );
  const ctx = {
    ml,
    shopee,
    segredoML: CREDENCIAIS_SIMULADAS.mercadolivre.segredo,
    partnerKey: CREDENCIAIS_SIMULADAS.shopee.partnerKey,
    simulado: {
      mercadolivre: opcoes.simulado ?? true,
      shopee: opcoes.simulado ?? true,
    },
  };
  const captura = new ServicoCaptura(
    async () => ctx,
    new RepositorioCapturaSql(transacao),
    registro,
    relogio,
    { tentativas: 1, espera: () => 0 },
  );
  const cenarios = new CenariosSimulados(
    sim,
    captura,
    async () => ctx,
    armazem,
    () => URL_PUSH,
    registro,
  );
  return {
    sim,
    http,
    chamadas,
    armazem,
    registro,
    ml,
    shopee,
    captura,
    cenarios,
    avancar: (ms: number) => {
      agora = new Date(agora.getTime() + ms);
    },
  };
}

async function autorizar(m: ReturnType<typeof montar>) {
  await m.ml.autorizar(m.sim.codeAtual("mercadolivre"));
  await m.shopee.autorizar(m.sim.codeAtual("shopee"));
}

const canalReclamacoes = () =>
  contar(
    `SELECT count(*)::int AS n FROM reclamacoes WHERE "origemRegistro" = 'canal'`,
  );

async function limpar() {
  await exec(
    `DELETE FROM capturas_canal WHERE "reclamacaoId" IS NOT NULL AND "reclamacaoId" <> 'real-1'`,
  );
  await exec(`DELETE FROM reclamacoes WHERE "origemRegistro" = 'canal'`);
}

// ---------- Assinatura ----------

describe("assinatura", () => {
  it("a Shopee assina partner_id + caminho + timestamp [+ token + loja], HMAC-SHA256 hex", () => {
    const esperado = createHmac("sha256", "chave")
      .update("1000001/api/v2/shop/auth_partner1700000000")
      .digest("hex");
    expect(
      assinaturaShopee("chave", {
        partnerId: 1000001,
        caminho: "/api/v2/shop/auth_partner",
        timestamp: 1700000000,
      }),
    ).toBe(esperado);
    const comLoja = createHmac("sha256", "chave")
      .update("1000001/api/v2/returns/get_return_list1700000000TOKEN220004993")
      .digest("hex");
    expect(
      assinaturaShopee("chave", {
        partnerId: "1000001",
        caminho: "/api/v2/returns/get_return_list",
        timestamp: 1700000000,
        accessToken: "TOKEN",
        shopId: 220004993,
      }),
    ).toBe(comLoja);
  });

  it("o push da Shopee vale só com HMAC de url|corpo e a chave certa", () => {
    const corpo = '{"code":29}';
    const ok = hmacHex("k", `${URL_PUSH}|${corpo}`);
    expect(pushShopeeValido("k", URL_PUSH, corpo, ok)).toBe(true);
    expect(pushShopeeValido("k", URL_PUSH, '{"code":29 }', ok)).toBe(false);
    expect(pushShopeeValido("k", "http://outra/url", corpo, ok)).toBe(false);
    expect(pushShopeeValido("outra", URL_PUSH, corpo, ok)).toBe(false);
    expect(pushShopeeValido("k", URL_PUSH, corpo, undefined)).toBe(false);
  });

  it("o aviso do Mercado Livre vale com o manifesto ts/v1, não com o corpo cru", () => {
    const partes = { id: "99", requestId: "req-99", ts: "1700000000" };
    const ok = cabecalhoAvisoML("s", partes);
    expect(avisoMLValido("s", ok, partes)).toBe(true);
    expect(
      avisoMLValido("s", hmacHex("s", '{"topic":"post_purchase"}'), partes),
    ).toBe(false);
    expect(avisoMLValido("s", ok, { id: "100", requestId: "req-99" })).toBe(
      false,
    );
    expect(avisoMLValido("s", undefined, partes)).toBe(false);
  });
});

// ---------- Marketplace simulado e clientes ----------

describe("Mercado Livre simulado", () => {
  it("troca o code por token uma vez só e recusa Secret Key errada", async () => {
    const m = montar();
    const ruim = new ClienteML(
      {
        baseUrl: BASE,
        appId: CREDENCIAIS_SIMULADAS.mercadolivre.appId,
        segredo: "errado",
        redirectUri: "https://x.invalid/cb",
      },
      new ArmazemMemoria(),
      m.http,
      () => T0,
    );
    await expect(
      ruim.autorizar(m.sim.codeAtual("mercadolivre")),
    ).rejects.toMatchObject({ status: 401 });
    await m.ml.autorizar(m.sim.codeAtual("mercadolivre"));
    expect((await m.armazem.ler("mercadolivre"))?.dono).toBe(
      String(CREDENCIAIS_SIMULADAS.mercadolivre.userId),
    );
    await expect(
      m.ml.autorizar(CREDENCIAIS_SIMULADAS.mercadolivre.code),
    ).rejects.toBeInstanceOf(ErroCanal);
  });

  it("a busca exige o filtro de vendedor e devolve os 12 casos", async () => {
    const m = montar();
    await autorizar(m);
    const t = await m.armazem.ler("mercadolivre");
    const semFiltro = await m.http(
      `${BASE}/post-purchase/v1/claims/search?limit=30&offset=0`,
      { headers: { authorization: `Bearer ${t?.accessToken}` } },
    );
    expect(semFiltro.status).toBe(400);
    const abertas = await m.ml.buscarAbertas();
    expect(abertas).toHaveLength(12);
  });

  it("traz a reclamação inteira: detalhe com problem e due_date, motivo, pedido com seller_sku e anexos", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.ids("mercadolivre")[0];
    const c = await m.ml.caso(id);
    expect(c.detail.problem).toContain("solda");
    expect(c.detail.due_date).toBeTruthy();
    expect(c.motivo?.name).toBeTruthy();
    expect(
      (c.order as { order_items: { item: { seller_sku: string } }[] })
        .order_items[0].item.seller_sku,
    ).toBe("G48");
    expect(c.anexos.length).toBe(2);
    expect(c.anexos[0]?.url).toContain("/attachments/");
    expect(c.anexos[0]?.url).toContain("/download");
    const etapas = m.registro.listar().map((p) => p.etapa);
    expect(etapas).toEqual(
      expect.arrayContaining([
        "trocou o code por token",
        "buscou a reclamação",
        "buscou o detalhe",
        "buscou o motivo",
        "buscou o pedido",
        "buscou os anexos",
      ]),
    );
  });

  it("sem token, nada é chamado e o erro diz o que falta", async () => {
    const m = montar();
    await expect(m.ml.caso("1")).rejects.toMatchObject({ status: 401 });
    expect(m.chamadas).toHaveLength(0);
  });
});

describe("renovação de token", () => {
  it("Mercado Livre: o token de 6 horas é renovado sozinho, o refresh é de uso único", async () => {
    const m = montar();
    await autorizar(m);
    const antes = await m.armazem.ler("mercadolivre");
    m.avancar(7 * 3_600_000);
    await m.ml.caso(m.sim.ids("mercadolivre")[0]);
    const depois = await m.armazem.ler("mercadolivre");
    expect(depois?.accessToken).not.toBe(antes?.accessToken);
    expect(depois?.refreshToken).not.toBe(antes?.refreshToken);
    expect(
      m.registro
        .listar()
        .some(
          (p) => p.etapa === "renovou o token" && p.canal === "mercadolivre",
        ),
    ).toBe(true);
    const velho = await m.http(`${BASE}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CREDENCIAIS_SIMULADAS.mercadolivre.appId,
        client_secret: CREDENCIAIS_SIMULADAS.mercadolivre.segredo,
        refresh_token: antes?.refreshToken ?? "",
      }).toString(),
    });
    expect(velho.status).toBe(400);
  });

  it("duas chamadas com o token vencido renovam uma vez só", async () => {
    const m = montar();
    await autorizar(m);
    m.avancar(7 * 3_600_000);
    const ids = m.sim.ids("mercadolivre");
    const antes = m.chamadas.filter((c) => c.caminho === "/oauth/token").length;
    await Promise.all([m.ml.caso(ids[0]), m.ml.caso(ids[1])]);
    const renovacoes =
      m.chamadas.filter((c) => c.caminho === "/oauth/token").length - antes;
    expect(renovacoes).toBe(1);
  });

  it("Shopee: o token de 4 horas é renovado com refresh_token e a assinatura certa", async () => {
    const m = montar();
    await autorizar(m);
    const antes = await m.armazem.ler("shopee");
    m.avancar(5 * 3_600_000);
    const lista = await m.shopee.listarAtualizadas(
      TS0 - 7 * 86400,
      TS0 + 7 * 3600,
    );
    expect(lista.length).toBe(12);
    const depois = await m.armazem.ler("shopee");
    expect(depois?.accessToken).not.toBe(antes?.accessToken);
    expect(
      m.chamadas.some((c) => c.caminho === "/api/v2/auth/access_token/get"),
    ).toBe(true);
  });

  it("token que o canal recusa (401) é renovado e a chamada se repete", async () => {
    const m = montar();
    await autorizar(m);
    const t = await m.armazem.ler("mercadolivre");
    if (!t) throw new Error("sem token");
    await m.armazem.gravar("mercadolivre", {
      ...t,
      accessToken: "APP_USR-sim-invalido",
    });
    const c = await m.ml.caso(m.sim.ids("mercadolivre")[0]);
    expect(c.claim.id).toBeTruthy();
    expect(m.registro.listar().some((p) => p.etapa === "renovou o token")).toBe(
      true,
    );
  });
});

describe("Shopee simulada", () => {
  it("recusa assinatura errada e timestamp fora da janela de 5 minutos", async () => {
    const m = montar();
    const q = (sign: string, t: number) =>
      new URLSearchParams({
        partner_id: String(CREDENCIAIS_SIMULADAS.shopee.partnerId),
        timestamp: String(t),
        sign,
      }).toString();
    const caminho = "/api/v2/auth/token/get";
    const certa = assinaturaShopee(CREDENCIAIS_SIMULADAS.shopee.partnerKey, {
      partnerId: CREDENCIAIS_SIMULADAS.shopee.partnerId,
      caminho,
      timestamp: TS0,
    });
    const corpo = JSON.stringify({
      code: "x",
      shop_id: CREDENCIAIS_SIMULADAS.shopee.shopId,
      partner_id: CREDENCIAIS_SIMULADAS.shopee.partnerId,
    });
    const errada = await m.http(`${BASE}${caminho}?${q("0".repeat(64), TS0)}`, {
      method: "POST",
      body: corpo,
    });
    expect((await errada.json()).error).toBe("error_sign");
    const velha = await m.http(`${BASE}${caminho}?${q(certa, TS0 - 600)}`, {
      method: "POST",
      body: corpo,
    });
    expect((await velha.json()).error).toBe("error_auth");
  });

  it("lista as devoluções com e-mail mascarado e traz o detalhe pelo return_sn", async () => {
    const m = montar();
    await autorizar(m);
    const lista = await m.shopee.listarAtualizadas(TS0 - 7 * 86400, TS0 + 3600);
    expect(lista).toHaveLength(12);
    expect(lista[0].user?.email).toMatch(/\*/);
    expect(lista[0].user?.email?.endsWith(".invalid")).toBe(true);
    const d = await m.shopee.detalhe(lista[0].return_sn);
    expect(d.order_sn).toBe(lista[0].order_sn);
    expect(d.item[0].item_sku).toBeDefined();
  });

  it("o conjunto cobre os casos variados, inclusive repetido, cancelamento e sem dado", async () => {
    const m = montar();
    await autorizar(m);
    const lista = await m.shopee.listarAtualizadas(TS0 - 7 * 86400, TS0 + 3600);
    expect(lista.some((d) => d.status === "IN_CANCEL")).toBe(true);
    expect(lista.some((d) => !d.text_reason)).toBe(true);
    expect(lista.some((d) => !d.item[0].item_sku)).toBe(true);
    const pedidos = lista.map((d) => d.order_sn);
    expect(new Set(pedidos).size).toBeLessThan(pedidos.length);
  });
});

describe("token cifrado", () => {
  function persistenciaFalsa() {
    const guardado = new Map<string, RegistroPersistido>();
    return {
      guardado,
      pers: {
        ler: async (c: string) => guardado.get(c) ?? null,
        gravar: async (c: string, r: RegistroPersistido) => {
          guardado.set(c, JSON.parse(JSON.stringify(r)));
        },
      },
    };
  }
  const CHAVE = Buffer.alloc(32, 7);

  it("grava cifrado, sem o token em texto, e lê de volta", async () => {
    const { pers, guardado } = persistenciaFalsa();
    const a = new ArmazemCifrado(pers, CHAVE);
    await a.gravar("mercadolivre", {
      accessToken: "APP_USR-token-secreto-1234",
      refreshToken: "TG-refresh-secreto-5678",
      expiraEm: "2026-10-22T21:00:00.000Z",
      dono: "100000001",
    });
    const bruto = JSON.stringify(guardado.get("mercadolivre"));
    expect(bruto).not.toContain("token-secreto");
    expect(bruto).not.toContain("refresh-secreto");
    expect(await a.ler("mercadolivre")).toMatchObject({
      accessToken: "APP_USR-token-secreto-1234",
      refreshToken: "TG-refresh-secreto-5678",
      dono: "100000001",
    });
  });

  it("outra chave não abre, e o que já estava na integração é preservado", async () => {
    const { pers, guardado } = persistenciaFalsa();
    guardado.set("shopee", {
      config: { partnerId: "1000001" },
      segredos: { partnerKey: { cifrado: "x", fim: "1234" } },
    });
    const a = new ArmazemCifrado(pers, CHAVE);
    await a.gravar("shopee", {
      accessToken: "a",
      refreshToken: "r",
      expiraEm: "2026-10-22T21:00:00.000Z",
      dono: "9",
    });
    const r = guardado.get("shopee");
    expect(r?.config.partnerId).toBe("1000001");
    expect(r?.segredos.partnerKey.fim).toBe("1234");
    expect(
      await new ArmazemCifrado(pers, Buffer.alloc(32, 9)).ler("shopee"),
    ).toBeNull();
  });

  it("o segredo de um canal não abre no outro", async () => {
    const { pers, guardado } = persistenciaFalsa();
    const a = new ArmazemCifrado(pers, CHAVE);
    await a.gravar("mercadolivre", {
      accessToken: "a",
      refreshToken: "r",
      expiraEm: "2026-10-22T21:00:00.000Z",
      dono: "1",
    });
    guardado.set("shopee", guardado.get("mercadolivre") as RegistroPersistido);
    expect(await a.ler("shopee")).toBeNull();
  });
});

// ---------- Mapeamento ----------

describe("mapeamento", () => {
  it("Mercado Livre: pedido, SKU, texto, prazo, comprador, fotos e valor", async () => {
    const m = montar();
    await autorizar(m);
    const caso = mapearML(await m.ml.caso(m.sim.ids("mercadolivre")[0]));
    expect(caso).toMatchObject({
      canal: "mercadolivre",
      sku: "G48",
      status: "opened",
      valor: 289.9,
      faltou: [],
    });
    expect(caso.idExterno).toBe(m.sim.ids("mercadolivre")[0]);
    expect(caso.pedido).toMatch(/^\d{13}$/);
    expect(caso.texto).toContain("solda");
    expect(caso.prazoMarketplace).toBe("2026-10-25");
    expect(caso.comprador.email.endsWith("@exemplo.invalid")).toBe(true);
    expect(caso.comprador.telefone.startsWith("(00)")).toBe(true);
    expect(caso.comprador.uf).toBe("SP");
    expect(caso.fotos).toHaveLength(2);
  });

  it("caso sem dado suficiente: marca o que faltou em vez de inventar", async () => {
    const m = montar();
    await autorizar(m);
    const caso = mapearML(await m.ml.caso(m.sim.ids("mercadolivre")[9]));
    expect(caso.texto).toBe("");
    expect(caso.sku).toBe("");
    expect(caso.faltou).toEqual(["texto do comprador", "SKU"]);
  });

  it("Shopee: return_sn, order_sn, text_reason, item_sku, prazo e e-mail mascarado", async () => {
    const m = montar();
    await autorizar(m);
    const [primeira] = await m.shopee.listarAtualizadas(
      TS0 - 7 * 86400,
      TS0 + 3600,
    );
    const caso = mapearShopee(primeira);
    expect(caso.idExterno).toBe(primeira.return_sn);
    expect(caso.pedido).toBe(primeira.order_sn);
    expect(caso.texto).toBe(primeira.text_reason);
    expect(caso.sku).toBe(primeira.item[0].item_sku);
    expect(caso.comprador.email).toMatch(/\*.*\.invalid$/);
    expect(caso.valor).toBe(primeira.refund_amount);
    expect(caso.prazoMarketplace).toMatch(/^2026-10-\d\d$/);
  });
});

// ---------- Gravação, deduplicação e atualização ----------

describe("captura: gravação, deduplicação e atualização", () => {
  beforeEach(limpar);

  it("cria a reclamação em Triagem, treino, origem canal, com tudo o que a API traz", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.ids("mercadolivre")[0];
    const r = await m.captura.processar({ canal: "mercadolivre", id });
    expect(r.acao).toBe("criada");
    const [l] = await exec(
      `SELECT r.estado::text AS estado, r.treino, r."origemRegistro" AS origem, r.pedido, r.descricao,
              r."prazoMarketplace"::text AS prazo, r."protocoloExterno" AS protocolo, r."camposCanal" AS campos,
              r."clienteNome" AS cliente, r.cidade, r.uf, p.codigo, m.nome AS marca,
              c.estorno::float AS estorno,
              (SELECT count(*)::int FROM reclamacao_fotos f WHERE f."reclamacaoId" = r.id) AS fotos,
              (SELECT count(*)::int FROM estado_historico h WHERE h."reclamacaoId" = r.id AND h.para = 'triagem') AS hist
         FROM reclamacoes r
         JOIN produtos p ON p.id = r."produtoId"
         JOIN marcas m ON m.id = r."marcaId"
         JOIN custos c ON c."reclamacaoId" = r.id
        WHERE r.id = $1`,
      [r.reclamacaoId],
    );
    expect(l).toMatchObject({
      estado: "triagem",
      treino: true,
      origem: "canal",
      codigo: "G48",
      marca: "AISA",
      prazo: "2026-10-25",
      protocolo: id,
      estorno: 289.9,
      fotos: 2,
      hist: 1,
      uf: "SP",
    });
    expect(String(l.cliente)).toMatch(/Fictício/);
    expect(l.campos).toEqual(
      expect.arrayContaining([
        "descricao",
        "pedido",
        "produtoId",
        "clienteNome",
        "cidade",
        "uf",
        "prazoMarketplace",
        "protocoloExterno",
      ]),
    );
    const [cap] = await exec(
      `SELECT "idExterno", status::text AS status FROM capturas_canal WHERE "reclamacaoId" = $1`,
      [r.reclamacaoId],
    );
    expect(cap.idExterno).toBe(`treino-${id}`);
    expect(cap.status).toBe("aceito");
  });

  it("canal real (não simulado) cria reclamação que NÃO é treino, com a chave sem prefixo", async () => {
    const m = montar({ simulado: false });
    await autorizar(m);
    const id = m.sim.ids("mercadolivre")[1];
    const r = await m.captura.processar({ canal: "mercadolivre", id });
    const [l] = await exec(`SELECT treino FROM reclamacoes WHERE id = $1`, [
      r.reclamacaoId,
    ]);
    expect(l.treino).toBe(false);
    const [cap] = await exec(
      `SELECT "idExterno" FROM capturas_canal WHERE "reclamacaoId" = $1`,
      [r.reclamacaoId],
    );
    expect(cap.idExterno).toBe(id);
  });

  it("o mesmo caso duas vezes não duplica", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.ids("mercadolivre")[2];
    const a = await m.captura.processar({ canal: "mercadolivre", id });
    const b = await m.captura.processar({ canal: "mercadolivre", id });
    expect(a.acao).toBe("criada");
    expect(b.acao).toBe("duplicada");
    expect(b.reclamacaoId).toBe(a.reclamacaoId);
    expect(await canalReclamacoes()).toBe(1);
  });

  it("o caso que volta alterado atualiza a reclamação em vez de criar outra", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.ids("mercadolivre")[0];
    const a = await m.captura.processar({ canal: "mercadolivre", id });
    m.avancar(60_000);
    m.sim.atualizar("mercadolivre", id, {
      acrescentar: "Complemento do comprador.",
      prazoMaisDias: 2,
    });
    const b = await m.captura.processar({ canal: "mercadolivre", id });
    expect(b.acao).toBe("atualizada");
    expect(b.reclamacaoId).toBe(a.reclamacaoId);
    const [l] = await exec(
      `SELECT descricao, "prazoMarketplace"::text AS prazo FROM reclamacoes WHERE id = $1`,
      [a.reclamacaoId],
    );
    expect(l.descricao).toContain("Complemento do comprador.");
    expect(l.prazo).toBe("2026-10-27");
    expect(await canalReclamacoes()).toBe(1);
  });

  it("atualização não sobrescreve o texto de quem já tratou a reclamação", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.ids("mercadolivre")[0];
    const a = await m.captura.processar({ canal: "mercadolivre", id });
    await exec(
      `UPDATE reclamacoes SET estado = 'em_tratativa', descricao = 'Texto já tratado pelo setor' WHERE id = $1`,
      [a.reclamacaoId],
    );
    m.avancar(60_000);
    m.sim.atualizar("mercadolivre", id, {
      acrescentar: "Complemento.",
      prazoMaisDias: 1,
    });
    await m.captura.processar({ canal: "mercadolivre", id });
    const [l] = await exec(
      `SELECT descricao, "prazoMarketplace"::text AS prazo FROM reclamacoes WHERE id = $1`,
      [a.reclamacaoId],
    );
    expect(l.descricao).toBe("Texto já tratado pelo setor");
    expect(l.prazo).toBe("2026-10-26");
  });

  it("caso sem dado suficiente entra, com aviso do que faltou e sem produto", async () => {
    const m = montar();
    await autorizar(m);
    const r = await m.captura.processar({
      canal: "mercadolivre",
      id: m.sim.ids("mercadolivre")[9],
    });
    const [l] = await exec(
      `SELECT descricao, observacao, "produtoId" AS produto, "camposCanal"::text AS campos FROM reclamacoes WHERE id = $1`,
      [r.reclamacaoId],
    );
    expect(l.descricao).toContain("não enviou o texto");
    expect(l.observacao).toContain("texto do comprador, SKU");
    expect(l.produto).toBeNull();
    expect(l.campos).not.toContain("produtoId");
    expect(l.campos).not.toContain("descricao");
  });

  it("a devolução da Shopee entra com o e-mail mascarado e o valor no custo", async () => {
    const m = montar();
    await autorizar(m);
    const [d] = await m.shopee.listarAtualizadas(TS0 - 7 * 86400, TS0 + 3600);
    const r = await m.captura.processar({ canal: "shopee", id: d.return_sn });
    expect(r.acao).toBe("criada");
    const [l] = await exec(
      `SELECT r.pedido, r.treino, c.estorno::float AS estorno, k.payload::text AS payload
         FROM reclamacoes r JOIN custos c ON c."reclamacaoId" = r.id JOIN capturas_canal k ON k."reclamacaoId" = r.id WHERE r.id = $1`,
      [r.reclamacaoId],
    );
    expect(l.pedido).toBe(d.order_sn);
    expect(l.treino).toBe(true);
    expect(l.estorno).toBe(d.refund_amount);
    expect(String(l.payload)).toContain("*");
  });

  it("dois casos do mesmo pedido são duas reclamações (a chave é o id do caso)", async () => {
    const m = montar();
    await autorizar(m);
    const ids = m.sim.ids("mercadolivre");
    const a = await m.captura.processar({ canal: "mercadolivre", id: ids[0] });
    const b = await m.captura.processar({ canal: "mercadolivre", id: ids[8] });
    expect(a.reclamacaoId).not.toBe(b.reclamacaoId);
    const n = await contar(
      `SELECT count(DISTINCT pedido)::int AS n FROM reclamacoes WHERE "origemRegistro" = 'canal'`,
    );
    expect(n).toBe(1);
  });

  it("não toca nas reclamações reais", async () => {
    const m = montar();
    await autorizar(m);
    await m.captura.processar({
      canal: "mercadolivre",
      id: m.sim.ids("mercadolivre")[0],
    });
    const [r] = await exec(
      `SELECT descricao, treino FROM reclamacoes WHERE id = 'real-1'`,
    );
    expect(r).toEqual({ descricao: "Reclamação real do teste", treino: false });
  });
});

// ---------- Avisos ----------

describe("avisos (webhooks)", () => {
  beforeEach(limpar);

  it("aviso do Mercado Livre assinado: responde 200 rápido e a fila grava a reclamação", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.novoCaso("mercadolivre");
    const a = m.sim.avisoML(id);
    const inicio = performance.now();
    const r = await m.captura.receberAvisoML(a.corpo, a.assinatura, {
      dataId: a.dataId,
      requestId: a.requestId,
    });
    expect(performance.now() - inicio).toBeLessThan(500);
    expect(r.status).toBe(200);
    await m.captura.fila.ocioso();
    expect(await canalReclamacoes()).toBe(1);
  });

  it("assinatura inválida: 401 e nada é gravado nem buscado", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.novoCaso("mercadolivre");
    const a = m.sim.avisoML(id);
    const antes = m.chamadas.length;
    expect(
      (await m.captura.receberAvisoML(a.corpo, "0".repeat(64))).status,
    ).toBe(401);
    expect((await m.captura.receberAvisoML(a.corpo, undefined)).status).toBe(
      401,
    );
    await m.captura.fila.ocioso();
    expect(m.chamadas.length).toBe(antes);
    expect(await canalReclamacoes()).toBe(0);
  });

  it("aviso de outro tópico ou corpo inválido não vira reclamação", async () => {
    const m = montar();
    const segredo = CREDENCIAIS_SIMULADAS.mercadolivre.segredo;
    const header = cabecalhoAvisoML(segredo, { ts: "1700000000" });
    const corpo = JSON.stringify({
      resource: "orders/1",
      topic: "orders_v2",
      actions: [],
    });
    expect((await m.captura.receberAvisoML(corpo, header)).status).toBe(200);
    expect((await m.captura.receberAvisoML("não é json", header)).status).toBe(
      400,
    );
    expect(await canalReclamacoes()).toBe(0);
  });

  it("push 29 da Shopee assinado no Authorization: 200 e a reclamação é gravada", async () => {
    const m = montar();
    await autorizar(m);
    const sn = m.sim.novoCaso("shopee");
    const p = m.sim.pushShopee(sn, URL_PUSH);
    expect(
      (await m.captura.receberPushShopee(URL_PUSH, p.corpo, p.authorization))
        .status,
    ).toBe(200);
    await m.captura.fila.ocioso();
    expect(await canalReclamacoes()).toBe(1);
  });

  it("push com assinatura de outra URL ou corpo alterado: 401", async () => {
    const m = montar();
    await autorizar(m);
    const sn = m.sim.novoCaso("shopee");
    const p = m.sim.pushShopee(sn, "http://outra.url/webhook");
    expect(
      (await m.captura.receberPushShopee(URL_PUSH, p.corpo, p.authorization))
        .status,
    ).toBe(401);
    const ok = m.sim.pushShopee(sn, URL_PUSH);
    expect(
      (
        await m.captura.receberPushShopee(
          URL_PUSH,
          `${ok.corpo} `,
          ok.authorization,
        )
      ).status,
    ).toBe(401);
    expect(await canalReclamacoes()).toBe(0);
  });

  it("push de outro código (não é o 29) é ignorado", async () => {
    const m = montar();
    const corpo = JSON.stringify({ code: 12, data: {} });
    const r = await m.captura.receberPushShopee(
      URL_PUSH,
      corpo,
      hmacHex(CREDENCIAIS_SIMULADAS.shopee.partnerKey, `${URL_PUSH}|${corpo}`),
    );
    expect(r.status).toBe(200);
    expect(await canalReclamacoes()).toBe(0);
  });

  it("o mesmo aviso duas vezes não duplica nada", async () => {
    const m = montar();
    await autorizar(m);
    const id = m.sim.novoCaso("mercadolivre");
    const a = m.sim.avisoML(id);
    await Promise.all([
      m.captura.receberAvisoML(a.corpo, a.assinatura, {
        dataId: a.dataId,
        requestId: a.requestId,
      }),
      m.captura.receberAvisoML(a.corpo, a.assinatura, {
        dataId: a.dataId,
        requestId: a.requestId,
      }),
    ]);
    await m.captura.fila.ocioso();
    expect(await canalReclamacoes()).toBe(1);
  });
});

// ---------- Aviso perdido recuperado pela busca ----------

describe("busca periódica", () => {
  beforeEach(limpar);

  it("a primeira busca traz todos os casos do canal; a segunda não repete nenhum", async () => {
    const m = montar();
    await autorizar(m);
    const a = await m.captura.buscar("mercadolivre");
    await m.captura.fila.ocioso();
    expect(a).toEqual({ vistos: 12, enfileirados: 12 });
    expect(await canalReclamacoes()).toBe(12);
    const b = await m.captura.buscar("mercadolivre");
    expect(b).toEqual({ vistos: 12, enfileirados: 0 });
    expect(await canalReclamacoes()).toBe(12);
  });

  it("o aviso que se perdeu é recuperado: só o caso novo é processado", async () => {
    const m = montar();
    await autorizar(m);
    await m.captura.buscar("shopee");
    await m.captura.fila.ocioso();
    expect(await canalReclamacoes()).toBe(12);
    const sn = m.sim.novoCaso("shopee"); // o push nunca chegou
    m.avancar(120_000);
    const r = await m.captura.buscar("shopee");
    await m.captura.fila.ocioso();
    expect(r.enfileirados).toBe(1);
    expect(await canalReclamacoes()).toBe(13);
    const n = await contar(
      `SELECT count(*)::int AS n FROM capturas_canal WHERE "idExterno" = $1`,
      [`treino-${sn}`],
    );
    expect(n).toBe(1);
  });

  it("caso alterado no canal sem aviso também é pego pela busca", async () => {
    const m = montar();
    await autorizar(m);
    await m.captura.buscar("mercadolivre");
    await m.captura.fila.ocioso();
    m.avancar(120_000);
    m.sim.atualizar("mercadolivre", m.sim.ids("mercadolivre")[3], {
      prazoMaisDias: 1,
    });
    const r = await m.captura.buscar("mercadolivre");
    await m.captura.fila.ocioso();
    expect(r.enfileirados).toBe(1);
    expect(await canalReclamacoes()).toBe(12);
  });

  it("caso encerrado no canal sai da lista de abertos", async () => {
    const m = montar();
    await autorizar(m);
    m.sim.atualizar("mercadolivre", m.sim.ids("mercadolivre")[0], {
      encerrar: true,
    });
    const r = await m.captura.buscar("mercadolivre");
    await m.captura.fila.ocioso();
    expect(r.vistos).toBe(11);
  });
});

// ---------- Cenários e linha do tempo ----------

describe("cenários da simulação", () => {
  beforeEach(limpar);

  it("novo caso do Mercado Livre: mostra cada etapa, na ordem, com tempo", async () => {
    const m = montar();
    const r = await m.cenarios.executar("novo_caso", "mercadolivre");
    expect(r.ok).toBe(true);
    expect(await canalReclamacoes()).toBe(1);
    const etapas = m.registro.listar().map((p) => p.etapa);
    const ordem = [
      "autorização iniciada",
      "trocou o code por token",
      "novo caso no canal",
      "canal enviou o aviso",
      "aviso recebido",
      "respondeu ao aviso",
      "buscou a reclamação",
      "buscou o detalhe",
      "buscou o motivo",
      "buscou o pedido",
      "mapeou",
      "gravou",
      "criou a reclamação em Triagem",
    ];
    let ultimo = -1;
    for (const e of ordem) {
      const i = etapas.indexOf(e);
      expect(i, e).toBeGreaterThan(ultimo);
      ultimo = i;
    }
    expect(
      m.registro.listar().find((p) => p.etapa === "respondeu ao aviso")?.ms,
    ).not.toBeNull();
  });

  it("nova devolução da Shopee passa pelo push assinado e cria a reclamação", async () => {
    const m = montar();
    const r = await m.cenarios.executar("novo_caso", "shopee");
    expect(r.ok).toBe(true);
    expect(await canalReclamacoes()).toBe(1);
    const etapas = m.registro.listar().map((p) => p.etapa);
    expect(etapas).toEqual(
      expect.arrayContaining([
        "buscou o detalhe da devolução",
        "criou a reclamação em Triagem",
      ]),
    );
  });

  it("atualização: o caso conhecido volta e a reclamação é atualizada, não duplicada", async () => {
    const m = montar();
    const r = await m.cenarios.executar("atualizacao", "mercadolivre");
    expect(r.ok).toBe(true);
    expect(await canalReclamacoes()).toBe(1);
    expect(
      m.registro
        .listar()
        .some((p) => p.etapa === "atualizou a reclamação do caso que voltou"),
    ).toBe(true);
  });

  it("aviso duplicado: nada é duplicado e o registro mostra que o caso já estava gravado", async () => {
    const m = montar();
    const r = await m.cenarios.executar("aviso_duplicado", "shopee");
    expect(r.ok).toBe(true);
    expect(await canalReclamacoes()).toBe(1);
    expect(
      m.registro
        .listar()
        .some(
          (p) =>
            p.etapa.startsWith("caso já gravado") ||
            p.etapa === "aviso repetido ignorado na fila",
        ),
    ).toBe(true);
  });

  it("aviso perdido: a busca periódica recupera o caso", async () => {
    const m = montar();
    const r = await m.cenarios.executar("aviso_perdido", "mercadolivre");
    expect(r.ok).toBe(true);
    const etapas = m.registro.listar().map((p) => p.etapa);
    expect(etapas).toContain("aviso perdido");
    expect(etapas).toContain("busca periódica concluída");
    expect(await canalReclamacoes()).toBe(12 + 1);
  });

  it("reiniciar volta o marketplace ao conjunto inicial e não apaga reclamações", async () => {
    const m = montar();
    await m.cenarios.executar("novo_caso", "mercadolivre");
    expect(m.sim.ids("mercadolivre")).toHaveLength(13);
    await m.cenarios.executar("reiniciar", "mercadolivre");
    expect(m.sim.ids("mercadolivre")).toHaveLength(12);
    expect(await canalReclamacoes()).toBe(1);
  });

  it("o registro não guarda token, assinatura nem dado do comprador", async () => {
    const m = montar();
    await m.cenarios.executar("novo_caso", "mercadolivre");
    await m.cenarios.executar("novo_caso", "shopee");
    const tudo = JSON.stringify(m.registro.listar());
    expect(tudo).not.toMatch(/APP_USR|TG-sim|sim-access|sim-refresh/);
    expect(tudo).not.toMatch(/\.invalid/);
    expect(tudo).not.toMatch(/Fictício|TREINO_COMPRADOR|\(00\)/);
    expect(tudo).not.toContain(CREDENCIAIS_SIMULADAS.mercadolivre.segredo);
    expect(tudo).not.toContain(CREDENCIAIS_SIMULADAS.shopee.partnerKey);
  });

  it("nenhuma chamada sai do marketplace simulado: o único host é o simulado", async () => {
    const m = montar();
    const hosts = new Set<string>();
    const original = m.http;
    const espiao = (async (i: string | URL | Request, init?: RequestInit) => {
      hosts.add(new URL(String(i)).host);
      return original(i, init);
    }) as typeof fetch;
    const ml = new ClienteML(
      {
        baseUrl: BASE,
        appId: CREDENCIAIS_SIMULADAS.mercadolivre.appId,
        segredo: CREDENCIAIS_SIMULADAS.mercadolivre.segredo,
        redirectUri: "https://x.invalid/cb",
      },
      new ArmazemMemoria(),
      espiao,
      () => T0,
    );
    await ml.autorizar(m.sim.codeAtual("mercadolivre"));
    await ml.buscarAbertas();
    expect([...hosts]).toEqual(["marketplace.simulado"]);
  });
});

// ---------- O que falta para funcionar de verdade ----------

describe("o que falta para funcionar de verdade", () => {
  it("lista o que o canal exige e marca o que o sistema consegue conferir", () => {
    const nada = faltaParaFuncionar("mercadolivre", {
      credenciais: false,
      autorizado: false,
      urlPublica: false,
      apiReal: false,
    });
    expect(nada.length).toBeGreaterThanOrEqual(5);
    expect(nada.every((i) => i.feito === false || i.feito === null)).toBe(true);
    expect(nada.some((i) => i.feito === null)).toBe(true);
    const tudo = faltaParaFuncionar("shopee", {
      credenciais: true,
      autorizado: true,
      urlPublica: true,
      apiReal: true,
    });
    expect(tudo.filter((i) => i.feito === false)).toHaveLength(0);
    expect(tudo.some((i) => i.item.includes("Push 29"))).toBe(true);
    expect(tudo.some((i) => i.item.includes("aprovada"))).toBe(true);
  });
});

// ---------- Campo do canal protegido contra edição sem motivo ----------

describe("campo que veio do canal só muda com motivo", () => {
  const REF = {
    canais: new Set(["c1"]),
    marcas: new Set<string>(),
    bancadas: new Set<string>(),
    setores: new Set<string>(),
    causaSetor: new Map<string, string>(),
  };

  function servico(camposCanal: string[]) {
    const auditorias: AuditoriaNova[] = [];
    const repo: RepositorioEscrita = {
      referencias: async () => REF,
      produtoPorCodigo: async () => null,
      obterAtual: async (): Promise<RegistroAtual> => ({
        id: "r1",
        numero: 5,
        camposCanal,
        estado: {
          ...estadoVazio("c1", "2026-10-20"),
          descricao: "Texto que veio do canal",
          pedido: "123",
        },
      }),
      criar: async () => ({ id: "x", numero: 1 }),
      atualizar: async (a) => {
        auditorias.push(a.auditoria);
      },
    };
    return { s: new ServicoEscrita(repo, () => T0), auditorias };
  }
  const gestor: UsuarioLogado = {
    id: "u1",
    login: "g",
    nome: "Gestor",
    perfil: "gestor",
    setores: [],
    permissoes: mesclarPermissoes("gestor", []),
  };

  it("editar o campo do canal sem motivo é recusado, com o nome do campo", async () => {
    const { s, auditorias } = servico(["descricao", "pedido"]);
    await expect(
      s.editar("r1", { descricao: "Texto alterado à mão" }, gestor),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.editar("r1", { descricao: "Outro", motivoCanal: "abc" }, gestor),
    ).rejects.toBeInstanceOf(ErroEscrita);
    expect(auditorias).toHaveLength(0);
  });

  it("com motivo, a edição passa e o motivo vai para a auditoria", async () => {
    const { s, auditorias } = servico(["descricao"]);
    const r = await s.editar(
      "r1",
      {
        descricao: "Texto corrigido",
        motivoCanal: "O cliente corrigiu por telefone",
      },
      gestor,
    );
    expect(r.alterou).toBe(true);
    expect(auditorias[0].extra.motivoCanal).toBe(
      "O cliente corrigiu por telefone",
    );
  });

  it("campo que não veio do canal edita livremente, sem motivo", async () => {
    const { s, auditorias } = servico(["descricao"]);
    const r = await s.editar("r1", { observacao: "Anotação do SAC" }, gestor);
    expect(r.alterou).toBe(true);
    expect(auditorias[0].extra.motivoCanal).toBeUndefined();
  });

  it("reclamação feita à mão (sem campos do canal) não pede motivo", async () => {
    const { s } = servico([]);
    const r = await s.editar("r1", { descricao: "Texto novo" }, gestor);
    expect(r.alterou).toBe(true);
  });

  it("a função pura confere só os campos protegidos que mudaram", () => {
    const m = [
      { campo: "descricao", alterado: true as const },
      { campo: "laudo", alterado: true as const },
    ];
    expect(camposDoCanalAlterados(m, ["descricao", "pedido"])).toEqual([
      "descricao",
    ]);
    expect(camposDoCanalAlterados(m, [])).toEqual([]);
    expect(camposDoCanalAlterados(m, undefined)).toEqual([]);
  });

  it("o corpo aceita motivoCanal como texto curto", () => {
    expect(
      lerEntrada({ descricao: "x", motivoCanal: " Corrigido " }, "editar"),
    ).toEqual({
      ok: true,
      entrada: { descricao: "x", motivoCanal: "Corrigido" },
    });
    expect(lerEntrada({ motivoCanal: 3 }, "editar").ok).toBe(false);
  });
});

// ---------- A rota /simulado ----------

describe("rota /simulado", () => {
  async function chamar(
    ativo: boolean,
    req: {
      method: string;
      originalUrl: string;
      headers: Record<string, string>;
      body?: unknown;
    },
  ) {
    const sim = new MarketplaceSimulado({ agora: () => T0 });
    const canais = {
      situacao: async () => ({ ativo, forcadoPorAmbiente: false }),
      simulador: sim,
    } as unknown as ServicoCanais;
    let status = 0;
    let json: unknown;
    const res = {
      status(s: number) {
        status = s;
        return this;
      },
      json(j: unknown) {
        json = j;
      },
    };
    await manipuladorSimulado(canais)(req as never, res as never);
    return { status, json: json as Record<string, unknown>, sim };
  }

  it("desligado, a rota não existe (404): nada do simulado vaza em produção", async () => {
    const r = await chamar(false, {
      method: "POST",
      originalUrl: "/simulado/oauth/token",
      headers: {},
    });
    expect(r.status).toBe(404);
  });

  it("ligado, o OAuth do Mercado Livre aceita o formulário e devolve o token", async () => {
    const r = await chamar(true, {
      method: "POST",
      originalUrl: "/simulado/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: {
        grant_type: "authorization_code",
        client_id: CREDENCIAIS_SIMULADAS.mercadolivre.appId,
        client_secret: CREDENCIAIS_SIMULADAS.mercadolivre.segredo,
        code: CREDENCIAIS_SIMULADAS.mercadolivre.code,
        redirect_uri: "https://sac.exemplo.invalid/callback",
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.token_type).toBe("Bearer");
    expect(r.json.expires_in).toBe(21600);
  });

  it("ligado, sem token a API responde 401 como a real", async () => {
    const r = await chamar(true, {
      method: "GET",
      originalUrl:
        "/simulado/post-purchase/v1/claims/search?players.role=respondent",
      headers: {},
    });
    expect(r.status).toBe(401);
    expect(r.json.message).toBe("invalid_token");
  });

  it("ligado, a Shopee confere a assinatura do corpo JSON", async () => {
    const r = await chamar(true, {
      method: "POST",
      originalUrl: `/simulado/api/v2/auth/token/get?partner_id=${CREDENCIAIS_SIMULADAS.shopee.partnerId}&timestamp=${TS0}&sign=${"0".repeat(64)}`,
      headers: { "content-type": "application/json" },
      body: { code: "x" },
    });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("error_sign");
  });
});
