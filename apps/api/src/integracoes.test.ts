import "reflect-metadata";
import { randomBytes } from "node:crypto";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import { CHAVE_REQUER } from "./auth.guard";
import {
  type AuditoriaIntegracao,
  type ChaveIntegracao,
  ErroIntegracao,
  lerEntradaIntegracao,
  type RegistroIntegracao,
  type RepositorioIntegracoes,
  ServicoIntegracoes,
} from "./integracoes";
import { ControladorIntegracoes } from "./integracoes.controller";

const CHAVE = randomBytes(32);
const AGORA = () => new Date("2026-10-22T15:00:00Z");

function usuario(perfil: Perfil, extra: string[] = []): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: perfil,
    perfil,
    setores: [],
    permissoes: [
      ...mesclarPermissoes(
        perfil,
        extra.map((chave) => ({ chave, permitido: true })),
      ),
    ],
  };
}

class RepoFalso implements RepositorioIntegracoes {
  registros = new Map<ChaveIntegracao, RegistroIntegracao>();
  listasGravadas: Record<string, string> = {};
  auditorias: AuditoriaIntegracao[] = [];

  async obter(chave: ChaveIntegracao) {
    return this.registros.get(chave) ?? null;
  }
  async gravar(a: Parameters<RepositorioIntegracoes["gravar"]>[0]) {
    this.registros.set(a.chave, {
      chave: a.chave,
      config: a.config,
      segredos: a.segredos,
      estado: "pendente",
      ultimoErro: null,
      testadoEm: null,
    });
    Object.assign(this.listasGravadas, a.listas);
    this.auditorias.push(a.auditoria);
  }
  async gravarTeste(a: Parameters<RepositorioIntegracoes["gravarTeste"]>[0]) {
    const r = this.registros.get(a.chave);
    if (r) {
      r.estado = a.estado;
      r.ultimoErro = a.ultimoErro;
      r.testadoEm = a.testadoEm;
    }
    this.auditorias.push(a.auditoria);
  }
  async setores() {
    return [{ id: "s-solda", nome: "Solda" }];
  }
  async listas() {
    return this.listasGravadas;
  }
}

function http(respostas: Record<string, { status: number; corpo?: unknown }>) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, init });
    const r = Object.entries(respostas).find(([k]) => u.includes(k))?.[1] ?? {
      status: 404,
    };
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status });
  }) as typeof fetch;
  return { f, chamadas };
}

function servico(
  repo = new RepoFalso(),
  chave: Buffer | null = CHAVE,
  f: typeof fetch = http({}).f,
) {
  return { repo, s: new ServicoIntegracoes(repo, chave, f, AGORA) };
}

const SEGREDO = "pk_123456789_SEGREDO_MUITO_LONGO_ABCD";

