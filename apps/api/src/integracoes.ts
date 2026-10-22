import { createHmac } from "node:crypto";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { temPermissao } from "@sac-aisa/domain";
import {
  cifrar,
  decifrar,
  fimDoSegredo,
  mascarar,
  removerSegredos,
} from "./segredos";

// ---------- Catálogo ----------

export type ChaveIntegracao =
  | "clickup"
  | "mercadolivre"
  | "shopee"
  | "openrouter";
export type EstadoIntegracao = "pendente" | "conectado" | "erro";

export const SITUACOES_MAPA = ["aguardando", "tratativa", "resolvida"] as const;

interface CampoDef {
  nome: string;
  rotulo: string;
  tipo: "texto" | "segredo";
  ajuda: string;
}

interface IntegracaoDef {
  nome: string;
  resumo: string;
  passos: string[];
  campos: CampoDef[];
}

export const CATALOGO: Record<ChaveIntegracao, IntegracaoDef> = {
  clickup: {
    nome: "ClickUp",
    resumo: "Cria o card da reclamação na lista do setor e acompanha o status.",
    passos: [
      "No ClickUp, abra Configurações › Apps e gere um token pessoal (começa com pk_). Use um usuário de serviço, não uma pessoa: o token e o webhook ficam atrelados a esse usuário e param se ele for desativado.",
      "Informe o ID da lista de cada setor. O ID aparece na URL da lista. A lista padrão recebe o que não tiver setor ou lista.",
      "Crie o webhook do ClickUp apontando para /api/webhooks/clickup deste sistema e cole aqui o segredo que o ClickUp devolve.",
      "No mapa de status, diga a que situação cada status do ClickUp corresponde.",
    ],
    campos: [
      {
        nome: "token",
        rotulo: "Token da API",
        tipo: "segredo",
        ajuda: "Token pessoal do ClickUp.",
      },
      {
        nome: "segredoWebhook",
        rotulo: "Segredo do webhook",
        tipo: "segredo",
        ajuda: "Usado para conferir a assinatura de cada aviso recebido.",
      },
      {
        nome: "listaPadraoId",
        rotulo: "Lista padrão",
        tipo: "texto",
        ajuda: "ID da lista para setor sem lista própria.",
      },
      {
        nome: "workspaceId",
        rotulo: "ID do workspace",
        tipo: "texto",
        ajuda:
          "Número que aparece na URL do ClickUp (app.clickup.com/NÚMERO/...). Necessário para mover o card quando o setor responsável muda.",
      },
    ],
  },
  mercadolivre: {
    nome: "Mercado Livre",
    resumo: "Credenciais do aplicativo para captar reclamações (fase 6).",
    passos: [
      "Em Minhas aplicações, crie o aplicativo com a conta da empresa e marque o tópico Post Purchase (claims).",
      "Cadastre as URLs de redirecionamento e de notificações em HTTPS.",
      "Cole aqui o App ID e a Secret Key. A autorização da conta vendedora (administrador da conta) vem na próxima etapa.",
    ],
    campos: [
      {
        nome: "appId",
        rotulo: "App ID",
        tipo: "texto",
        ajuda: "Identificador do aplicativo.",
      },
      {
        nome: "segredo",
        rotulo: "Secret Key",
        tipo: "segredo",
        ajuda: "Chave secreta do aplicativo.",
      },
      {
        nome: "urlRedirecionamento",
        rotulo: "URL de redirecionamento",
        tipo: "texto",
        ajuda: "A mesma cadastrada no aplicativo, em HTTPS.",
      },
    ],
  },
  shopee: {
    nome: "Shopee",
    resumo: "Credenciais do app para captar devoluções e reembolsos (fase 6).",
    passos: [
      "Em open.shopee.com, cadastre a empresa e espere a aprovação do app.",
      "Crie o app (Seller In-house System) com permissão de Return/Refund e Order.",
      "Cole aqui o partner_id e a partner_key. A autorização da loja (conta dona da loja) vem na próxima etapa.",
    ],
    campos: [
      {
        nome: "partnerId",
        rotulo: "Partner ID",
        tipo: "texto",
        ajuda: "Número do app na Shopee.",
      },
      {
        nome: "partnerKey",
        rotulo: "Partner Key",
        tipo: "segredo",
        ajuda: "Chave do app. Teste e produção são chaves diferentes.",
      },
      {
        nome: "shopId",
        rotulo: "Shop ID",
        tipo: "texto",
        ajuda: "Opcional agora; chega com a autorização da loja.",
      },
    ],
  },
  openrouter: {
    nome: "OpenRouter (IA)",
    resumo: "Chave para a IA sugerir o preenchimento do registro (fase 5).",
    passos: [
      "Em openrouter.ai, abra Keys e crie uma chave para o SAC.",
      "Cole a chave aqui. A IA recebe o texto da reclamação e o SKU, nunca o nome do cliente.",
    ],
    campos: [
      {
        nome: "chaveApi",
        rotulo: "Chave da API",
        tipo: "segredo",
        ajuda: "Começa com sk-or-.",
      },
    ],
  },
};

