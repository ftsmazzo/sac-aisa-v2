import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  hashToken,
  type RepositorioAuth,
  ServicoAuth,
  type SessaoRegistro,
  type UsuarioLogado,
  type UsuarioRegistro,
} from "@sac-aisa/auth";
import {
  avaliarAlertasReclamacao,
  ESTADOS,
  type Estado,
  mesclarPermissoes,
  type Perfil,
} from "@sac-aisa/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type DadosCard,
  type RepositorioClickup,
  ServicoClickup,
} from "./clickup";
import {
  type LinhaAberta,
  type RepositorioFila,
  ServicoFilaAlertas,
} from "./fila-alertas";
import { lerEntradaIntegracao } from "./integracoes";
import {
  filtroDeEscopo,
  filtroDeTreino,
  filtroPorId,
  montarFiltro,
} from "./reclamacoes";
import { type RepositorioRelatorios, ServicoRelatorios } from "./relatorios";
import {
  apagarTreino,
  carregarDemonstracao,
  DEMONSTRACAO,
  type Executor,
  simularCanal,
  type Transacao,
} from "./treino";
import {
  exigirAdministrador,
  exigirGestao,
  lerCanal,
} from "./treino.controller";
import {
  cargaMercadoLivre,
  cargaShopee,
  lerCargaMercadoLivre,
  lerCargaShopee,
} from "./treino-canais";

const AGORA = new Date("2026-10-22T15:00:00Z");
const HOJE = "2026-10-22";

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

const CAUSAS = [
  "prazo",
  "solda",
  "ferrugem",
  "pintura",
  "defeito",
  "avaria",
  "pecas",
  "cuba_furada",
  "kit",
  "erro_envio",
];

/** Banco com o esquema real e o cadastro mínimo que o treino usa, mais dados "reais" que não podem ser tocados. */
async function prepararBanco() {
  db = new PGlite();
  for (const m of [
    "20261022000000_base_v2",
    "20261023000000_integracoes",
    "20261024000000_clickup_sincronizacao",
    "20261025000000_jornada",
    "20261026000000_treino",
  ]) {
    await db.exec(migracao(m));
  }
  await db.exec(`
    INSERT INTO marcas (id, nome, ativa) VALUES
      ('m-aisa', 'AISA', true), ('m-art', 'ARTMAQ', true), ('m-ara', 'ARAUCA', true);
    INSERT INTO canais (id, nome, tipo) VALUES
      ('canal-mercado-livre', 'Mercado Livre', 'marketplace'),
      ('canal-shopee', 'Shopee', 'marketplace'),
      ('canal-site', 'Site', 'interno'),
      ('canal-whatsapp', 'WhatsApp', 'interno');
    INSERT INTO setores (id, nome) VALUES ('s-solda', 'Solda'), ('s-log', 'Logística');
    INSERT INTO bancadas (id, codigo, nome) VALUES ('b-01', '01', 'Bancada 01'), ('b-02', '02', 'Bancada 02');
    INSERT INTO produtos (id, codigo, nome, categoria) VALUES
      ('p-a1', 'A100', 'Produto exemplo AISA 1', 'PRODUTO AISA'),
      ('p-a2', 'A200', 'Produto exemplo AISA 2', 'PRODUTO AISA'),
      ('p-t1', 'T100', 'Produto exemplo ARTMAQ 1', 'PRODUTO ARTMAQ'),
      ('p-r1', 'R100', 'Produto exemplo ARAUCA 1', 'PRODUTO ARAUCA');
    ${CAUSAS.map(
      (c, i) =>
        `INSERT INTO causas (id, categoria, nome, ordem, "setorId") VALUES ('${c}', 'Teste', 'Causa ${c}', ${i}, '${i % 2 ? "s-log" : "s-solda"}');`,
    ).join("\n")}

    -- Dado real (fictício neste teste): nada disto pode sumir ou mudar.
    INSERT INTO reclamacoes (id, "canalId", "marcaId", "dataAbertura", "alteradoEm", descricao, "origemRegistro")
      VALUES ('real-1', 'canal-site', 'm-aisa', '2026-10-01', now(), 'Reclamação real do teste', 'web'),
             ('real-2', 'canal-shopee', 'm-art', '2026-10-05', now(), 'Outra reclamação real do teste', 'importado');
    INSERT INTO custos ("reclamacaoId", "freteEnvio") VALUES ('real-1', 10), ('real-2', 20);
    INSERT INTO estado_historico (id, "reclamacaoId", para, "autorNome") VALUES ('real-h1', 'real-1', 'triagem', 'Pessoa');
    INSERT INTO capturas_canal (id, "canalId", "idExterno", payload, status, "reclamacaoId")
      VALUES ('real-cap', 'canal-shopee', 'REAL-1', '{}', 'aceito', 'real-2');
    INSERT INTO alertas (id, tipo, titulo, mensagem, "reclamacaoId", "chaveDedupe")
      VALUES ('real-alerta', 'CUSTO_ALTO', 't', 'm', 'real-1', 'real-1-custo');
    INSERT INTO auditoria (id, acao, "reclamacaoId") VALUES ('real-aud', 'reclamacao.criar', 'real-1');
  `);
}