describe("permissão", () => {
  it("as rotas exigem a permissão de integrações", () => {
    for (const rota of ["painel", "salvar", "testar"] as const) {
      expect(
        Reflect.getMetadata(
          CHAVE_REQUER,
          ControladorIntegracoes.prototype[rota],
        ),
      ).toEqual(["integracoes.gerir"]);
    }
  });

  it.each(["gestor", "operacao", "responsavel_setor"] as Perfil[])(
    "%s é recusado em tudo",
    async (perfil) => {
      const { s, repo } = servico();
      const u = usuario(perfil);
      await expect(s.painel(u)).rejects.toMatchObject({ status: 403 });
      await expect(
        s.salvar(u, "clickup", { campos: { token: SEGREDO } }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(s.testar(u, "clickup")).rejects.toMatchObject({
        status: 403,
      });
      expect(repo.registros.size).toBe(0);
    },
  );

  it("um gestor com a permissão liberada por override continua recusado", async () => {
    const { s } = servico();
    const u = usuario("gestor", ["integracoes.gerir"]);
    expect(u.permissoes).toContain("integracoes.gerir");
    await expect(s.painel(u)).rejects.toBeInstanceOf(ErroIntegracao);
  });

  it("o administrador passa", async () => {
    const { s } = servico();
    const p = await s.painel(usuario("administrador"));
    expect(p.integracoes.map((i) => i.chave)).toEqual([
      "clickup",
      "mercadolivre",
      "shopee",
      "openrouter",
    ]);
  });
});

describe("gravação de segredos", () => {
  it("grava cifrado, devolve só a máscara e audita sem o valor", async () => {
    const { s, repo } = servico();
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", {
      campos: { token: SEGREDO, listaPadraoId: "9012" },
    });

    const gravado = repo.registros.get("clickup");
    expect(JSON.stringify(gravado)).not.toContain(SEGREDO);
    expect(gravado?.segredos.token.cifrado.startsWith("v1.")).toBe(true);

    const painel = await s.painel(adm);
    const texto = JSON.stringify(painel);
    expect(texto).not.toContain(SEGREDO);
    expect(texto).not.toContain("SEGREDO_MUITO");
    const token = painel.integracoes[0].campos.find((c) => c.nome === "token");
    expect(token).toMatchObject({ preenchido: true, mascara: "••••ABCD" });
    expect(token).not.toHaveProperty("valor");

    expect(JSON.stringify(repo.auditorias)).not.toContain(SEGREDO);
    expect(repo.auditorias[0]).toMatchObject({
      acao: "integracao.salvar",
      extra: { campos: ["token", "listaPadraoId"] },
    });
  });

  it("segredo vazio mantém o que já estava gravado", async () => {
    const { s, repo } = servico();
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", { campos: { token: SEGREDO } });
    await s.salvar(adm, "clickup", {
      campos: { token: "", listaPadraoId: "55" },
    });
    expect(repo.registros.get("clickup")?.segredos.token).toBeDefined();
    expect(await s.segredo("clickup", "token")).toBe(SEGREDO);
  });

  it("sem INTEGRACOES_CHAVE recusa gravar e a tela é avisada", async () => {
    const { s, repo } = servico(new RepoFalso(), null);
    const adm = usuario("administrador");
    await expect(
      s.salvar(adm, "clickup", { campos: { token: SEGREDO } }),
    ).rejects.toMatchObject({ status: 503 });
    expect(repo.registros.size).toBe(0);
    expect((await s.painel(adm)).gravacaoLiberada).toBe(false);
  });

  it("um segredo gravado volta ao estado pendente até novo teste", async () => {
    const { s, repo } = servico();
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", { campos: { token: SEGREDO } });
    const r = repo.registros.get("clickup");
    if (r) r.estado = "conectado";
    await s.salvar(adm, "clickup", { campos: { token: `${SEGREDO}2` } });
    expect(repo.registros.get("clickup")?.estado).toBe("pendente");
  });
});

describe("lerEntradaIntegracao", () => {
  it("recusa campo desconhecido, tipo errado e situação inválida", () => {
    expect(lerEntradaIntegracao("clickup", { x: 1 }).ok).toBe(false);
    expect(lerEntradaIntegracao("clickup", { campos: { outro: "a" } }).ok).toBe(
      false,
    );
    expect(lerEntradaIntegracao("clickup", { campos: { token: 5 } }).ok).toBe(
      false,
    );
    expect(
      lerEntradaIntegracao("clickup", { mapaStatus: { pronto: "feito" } }).ok,
    ).toBe(false);
    expect(
      lerEntradaIntegracao("clickup", { mapaEstados: { voando: "x" } }).ok,
    ).toBe(false);
    expect(
      lerEntradaIntegracao("shopee", { mapaEstados: { recebida: "x" } }).ok,
    ).toBe(false);
    expect(lerEntradaIntegracao("shopee", { listas: { s1: "1" } }).ok).toBe(
      false,
    );
    expect(lerEntradaIntegracao("clickup", {}).ok).toBe(false);
  });

  it("lê o mapa de estados: corta espaços e descarta vazio (volta ao padrão)", () => {
    const r = lerEntradaIntegracao("clickup", {
      mapaEstados: { recebida: "  Em análise ", triagem: "" },
    });
    expect(r).toMatchObject({
      ok: true,
      entrada: { mapaEstados: { recebida: "Em análise" } },
    });
  });

  it("recusa o mesmo status em dois estados, mesmo com caixa diferente", () => {
    const r = lerEntradaIntegracao("clickup", {
      mapaEstados: { recebida: "Pronto", em_tratativa: "pronto" },
    });
    expect(r.ok).toBe(false);
    // Repetir o padrão de outro estado também confunde o sentido inverso.
    expect(
      lerEntradaIntegracao("clickup", {
        mapaEstados: { recebida: "em tratativa" },
      }).ok,
    ).toBe(false);
  });
});