export const CHAVES = Object.keys(CATALOGO) as ChaveIntegracao[];

export function chaveValida(v: string): v is ChaveIntegracao {
  return (CHAVES as string[]).includes(v);
}

// ---------- Entrada ----------

export interface EntradaIntegracao {
  /** Texto: vazio apaga. Segredo: vazio mantém o que já está gravado. */
  campos?: Record<string, string>;
  /** setorId → ID da lista no ClickUp. Vazio remove. Só no ClickUp. */
  listas?: Record<string, string>;
  /** status do ClickUp (minúsculas) → situação. Só no ClickUp. Substitui o mapa inteiro. */
  mapaStatus?: Record<string, string>;
}

export class ErroIntegracao extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 503,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

const ID_EXTERNO = /^[A-Za-z0-9_-]{1,64}$/;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function lerEntradaIntegracao(
  chave: ChaveIntegracao,
  corpo: unknown,
): { ok: true; entrada: EntradaIntegracao } | { ok: false; mensagem: string } {
  const erro = (mensagem: string) => ({ ok: false as const, mensagem });
  if (!ehObjeto(corpo)) return erro("Corpo inválido.");
  for (const k of Object.keys(corpo)) {
    if (!["campos", "listas", "mapaStatus"].includes(k)) {
      return erro(`Campo não aceito: "${k}".`);
    }
  }
  const entrada: EntradaIntegracao = {};

  if ("campos" in corpo) {
    if (!ehObjeto(corpo.campos)) return erro("Campos inválidos.");
    const defs = new Map(CATALOGO[chave].campos.map((c) => [c.nome, c]));
    const campos: Record<string, string> = {};
    for (const [nome, v] of Object.entries(corpo.campos)) {
      const def = defs.get(nome);
      if (!def) return erro(`Campo não aceito: "${nome}".`);
      if (typeof v !== "string") return erro(`Valor inválido em "${nome}".`);
      const t = v.trim();
      if (t.length > (def.tipo === "segredo" ? 2000 : 300)) {
        return erro(`Valor longo demais em "${nome}".`);
      }
      campos[nome] = t;
    }
    entrada.campos = campos;
  }

  if ("listas" in corpo) {
    if (chave !== "clickup") return erro("Listas só existem no ClickUp.");
    if (!ehObjeto(corpo.listas)) return erro("Listas inválidas.");
    const listas: Record<string, string> = {};
    for (const [setorId, v] of Object.entries(corpo.listas)) {
      if (!ID_EXTERNO.test(setorId)) return erro("Setor inválido.");
      if (typeof v !== "string") return erro("ID de lista inválido.");
      const t = v.trim();
      if (t !== "" && !ID_EXTERNO.test(t)) return erro("ID de lista inválido.");
      listas[setorId] = t;
    }
    entrada.listas = listas;
  }

  if ("mapaStatus" in corpo) {
    if (chave !== "clickup")
      return erro("Mapa de status só existe no ClickUp.");
    if (!ehObjeto(corpo.mapaStatus)) return erro("Mapa de status inválido.");
    const entradas = Object.entries(corpo.mapaStatus);
    if (entradas.length > 30) return erro("Status demais no mapa.");
    const mapa: Record<string, string> = {};
    for (const [status, v] of entradas) {
      const s = status.trim().toLowerCase();
      if (s === "" || s.length > 60) return erro("Nome de status inválido.");
      if (!(SITUACOES_MAPA as readonly unknown[]).includes(v)) {
        return erro(`Situação inválida para o status "${s}".`);
      }
      mapa[s] = v as string;
    }
    entrada.mapaStatus = mapa;
  }

  if (Object.keys(entrada).length === 0) return erro("Nada para gravar.");
  return { ok: true, entrada };
}