beforeAll(prepararBanco);
afterAll(async () => {
  await db.close();
});

const reais = () =>
  contar(`SELECT count(*)::int AS n FROM reclamacoes WHERE treino = false`);
const treino = () =>
  contar(`SELECT count(*)::int AS n FROM reclamacoes WHERE treino = true`);

/** Fotografia de tudo o que é real: precisa ser igual antes e depois de qualquer operação de treino. */
async function fotoDoReal() {
  return {
    reclamacoes: await exec(
      `SELECT id, numero, descricao, estado::text AS estado, "origemRegistro" FROM reclamacoes WHERE treino = false ORDER BY id`,
    ),
    custos: await exec(
      `SELECT "reclamacaoId", "freteEnvio"::text AS frete FROM custos WHERE "reclamacaoId" LIKE 'real-%' ORDER BY 1`,
    ),
    historico: await exec(
      `SELECT id FROM estado_historico WHERE id LIKE 'real-%'`,
    ),
    capturas: await exec(
      `SELECT id FROM capturas_canal WHERE id LIKE 'real-%'`,
    ),
    alertas: await exec(`SELECT id FROM alertas WHERE id LIKE 'real-%'`),
    auditoria: await exec(`SELECT id FROM auditoria WHERE id LIKE 'real-%'`),
  };
}

describe("migração do treino", () => {
  it("é aditiva: tudo o que já existia fica como dado real", async () => {
    expect(await reais()).toBe(2);
    expect(await treino()).toBe(0);
    const u = await exec(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'modoTreino'`,
    );
    expect(u[0].n).toBe(1);
    const i = await exec(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'reclamacoes' AND indexname = 'reclamacoes_treino_idx'`,
    );
    expect(i).toHaveLength(1);
  });
});