describe("testar conexão", () => {
  it("ClickUp: sucesso mostra só a mensagem, sem o segredo", async () => {
    const h = http({
      "/team": { status: 200, corpo: { teams: [] } },
      "/list/9012": { status: 200 },
    });
    const { s, repo } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", {
      campos: { token: SEGREDO, listaPadraoId: "9012" },
    });
    const r = await s.testar(adm, "clickup");
    expect(r).toMatchObject({ ok: true, estado: "conectado" });
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
    expect(h.chamadas[0].init?.headers).toEqual({ Authorization: SEGREDO });
    expect(repo.registros.get("clickup")?.estado).toBe("conectado");
  });

  it("ClickUp: token recusado vira erro sem repetir o token", async () => {
    const h = http({ "/team": { status: 401 } });
    const { s, repo } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", { campos: { token: SEGREDO } });
    const r = await s.testar(adm, "clickup");
    expect(r).toMatchObject({ ok: false, estado: "erro" });
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
    expect(repo.registros.get("clickup")?.ultimoErro).toBe(
      "O ClickUp recusou o token.",
    );
    expect(JSON.stringify(repo.auditorias)).not.toContain(SEGREDO);
  });

  it("ClickUp: lista inexistente é apontada", async () => {
    const h = http({
      "/team": { status: 200 },
      "/list/404": { status: 404 },
    });
    const { s } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", {
      campos: { token: SEGREDO, listaPadraoId: "404" },
    });
    const r = await s.testar(adm, "clickup");
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("404");
  });

  it("falha de rede vira mensagem, não exceção", async () => {
    const f = (async () => {
      throw new Error(`conexão caiu com ${SEGREDO}`);
    }) as typeof fetch;
    const { s } = servico(new RepoFalso(), CHAVE, f);
    const adm = usuario("administrador");
    await s.salvar(adm, "clickup", { campos: { token: SEGREDO } });
    const r = await s.testar(adm, "clickup");
    expect(r).toMatchObject({ ok: false, estado: "erro" });
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
  });

  it("sem credenciais, continua pendente e nem chama a rede", async () => {
    const h = http({});
    const { s } = servico(new RepoFalso(), CHAVE, h.f);
    const r = await s.testar(usuario("administrador"), "mercadolivre");
    expect(r).toMatchObject({ ok: false, estado: "pendente" });
    expect(h.chamadas).toHaveLength(0);
  });

  it("Mercado Livre: manda as credenciais no corpo, não na URL", async () => {
    const h = http({ "oauth/token": { status: 200 } });
    const { s } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "mercadolivre", {
      campos: { appId: "123", segredo: SEGREDO },
    });
    const r = await s.testar(adm, "mercadolivre");
    expect(r.ok).toBe(true);
    expect(h.chamadas[0].url).not.toContain(SEGREDO);
    expect(String(h.chamadas[0].init?.body)).toContain("client_id=123");
  });

  it("Shopee: assina a chamada e não manda a chave", async () => {
    const h = http({
      get_shops_by_partner: { status: 200, corpo: { error: "" } },
    });
    const { s } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "shopee", {
      campos: { partnerId: "1001", partnerKey: SEGREDO },
    });
    const r = await s.testar(adm, "shopee");
    expect(r.ok).toBe(true);
    expect(h.chamadas[0].url).toMatch(/sign=[0-9a-f]{64}/);
    expect(h.chamadas[0].url).not.toContain(SEGREDO);
  });

  it("Shopee: assinatura recusada vira erro", async () => {
    const h = http({
      get_shops_by_partner: { status: 403, corpo: { error: "error_sign" } },
    });
    const { s } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "shopee", {
      campos: { partnerId: "1001", partnerKey: SEGREDO },
    });
    expect(await s.testar(adm, "shopee")).toMatchObject({
      ok: false,
      estado: "erro",
    });
  });

  it("OpenRouter: chave recusada", async () => {
    const h = http({ "auth/key": { status: 401 } });
    const { s } = servico(new RepoFalso(), CHAVE, h.f);
    const adm = usuario("administrador");
    await s.salvar(adm, "openrouter", { campos: { chaveApi: SEGREDO } });
    expect(await s.testar(adm, "openrouter")).toMatchObject({
      ok: false,
      estado: "erro",
    });
  });

  it("chave de criptografia trocada: avisa para informar de novo", async () => {
    const repo = new RepoFalso();
    const adm = usuario("administrador");
    await servico(repo, CHAVE).s.salvar(adm, "openrouter", {
      campos: { chaveApi: SEGREDO },
    });
    const r = await servico(repo, randomBytes(32)).s.testar(adm, "openrouter");
    expect(r).toMatchObject({ ok: false, estado: "erro" });
    expect(r.mensagem).toContain("INTEGRACOES_CHAVE");
  });
});