// ---------- Persistência (interface) ----------

export interface SegredoGravado {
  cifrado: string;
  fim: string;
}

export interface RegistroIntegracao {
  chave: ChaveIntegracao;
  config: Record<string, unknown>;
  segredos: Record<string, SegredoGravado>;
  estado: EstadoIntegracao;
  ultimoErro: string | null;
  testadoEm: Date | null;
}

export interface AuditoriaIntegracao {
  usuarioId: string;
  usuarioNome: string;
  acao: "integracao.salvar" | "integracao.testar";
  alvo: string;
  detalhe: string;
  extra: Record<string, unknown>;
}

export interface RepositorioIntegracoes {
  obter(chave: ChaveIntegracao): Promise<RegistroIntegracao | null>;
  /** Grava e volta o estado para "pendente", junto com a auditoria. */
  gravar(args: {
    chave: ChaveIntegracao;
    config: Record<string, unknown>;
    segredos: Record<string, SegredoGravado>;
    listas?: Record<string, string>;
    usuarioId: string;
    auditoria: AuditoriaIntegracao;
  }): Promise<void>;
  gravarTeste(args: {
    chave: ChaveIntegracao;
    estado: EstadoIntegracao;
    ultimoErro: string | null;
    testadoEm: Date;
    auditoria: AuditoriaIntegracao;
  }): Promise<void>;
  setores(): Promise<{ id: string; nome: string }[]>;
  /** setorId → listaId, da tabela ClickupConfig. */
  listas(): Promise<Record<string, string>>;
}

// ---------- Teste de conexão ----------

export type Http = typeof fetch;

export interface ResultadoTeste {
  ok: boolean;
  mensagem: string;
}

interface ContextoTeste {
  texto: Record<string, string>;
  segredo: Record<string, string>;
  listas: Record<string, string>;
}

async function chamar(
  http: Http,
  url: string,
  init: RequestInit,
): Promise<{ status: number; json: unknown }> {
  const r = await http(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}

function semResposta(nome: string): ResultadoTeste {
  return { ok: false, mensagem: `Sem resposta do ${nome}. Tente de novo.` };
}

async function testarClickup(
  c: ContextoTeste,
  http: Http,
): Promise<ResultadoTeste> {
  const token = c.segredo.token;
  if (!token) return { ok: false, mensagem: "Informe o token do ClickUp." };
  const cab = { Authorization: token };
  try {
    const eu = await chamar(http, "https://api.clickup.com/api/v2/team", {
      headers: cab,
    });
    if (eu.status === 401 || eu.status === 403) {
      return { ok: false, mensagem: "O ClickUp recusou o token." };
    }
    if (eu.status !== 200) {
      return { ok: false, mensagem: `O ClickUp respondeu ${eu.status}.` };
    }
    const ids = [
      ...new Set(
        [...Object.values(c.listas), c.texto.listaPadraoId ?? ""].filter(
          Boolean,
        ),
      ),
    ];
    const ruins: string[] = [];
    for (const id of ids) {
      const l = await chamar(
        http,
        `https://api.clickup.com/api/v2/list/${encodeURIComponent(id)}`,
        { headers: cab },
      );
      if (l.status !== 200) ruins.push(id);
    }
    if (ruins.length > 0) {
      return {
        ok: false,
        mensagem: `Token aceito, mas o ClickUp não achou a lista: ${ruins.join(", ")}.`,
      };
    }
    return {
      ok: true,
      mensagem:
        ids.length > 0
          ? `Conectado. ${ids.length} lista(s) conferida(s).`
          : "Conectado. Falta informar as listas.",
    };
  } catch {
    return semResposta("ClickUp");
  }
}

async function testarMercadoLivre(
  c: ContextoTeste,
  http: Http,
): Promise<ResultadoTeste> {
  const { appId } = c.texto;
  const segredo = c.segredo.segredo;
  if (!appId || !segredo) {
    return { ok: false, mensagem: "Informe o App ID e a Secret Key." };
  }
  try {
    const r = await chamar(http, "https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: appId,
        client_secret: segredo,
      }).toString(),
    });
    if (r.status === 200) {
      return {
        ok: true,
        mensagem:
          "O Mercado Livre aceitou as credenciais do app. A conta vendedora ainda precisa ser autorizada.",
      };
    }
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      return {
        ok: false,
        mensagem: "O Mercado Livre recusou o App ID ou a Secret Key.",
      };
    }
    return {
      ok: false,
      mensagem: `O Mercado Livre respondeu ${r.status}.`,
    };
  } catch {
    return semResposta("Mercado Livre");
  }
}