describe("dados de demonstração", () => {
  beforeEach(async () => {
    await apagarTreino(transacao);
  });

  it("cria 18 reclamações fictícias, todas marcadas como treino", async () => {
    expect(DEMONSTRACAO).toHaveLength(18);
    const r = await carregarDemonstracao(transacao, AGORA);
    expect(r).toEqual({ criadas: 18, jaExistiam: 0 });
    expect(await treino()).toBe(18);
    const marcadas = await contar(
      `SELECT count(*)::int AS n FROM reclamacoes WHERE treino = true AND "origemRegistro" = 'demonstracao'`,
    );
    expect(marcadas).toBe(18);
  });

  it("cobre os sete estados e as três marcas", async () => {
    await carregarDemonstracao(transacao, AGORA);
    const estados = await exec(
      `SELECT DISTINCT estado::text AS e FROM reclamacoes WHERE treino = true`,
    );
    expect(estados.map((l) => l.e as Estado).sort()).toEqual(
      [...ESTADOS].sort(),
    );
    const marcas = await exec(
      `SELECT DISTINCT m.nome FROM reclamacoes r JOIN marcas m ON m.id = r."marcaId" WHERE r.treino = true`,
    );
    expect(marcas.map((m) => m.nome).sort()).toEqual([
      "AISA",
      "ARAUCA",
      "ARTMAQ",
    ]);
  });

  it("usa produtos, causas, setores e bancadas que já existem no cadastro", async () => {
    await carregarDemonstracao(transacao, AGORA);
    const c = await contar(
      `SELECT count(*)::int AS n FROM reclamacoes r
         LEFT JOIN produtos p ON p.id = r."produtoId"
        WHERE r.treino = true AND p.id IS NULL`,
    );
    expect(c).toBe(0);
    const semSetor = await contar(
      `SELECT count(*)::int AS n FROM reclamacoes
        WHERE treino = true AND "causaId" IS NOT NULL AND "setorRespId" IS NULL`,
    );
    expect(semSetor).toBe(0);
    const comBancada = await contar(
      `SELECT count(*)::int AS n FROM reclamacoes WHERE treino = true AND "bancadaId" IS NOT NULL`,
    );
    expect(comBancada).toBeGreaterThan(0);
  });

  it("tem histórico de estados coerente: termina no estado atual e tem uma reabertura", async () => {
    await carregarDemonstracao(transacao, AGORA);
    const incoerentes = await contar(
      `SELECT count(*)::int AS n FROM reclamacoes r
        WHERE r.treino = true AND r.estado::text <> (
          SELECT h.para::text FROM estado_historico h
           WHERE h."reclamacaoId" = r.id ORDER BY h.quando DESC LIMIT 1)`,
    );
    expect(incoerentes).toBe(0);
    const reaberta = await exec(
      `SELECT r.estado::text AS estado, r."dataAcao"::text AS acao FROM reclamacoes r
        JOIN estado_historico h ON h."reclamacaoId" = r.id AND h.reabertura = true
       WHERE r.treino = true`,
    );
    expect(reaberta).toEqual([{ estado: "encaminhada", acao: null }]);
    // Nenhum passo no futuro.
    const futuro = await contar(
      `SELECT count(*)::int AS n FROM estado_historico h
         JOIN reclamacoes r ON r.id = h."reclamacaoId"
        WHERE r.treino = true AND h.quando > $1::timestamp`,
      [AGORA.toISOString().replace("Z", "")],
    );
    expect(futuro).toBe(0);
  });

  it("dispara os alertas e deixa uma reclamação perto do prazo do marketplace", async () => {
    await carregarDemonstracao(transacao, AGORA);
    const linhas = await exec(
      `SELECT r.id, r."dataAbertura"::text AS "dataAbertura", r."dataAcao"::text AS "dataAcao",
              r.estado::text AS estado, to_char(r."estadoDesde", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "estadoDesde",
              r."prazoMarketplace"::text AS prazo, r.devolucao::text AS devolucao,
              r."causaId", r.descricao, r.laudo, r.solucao,
              c."freteEnvio"::float AS "freteEnvio", c."freteRetorno"::float AS "freteRetorno",
              c."valorPeca"::float AS "valorPeca", c.estorno::float AS estorno,
              c.desconto::float AS desconto, c.guia::float AS guia
         FROM reclamacoes r JOIN custos c ON c."reclamacaoId" = r.id WHERE r.treino = true`,
    );
    const tipos = new Set<string>();
    for (const l of linhas) {
      const alertas = avaliarAlertasReclamacao(
        {
          data: l.dataAbertura as string,
          dataAcao: l.dataAcao as string | null,
          estado: l.estado as Estado,
          estadoDesde: l.estadoDesde as string,
          prazoMarketplace: l.prazo as string | null,
          devolucao: l.devolucao as "NA" | "AGUARDANDO" | "RECEBIDO",
          causaId: l.causaId as string | null,
          causaManual: false,
          reclamacao: l.descricao as string,
          laudo: l.laudo as string,
          solucao: l.solucao as string,
          freteEnvio: l.freteEnvio as number,
          freteRetorno: l.freteRetorno as number,
          valorPeca: l.valorPeca as number,
          estorno: l.estorno as number,
          desconto: l.desconto as number,
          guia: l.guia as number,
        },
        undefined,
        HOJE,
        AGORA,
      );
      for (const a of alertas) tipos.add(a);
    }
    for (const esperado of [
      "SEM_RECEBIMENTO_SETOR",
      "SOLUCAO_SEM_FINALIZACAO",
      "PRAZO_MARKETPLACE",
      "TRATATIVA_META",
      "CUSTO_ALTO",
      "AGUARDANDO_DIAS",
    ]) {
      expect(tipos.has(esperado), esperado).toBe(true);
    }
  });

  it("só tem gente inventada: e-mails inválidos, telefones com DDD 00 e nomes fictícios", async () => {
    await carregarDemonstracao(transacao, AGORA);
    const caps = await exec(
      `SELECT payload::text AS p FROM capturas_canal WHERE "idExterno" LIKE 'treino-%'`,
    );
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      for (const email of String(c.p).match(/[\w.*-]+@[\w.*-]+/g) ?? []) {
        expect(email.endsWith(".invalid"), email).toBe(true);
      }
      for (const fone of String(c.p).match(/"area_code":"\d+"/g) ?? []) {
        expect(fone).toBe('"area_code":"00"');
      }
    }
    const nomes = await exec(
      `SELECT DISTINCT "clienteNome" AS n FROM reclamacoes WHERE treino = true`,
    );
    for (const l of nomes) {
      expect(String(l.n)).toMatch(/Fictício|treino/i);
    }
  });

  it("é idempotente: rodar de novo não cria nem duplica nada", async () => {
    await carregarDemonstracao(transacao, AGORA);
    const foto = async () => ({
      rec: await treino(),
      hist: await contar(`SELECT count(*)::int AS n FROM estado_historico`),
      custos: await contar(`SELECT count(*)::int AS n FROM custos`),
      caps: await contar(`SELECT count(*)::int AS n FROM capturas_canal`),
      causas: await contar(`SELECT count(*)::int AS n FROM reclamacao_causas`),
      analises: await contar(`SELECT count(*)::int AS n FROM analises_setor`),
    });
    const antes = await foto();
    const r = await carregarDemonstracao(transacao, AGORA);
    expect(r).toEqual({ criadas: 0, jaExistiam: 18 });
    expect(await foto()).toEqual(antes);
  });

  it("carregar não mexe nas reclamações reais", async () => {
    const antes = await fotoDoReal();
    await carregarDemonstracao(transacao, AGORA);
    expect(await fotoDoReal()).toEqual(antes);
  });
});

describe("apagar dados de treino", () => {
  beforeEach(async () => {
    await apagarTreino(transacao);
  });

  it("apaga só as linhas de treino e tudo o que pende delas", async () => {
    await carregarDemonstracao(transacao, AGORA);
    await simularCanal(transacao, "mercadolivre", AGORA);
    // Ligações de treino que não nascem em cascata: alerta e auditoria.
    await exec(
      `INSERT INTO alertas (id, tipo, titulo, mensagem, "reclamacaoId", "chaveDedupe")
         VALUES ('t-alerta', 'CUSTO_ALTO', 't', 'm', 'treino-demo-01', 't-chave')`,
    );
    await exec(
      `INSERT INTO auditoria (id, acao, "reclamacaoId") VALUES ('t-aud', 'reclamacao.estado', 'treino-demo-01')`,
    );
    expect(await treino()).toBe(19);

    const r = await apagarTreino(transacao);
    expect(r.reclamacoes).toBe(19);
    expect(await treino()).toBe(0);
    for (const tabela of [
      "estado_historico",
      "custos",
      "reclamacao_causas",
      "analises_setor",
      "capturas_canal",
      "alertas",
      "auditoria",
    ]) {
      const orfas = await contar(
        `SELECT count(*)::int AS n FROM "${tabela}" WHERE "reclamacaoId" LIKE 'treino-%'`,
      );
      expect(orfas, tabela).toBe(0);
    }
  });

  it("não toca em nada real: reclamações, custos, histórico, captura, alerta e auditoria", async () => {
    const antes = await fotoDoReal();
    expect(antes.reclamacoes).toHaveLength(2);
    await carregarDemonstracao(transacao, AGORA);
    await simularCanal(transacao, "shopee", AGORA);
    await apagarTreino(transacao);
    expect(await fotoDoReal()).toEqual(antes);
    expect(await reais()).toBe(2);
  });

  it("sem treino, apagar não faz nada", async () => {
    const antes = await fotoDoReal();
    expect(await apagarTreino(transacao)).toEqual({ reclamacoes: 0 });
    expect(await fotoDoReal()).toEqual(antes);
  });

  it("depois de apagar dá para carregar de novo", async () => {
    await carregarDemonstracao(transacao, AGORA);
    await apagarTreino(transacao);
    expect(await carregarDemonstracao(transacao, AGORA)).toEqual({
      criadas: 18,
      jaExistiam: 0,
    });
  });
});