export function assinarShopee(partnerKey: string, base: string): string {
  return createHmac("sha256", partnerKey).update(base).digest("hex");
}

async function testarShopee(
  c: ContextoTeste,
  http: Http,
  agora: Date,
): Promise<ResultadoTeste> {
  const { partnerId } = c.texto;
  const chave = c.segredo.partnerKey;
  if (!partnerId || !chave) {
    return { ok: false, mensagem: "Informe o Partner ID e a Partner Key." };
  }
  if (!/^\d{1,20}$/.test(partnerId)) {
    return { ok: false, mensagem: "O Partner ID tem só números." };
  }
  const caminho = "/api/v2/public/get_shops_by_partner";
  const timestamp = Math.floor(agora.getTime() / 1000);
  const sign = assinarShopee(chave, `${partnerId}${caminho}${timestamp}`);
  const query = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign,
    page_size: "1",
    page_no: "1",
  });
  try {
    const r = await chamar(
      http,
      `https://openplatform.shopee.com.br${caminho}?${query}`,
      { headers: { accept: "application/json" } },
    );
    const corpo = ehObjeto(r.json) ? r.json : {};
    const codigo = typeof corpo.error === "string" ? corpo.error : "";
    if (r.status === 200 && codigo === "") {
      return {
        ok: true,
        mensagem:
          "A Shopee aceitou a assinatura do app. A loja ainda precisa ser autorizada.",
      };
    }
    if (codigo === "error_sign" || codigo === "error_param") {
      return {
        ok: false,
        mensagem:
          "A Shopee recusou a assinatura: confira o Partner ID e a Partner Key.",
      };
    }
    if (codigo) {
      return { ok: false, mensagem: `A Shopee respondeu: ${codigo}.` };
    }
    return { ok: false, mensagem: `A Shopee respondeu ${r.status}.` };
  } catch {
    return semResposta("Shopee");
  }
}

async function testarOpenRouter(
  c: ContextoTeste,
  http: Http,
): Promise<ResultadoTeste> {
  const chave = c.segredo.chaveApi;
  if (!chave) return { ok: false, mensagem: "Informe a chave da API." };
  try {
    const r = await chamar(http, "https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${chave}` },
    });
    if (r.status === 200) return { ok: true, mensagem: "Chave aceita." };
    if (r.status === 401 || r.status === 403) {
      return { ok: false, mensagem: "O OpenRouter recusou a chave." };
    }
    return { ok: false, mensagem: `O OpenRouter respondeu ${r.status}.` };
  } catch {
    return semResposta("OpenRouter");
  }
}

// ---------- Serviço ----------