describe("simulador de canal", () => {
  beforeEach(async () => {
    await apagarTreino(transacao);
  });

  it("Mercado Livre: nasce em Triagem, treino, origem simulado, com pedido, SKU, texto e prazo da carga", async () => {
    const r = await simularCanal(transacao, "mercadolivre", AGORA);
    expect(r.canal).toBe("Mercado Livre");
    const [l] = await exec(
      `SELECT r.estado::text AS estado, r.treino, r."origemRegistro" AS origem, r.pedido, r.descricao,
              r."prazoMarketplace"::text AS prazo, r."clienteNome" AS cliente, r.uf,
              p.codigo, c.nome AS canal
         FROM reclamacoes r JOIN produtos p ON p.id = r."produtoId" JOIN canais c ON c.id = r."canalId"
        WHERE r.id = $1`,
      [r.id],
    );
    expect(l).toMatchObject({
      estado: "triagem",
      treino: true,
      origem: "simulado",
      canal: "Mercado Livre",
      prazo: "2026-10-25",
    });
    const [cap] = await exec(
      `SELECT payload FROM capturas_canal WHERE "reclamacaoId" = $1`,
      [r.id],
    );
    const carga = cap.payload as {
      claim: { id: number; resource: string; resource_id: number };
      detail: { problem: string };
      order: { order_items: { item: { seller_sku: string } }[] };
    };
    expect(carga.claim.resource).toBe("order");
    expect(l.pedido).toBe(String(carga.claim.resource_id));
    expect(l.descricao).toBe(carga.detail.problem);
    expect(l.codigo).toBe(carga.order.order_items[0].item.seller_sku);
    expect(r.idExterno).toBe(String(carga.claim.id));
    expect(String(l.cliente)).toMatch(/Fictício/);
    const hist = await exec(
      `SELECT para::text AS para FROM estado_historico WHERE "reclamacaoId" = $1`,
      [r.id],
    );
    expect(hist).toEqual([{ para: "triagem" }]);
  });

  it("Shopee: devolução com return_sn, text_reason, item_sku e e-mail mascarado", async () => {
    const r = await simularCanal(transacao, "shopee", AGORA);
    expect(r.canal).toBe("Shopee");
    const [l] = await exec(
      `SELECT r.estado::text AS estado, r.treino, r."origemRegistro" AS origem, r.pedido, r.descricao,
              r."prazoMarketplace"::text AS prazo, p.codigo
         FROM reclamacoes r JOIN produtos p ON p.id = r."produtoId" WHERE r.id = $1`,
      [r.id],
    );
    expect(l).toMatchObject({
      estado: "triagem",
      treino: true,
      origem: "simulado",
      prazo: "2026-10-24",
    });
    const [cap] = await exec(
      `SELECT payload FROM capturas_canal WHERE "reclamacaoId" = $1`,
      [r.id],
    );
    const carga = cap.payload as {
      return_sn: string;
      order_sn: string;
      text_reason: string;
      user: { email: string };
      item: { item_sku: string }[];
    };
    expect(r.idExterno).toBe(carga.return_sn);
    expect(l.pedido).toBe(carga.order_sn);
    expect(l.descricao).toBe(carga.text_reason);
    expect(l.codigo).toBe(carga.item[0].item_sku);
    expect(carga.user.email).toContain("*");
    expect(carga.user.email.endsWith(".invalid")).toBe(true);
  });

  it("cada clique cria um caso novo, sem repetir a chave do canal", async () => {
    const a = await simularCanal(transacao, "mercadolivre", AGORA);
    const b = await simularCanal(transacao, "mercadolivre", AGORA);
    const c = await simularCanal(transacao, "shopee", AGORA);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(new Set([a.idExterno, b.idExterno]).size).toBe(2);
    expect(await treino()).toBe(3);
  });

  it("depois da demonstração, o simulador não colide com os casos dela", async () => {
    await carregarDemonstracao(transacao, AGORA);
    await simularCanal(transacao, "mercadolivre", AGORA);
    await simularCanal(transacao, "shopee", AGORA);
    expect(await treino()).toBe(20);
  });

  it("não toca nas reclamações reais", async () => {
    const antes = await fotoDoReal();
    await simularCanal(transacao, "mercadolivre", AGORA);
    expect(await fotoDoReal()).toEqual(antes);
  });

  it("as cargas seguem o formato do levantamento e são lidas como a API entregaria", () => {
    const ml = cargaMercadoLivre(7, "SKU-1", "Produto exemplo", AGORA);
    expect(Object.keys(ml)).toEqual(["claim", "detail", "order"]);
    expect(ml.claim.resource).toBe("order");
    expect(ml.detail.problem.length).toBeGreaterThan(20);
    const lido = lerCargaMercadoLivre(ml);
    expect(lido).toMatchObject({
      idExterno: String(ml.claim.id),
      pedido: String(ml.order.id),
      sku: "SKU-1",
      prazoMarketplace: "2026-10-25",
    });
    expect(lido.comprador.email.endsWith("@exemplo.invalid")).toBe(true);
    expect(lido.comprador.telefone.startsWith("(00)")).toBe(true);

    const sp = cargaShopee(7, "SKU-1", "Produto exemplo", AGORA);
    expect(sp.item[0]).toMatchObject({ item_sku: "SKU-1", variation_sku: "" });
    const lidoSp = lerCargaShopee(sp);
    expect(lidoSp).toMatchObject({
      idExterno: sp.return_sn,
      pedido: sp.order_sn,
      sku: "SKU-1",
      prazoMarketplace: "2026-10-24",
    });
    expect(lidoSp.comprador.email).toMatch(/\*.*\.invalid$/);
  });

  it("a Shopee cai no variation_sku quando não vem item_sku", () => {
    const sp = cargaShopee(1, "X", "Y", AGORA);
    sp.item[0].item_sku = "";
    sp.item[0].variation_sku = "VAR-9";
    expect(lerCargaShopee(sp).sku).toBe("VAR-9");
  });
});

// ---------- Visão: real por padrão, só treino no modo treino ----------

function usuario(
  perfil: Perfil,
  extra: Partial<UsuarioLogado> = {},
): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: `Pessoa ${perfil}`,
    perfil,
    setores: [],
    permissoes: mesclarPermissoes(perfil, []),
    ...extra,
  };
}

/** Todo valor de `treino` que aparece no filtro, em qualquer nível. */
function valoresDeTreino(onde: unknown): boolean[] {
  if (Array.isArray(onde)) return onde.flatMap(valoresDeTreino);
  if (typeof onde !== "object" || onde === null) return [];
  return Object.entries(onde).flatMap(([k, v]) =>
    k === "treino" && typeof v === "boolean" ? [v] : valoresDeTreino(v),
  );
}

describe("visão de treino nas consultas", () => {
  it("por padrão a visão exclui treino, para qualquer perfil", () => {
    for (const perfil of [
      "administrador",
      "gestor",
      "operacao",
      "responsavel_setor",
    ] as const) {
      const escopo = { perfil, setores: ["Solda"] };
      expect(filtroDeTreino(escopo)).toEqual({ treino: false });
      expect(
        valoresDeTreino(montarFiltro({ pagina: 1, porPagina: 25 }, escopo)),
      ).toEqual([false]);
      expect(valoresDeTreino(filtroPorId("r1", escopo))).toEqual([false]);
    }
  });

  it("no modo treino a visão mostra SOMENTE treino", () => {
    const escopo = { perfil: "gestor" as const, setores: [], treino: true };
    expect(filtroDeTreino(escopo)).toEqual({ treino: true });
    expect(
      valoresDeTreino(
        montarFiltro({ pagina: 1, porPagina: 25, busca: "x" }, escopo),
      ),
    ).toEqual([true]);
    expect(valoresDeTreino(filtroPorId("r1", escopo))).toEqual([true]);
  });

  it("a ficha de treino não abre fora do modo treino, nem a real dentro dele", () => {
    expect(filtroPorId("t1", { perfil: "gestor", setores: [] })).toEqual({
      id: "t1",
      treino: false,
    });
    expect(
      filtroPorId("t1", { perfil: "gestor", setores: [], treino: true }),
    ).toEqual({ id: "t1", treino: true });
  });

  it("o filtro de escopo de setor e marca continua igual, sem misturar o de treino", () => {
    expect(filtroDeEscopo({ perfil: "gestor", setores: [] })).toBeNull();
    expect(
      filtroDeEscopo({ perfil: "responsavel_setor", setores: ["Solda"] }),
    ).toEqual({ setorResp: { nome: { in: ["Solda"] } } });
  });

  it("o responsável de setor também fica preso ao escopo dentro do treino", () => {
    const w = JSON.stringify(
      filtroPorId("r1", {
        perfil: "responsavel_setor",
        setores: ["Solda"],
        treino: true,
      }),
    );
    expect(w).toContain('"treino":true');
    expect(w).toContain('"in":["Solda"]');
  });

  it("fila e alertas excluem treino por padrão e mostram só treino no modo treino", async () => {
    const buscas: unknown[] = [];
    const repo: RepositorioFila = {
      async abertas(where) {
        buscas.push(where);
        return [] as LinhaAberta[];
      },
    };
    const s = new ServicoFilaAlertas(repo, () => AGORA);
    await s.fila(usuario("gestor"));
    await s.alertas(usuario("gestor"));
    await s.fila(usuario("gestor", { modoTreino: true }));
    await s.alertas(usuario("gestor", { modoTreino: true }));
    expect(buscas.map(valoresDeTreino)).toEqual([
      [false],
      [false],
      [true],
      [true],
    ]);
  });

  it("relatórios e indicadores excluem treino por padrão e mostram só treino no modo treino", async () => {
    const wheres: unknown[] = [];
    const repo: RepositorioRelatorios = {
      async linhas(args) {
        wheres.push(args.where);
        return [];
      },
    };
    const s = new ServicoRelatorios(repo);
    await s.gerar({}, usuario("gestor"));
    await s.gerar({ marcaId: "m1" }, usuario("administrador"));
    await s.gerar({}, usuario("gestor", { modoTreino: true }));
    expect(wheres.map(valoresDeTreino)).toEqual([[false], [false], [true]]);
  });
});