export interface CampoVisao {
  nome: string;
  rotulo: string;
  tipo: "texto" | "segredo";
  ajuda: string;
  /** Só campo de texto. */
  valor?: string;
  /** Só segredo: nunca o valor, apenas se existe e como mostrar. */
  preenchido?: boolean;
  mascara?: string;
}

export interface IntegracaoVisao {
  chave: ChaveIntegracao;
  nome: string;
  resumo: string;
  passos: string[];
  estado: EstadoIntegracao;
  ultimoErro: string | null;
  testadoEm: string | null;
  campos: CampoVisao[];
  clickup?: {
    setores: { id: string; nome: string; listaId: string }[];
    mapaStatus: Record<string, string>;
  };
}

export interface PainelIntegracoes {
  /** Sem `INTEGRACOES_CHAVE` válida, nada é gravado. */
  gravacaoLiberada: boolean;
  integracoes: IntegracaoVisao[];
}

/**
 * Só o administrador mexe nas integrações. A permissão `integracoes.gerir` é conferida
 * junto do perfil, para um override de permissão não abrir a porta para outro perfil.
 */
export function exigirAdministrador(u: UsuarioLogado) {
  if (
    u.perfil !== "administrador" ||
    !temPermissao(u.permissoes, "integracoes.gerir")
  ) {
    throw new ErroIntegracao(403, "Sem permissão para esta ação.");
  }
}

function textoDe(config: Record<string, unknown>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string") r[k] = v;
  }
  return r;
}

function mapaDe(config: Record<string, unknown>): Record<string, string> {
  const m = config.mapaStatus;
  if (!ehObjeto(m)) return {};
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (typeof v === "string") r[k] = v;
  return r;
}

export class ServicoIntegracoes {
  constructor(
    private readonly repo: RepositorioIntegracoes,
    /** Chave de `INTEGRACOES_CHAVE`; null se ausente ou inválida. */
    private readonly chaveCripto: Buffer | null,
    private readonly http: Http = fetch,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async painel(usuario: UsuarioLogado): Promise<PainelIntegracoes> {
    exigirAdministrador(usuario);
    const [setores, listas] = await Promise.all([
      this.repo.setores(),
      this.repo.listas(),
    ]);
    const integracoes: IntegracaoVisao[] = [];
    for (const chave of CHAVES) {
      const def = CATALOGO[chave];
      const reg = await this.repo.obter(chave);
      const texto = textoDe(reg?.config ?? {});
      const visao: IntegracaoVisao = {
        chave,
        nome: def.nome,
        resumo: def.resumo,
        passos: def.passos,
        estado: reg?.estado ?? "pendente",
        ultimoErro: reg?.ultimoErro ?? null,
        testadoEm: reg?.testadoEm?.toISOString() ?? null,
        campos: def.campos.map((c): CampoVisao => {
          if (c.tipo === "texto") return { ...c, valor: texto[c.nome] ?? "" };
          const s = reg?.segredos[c.nome];
          return {
            ...c,
            preenchido: !!s,
            mascara: s ? mascarar(s.fim) : "",
          };
        }),
      };
      if (chave === "clickup") {
        visao.clickup = {
          setores: setores.map((s) => ({
            id: s.id,
            nome: s.nome,
            listaId: listas[s.id] ?? "",
          })),
          mapaStatus: mapaDe(reg?.config ?? {}),
        };
      }
      integracoes.push(visao);
    }
    return { gravacaoLiberada: this.chaveCripto !== null, integracoes };
  }

  async salvar(
    usuario: UsuarioLogado,
    chave: ChaveIntegracao,
    entrada: EntradaIntegracao,
  ): Promise<void> {
    exigirAdministrador(usuario);
    if (!this.chaveCripto) {
      throw new ErroIntegracao(
        503,
        "A variável INTEGRACOES_CHAVE não está definida no servidor. Defina e reinicie para gravar.",
      );
    }
    const def = CATALOGO[chave];
    const atual = await this.repo.obter(chave);
    const config = { ...(atual?.config ?? {}) };
    const segredos = { ...(atual?.segredos ?? {}) };
    const alterados: string[] = [];

    for (const [nome, valor] of Object.entries(entrada.campos ?? {})) {
      const campo = def.campos.find((c) => c.nome === nome);
      if (!campo) continue;
      if (campo.tipo === "texto") {
        if ((config[nome] ?? "") === valor) continue;
        if (valor === "") delete config[nome];
        else config[nome] = valor;
        alterados.push(nome);
      } else if (valor !== "") {
        segredos[nome] = {
          cifrado: cifrar(valor, this.chaveCripto, `${chave}:${nome}`),
          fim: fimDoSegredo(valor),
        };
        alterados.push(nome);
      }
    }
    if (entrada.mapaStatus) {
      config.mapaStatus = entrada.mapaStatus;
      alterados.push("mapaStatus");
    }
    if (entrada.listas) alterados.push("listas");

    if (alterados.length === 0) return;
    await this.repo.gravar({
      chave,
      config,
      segredos,
      listas: entrada.listas,
      usuarioId: usuario.id,
      auditoria: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "integracao.salvar",
        alvo: def.nome,
        detalhe: `Campos alterados: ${alterados.join(", ")}.`,
        extra: { campos: alterados },
      },
    });
  }