// ---------- A escolha vale por usuário, e só para administrador e gestor ----------

describe("escolha do modo treino por usuário", () => {
  function servicoAuth(perfil: Perfil, modoTreino: boolean) {
    const sessao: SessaoRegistro = {
      id: hashToken("token-de-teste"),
      usuarioId: "u1",
      expiraEm: new Date("2027-01-01T00:00:00Z"),
    };
    const u: UsuarioRegistro = {
      id: "u1",
      login: "pessoa",
      nome: "Pessoa",
      perfil,
      senhaHash: "x",
      ativo: true,
      setores: [],
      modoTreino,
      permissoes: [],
    };
    const repo: RepositorioAuth = {
      buscarUsuarioPorLogin: async () => u,
      buscarUsuarioPorId: async () => u,
      criarSessao: async () => undefined,
      buscarSessao: async () => sessao,
      apagarSessao: async () => undefined,
    };
    return new ServicoAuth(repo, undefined, () => AGORA);
  }

  it("administrador e gestor com o modo ligado entram na visão de treino", async () => {
    for (const perfil of ["administrador", "gestor"] as const) {
      const u = await servicoAuth(perfil, true).validar("token-de-teste");
      expect(u?.modoTreino).toBe(true);
    }
  });

  it("sem escolha, a visão é a real", async () => {
    const u = await servicoAuth("gestor", false).validar("token-de-teste");
    expect(u?.modoTreino).toBe(false);
  });

  it("operação e responsável de setor nunca entram no treino, mesmo com o campo gravado", async () => {
    for (const perfil of ["operacao", "responsavel_setor"] as const) {
      const u = await servicoAuth(perfil, true).validar("token-de-teste");
      expect(u?.modoTreino).toBe(false);
    }
  });

  it("só administrador e gestor mexem no modo; carregar e apagar é do administrador", () => {
    expect(() => exigirGestao(usuario("administrador"))).not.toThrow();
    expect(() => exigirGestao(usuario("gestor"))).not.toThrow();
    expect(() => exigirGestao(usuario("operacao"))).toThrow();
    expect(() => exigirGestao(usuario("responsavel_setor"))).toThrow();
    expect(() => exigirAdministrador(usuario("administrador"))).not.toThrow();
    expect(() => exigirAdministrador(usuario("gestor"))).toThrow();
  });

  it("o simulador só aceita os dois canais conhecidos", () => {
    expect(lerCanal({ canal: "mercadolivre" })).toBe("mercadolivre");
    expect(lerCanal({ canal: "shopee" })).toBe("shopee");
    expect(() => lerCanal({ canal: "magalu" })).toThrow();
    expect(() => lerCanal(null)).toThrow();
  });
});

// ---------- ClickUp: treino não chega lá, a menos que o administrador libere ----------

const TOKEN = "pk_000111222_TOKEN_DE_TESTE_ZZZZ";

function repoClickup(treinoCard: boolean, taskId: string | null = null) {
  const chamadas = {
    criado: 0,
    falhas: 0,
    sincronizado: 0,
    pendentes: [] as (boolean | undefined)[],
  };
  const repo: Partial<RepositorioClickup> = {
    async carregarCard(): Promise<DadosCard> {
      return {
        cardId: "card1",
        taskId,
        listaId: taskId ? "L-SOLDA" : null,
        statusExterno: null,
        tentativas: 0,
        precisaSync: taskId !== null,
        comentarios: [],
        reclamacao: {
          id: "t1",
          numero: 1,
          descricao: "Reclamação de treino",
          setorRespId: "s-solda",
          setorNome: "Solda",
          marca: "AISA",
          canal: "Mercado Livre",
          produto: "A100 Produto exemplo",
          causa: "Solda",
          pedido: "1",
          dataAbertura: "2026-10-20",
          situacao: "tratativa",
          estado: "recebida",
          devolucao: "NA",
          custoTotal: 0,
          treino: treinoCard,
        },
      };
    },
    async registrarCriado() {
      chamadas.criado++;
    },
    async registrarFalha() {
      chamadas.falhas++;
    },
    async registrarSincronizado() {
      chamadas.sincronizado++;
    },
    async pendentes(_agora, _limite, incluirTreino) {
      chamadas.pendentes.push(incluirTreino);
      return [];
    },
    async semCard() {
      return [];
    },
    async garantirCard() {
      return true;
    },
  };
  return { repo: repo as RepositorioClickup, chamadas };
}

function integr(config: Record<string, unknown>) {
  return {
    segredo: async () => TOKEN,
    config: async () => config,
    listasClickup: async () => ({ "s-solda": "L-SOLDA" }),
  };
}

function http() {
  const chamadas: { url: string; metodo?: string }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), metodo: init?.method });
    return new Response(JSON.stringify({ id: "t-novo" }), { status: 200 });
  }) as typeof fetch;
  return { f, chamadas };
}

describe("ClickUp e reclamações de treino", () => {
  it("por padrão, reclamação de treino não cria card nem chama o ClickUp", async () => {
    const { repo, chamadas } = repoClickup(true);
    const h = http();
    const s = new ServicoClickup(
      repo,
      integr({ listaPadraoId: "L" }),
      h.f,
      () => AGORA,
    );
    expect(await s.tentarCard("t1")).toBe("treino_bloqueado");
    expect(h.chamadas).toHaveLength(0);
    expect(chamadas).toMatchObject({ criado: 0, falhas: 0 });
  });

  it("por padrão, reclamação de treino também não atualiza o status do card", async () => {
    const { repo, chamadas } = repoClickup(true, "t-abc");
    const h = http();
    const s = new ServicoClickup(repo, integr({}), h.f, () => AGORA);
    expect(await s.sincronizar("t1")).toBe("treino_bloqueado");
    expect(h.chamadas).toHaveLength(0);
    expect(chamadas.sincronizado).toBe(0);
  });

  it("com a chave ligada, o card de treino também recebe as atualizações", async () => {
    const { repo, chamadas } = repoClickup(true, "t-abc");
    const h = http();
    const s = new ServicoClickup(
      repo,
      integr({ criarCardsTreino: true }),
      h.f,
      () => AGORA,
    );
    expect(await s.sincronizar("t1")).toBe("sincronizado");
    expect(h.chamadas[0]).toMatchObject({ metodo: "PUT" });
    expect(h.chamadas[0].url).toContain("/task/t-abc");
    expect(chamadas.sincronizado).toBe(1);
  });

  it("a chave desligada de propósito também bloqueia", async () => {
    const { repo } = repoClickup(true);
    const h = http();
    const s = new ServicoClickup(
      repo,
      integr({ criarCardsTreino: false }),
      h.f,
      () => AGORA,
    );
    expect(await s.tentarCard("t1")).toBe("treino_bloqueado");
    expect(h.chamadas).toHaveLength(0);
  });

  it("com 'Criar cards para reclamações de treino' ligado, o card é criado", async () => {
    const { repo, chamadas } = repoClickup(true);
    const h = http();
    const s = new ServicoClickup(
      repo,
      integr({ criarCardsTreino: true }),
      h.f,
      () => AGORA,
    );
    expect(await s.tentarCard("t1")).toBe("criado");
    expect(h.chamadas[0].url).toContain("/list/L-SOLDA/task");
    expect(chamadas.criado).toBe(1);
  });

  it("reclamação real não é afetada pela chave", async () => {
    for (const config of [{}, { criarCardsTreino: true }]) {
      const { repo, chamadas } = repoClickup(false);
      const h = http();
      const s = new ServicoClickup(repo, integr(config), h.f, () => AGORA);
      expect(await s.tentarCard("t1")).toBe("criado");
      expect(chamadas.criado).toBe(1);
    }
  });

  it("a fila de nova tentativa só busca treino quando a chave está ligada", async () => {
    const desligado = repoClickup(true);
    await new ServicoClickup(
      desligado.repo,
      integr({}),
      http().f,
      () => AGORA,
    ).processarPendentes();
    expect(desligado.chamadas.pendentes).toEqual([false]);

    const ligado = repoClickup(true);
    await new ServicoClickup(
      ligado.repo,
      integr({ criarCardsTreino: true }),
      http().f,
      () => AGORA,
    ).processarPendentes();
    expect(ligado.chamadas.pendentes).toEqual([true]);
  });

  it("a chave só vale no ClickUp e só como verdadeiro ou falso", () => {
    expect(lerEntradaIntegracao("clickup", { criarCardsTreino: true })).toEqual(
      {
        ok: true,
        entrada: { criarCardsTreino: true },
      },
    );
    expect(
      lerEntradaIntegracao("clickup", { criarCardsTreino: "sim" }).ok,
    ).toBe(false);
    expect(lerEntradaIntegracao("shopee", { criarCardsTreino: true }).ok).toBe(
      false,
    );
  });
});