  async testar(
    usuario: UsuarioLogado,
    chave: ChaveIntegracao,
  ): Promise<ResultadoTeste & { estado: EstadoIntegracao }> {
    exigirAdministrador(usuario);
    const def = CATALOGO[chave];
    const reg = await this.repo.obter(chave);
    const segredo: Record<string, string> = {};
    if (this.chaveCripto) {
      for (const [nome, s] of Object.entries(reg?.segredos ?? {})) {
        try {
          segredo[nome] = decifrar(
            s.cifrado,
            this.chaveCripto,
            `${chave}:${nome}`,
          );
        } catch {
          return {
            ok: false,
            estado: "erro",
            mensagem:
              "Não foi possível ler um segredo gravado. A INTEGRACOES_CHAVE mudou? Informe o valor de novo.",
          };
        }
      }
    }
    const ctx: ContextoTeste = {
      texto: textoDe(reg?.config ?? {}),
      segredo,
      listas: chave === "clickup" ? await this.repo.listas() : {},
    };
    const agora = this.agora();
    const bruto =
      chave === "clickup"
        ? await testarClickup(ctx, this.http)
        : chave === "mercadolivre"
          ? await testarMercadoLivre(ctx, this.http)
          : chave === "shopee"
            ? await testarShopee(ctx, this.http, agora)
            : await testarOpenRouter(ctx, this.http);
    const resultado: ResultadoTeste = {
      ok: bruto.ok,
      mensagem: removerSegredos(bruto.mensagem, Object.values(segredo)),
    };

    // Faltou preencher: não é falha da integração, só continua pendente.
    const faltou = !resultado.ok && /^Informe /.test(resultado.mensagem);
    const estado: EstadoIntegracao = resultado.ok
      ? "conectado"
      : faltou
        ? "pendente"
        : "erro";
    await this.repo.gravarTeste({
      chave,
      estado,
      ultimoErro: resultado.ok ? null : resultado.mensagem,
      testadoEm: agora,
      auditoria: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "integracao.testar",
        alvo: def.nome,
        detalhe: resultado.ok ? "Teste: conectado." : "Teste: falhou.",
        extra: { ok: resultado.ok },
      },
    });
    return { ...resultado, estado };
  }

  /** Para os outros serviços (ClickUp, IA): o segredo em claro, só dentro do servidor. */
  async segredo(chave: ChaveIntegracao, nome: string): Promise<string | null> {
    if (!this.chaveCripto) return null;
    const reg = await this.repo.obter(chave);
    const s = reg?.segredos[nome];
    if (!s) return null;
    try {
      return decifrar(s.cifrado, this.chaveCripto, `${chave}:${nome}`);
    } catch {
      return null;
    }
  }

  async config(chave: ChaveIntegracao): Promise<Record<string, unknown>> {
    return (await this.repo.obter(chave))?.config ?? {};
  }

  listasClickup(): Promise<Record<string, string>> {
    return this.repo.listas();
  }
}
