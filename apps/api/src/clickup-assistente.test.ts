import "reflect-metadata";
import { randomBytes } from "node:crypto";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAVE_REQUER } from "./auth.guard";
import {
  type RepositorioAssistente,
  ServicoAssistenteClickup,
  urlDoWebhook,
} from "./clickup-assistente";
import {
  type ChaveIntegracao,
  type RegistroIntegracao,
  type RepositorioIntegracoes,
  ServicoIntegracoes,
} from "./integracoes";
import { ControladorAssistenteClickup } from "./integracoes.controller";

const TOKEN = "pk_TESTE_123456789_TOKEN_LONGO_ABCD";
const SEGREDO_WH = "wh_SEGREDO_DO_WEBHOOK_LONGO_WXYZ";
const URL_WEB = "https://sac.exemplo.com.br";
const URL_HOOK = `${URL_WEB}/api/webhooks/clickup`;

function usuario(perfil: Perfil): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: perfil,
    perfil,
    setores: [],
    permissoes: [...mesclarPermissoes(perfil, [])],
  };
}
const adm = usuario("administrador");

class RepoFalso implements RepositorioIntegracoes {
  registros = new Map<ChaveIntegracao, RegistroIntegracao>();
  listasGravadas: Record<string, string> = {};
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
  }
  async gravarTeste() {}
  async setores() {
    return [
      { id: "s1", nome: "Solda" },
      { id: "s2", nome: "Pintura" },
    ];
  }
  async listas() {
    return this.listasGravadas;
  }
}

interface Opcoes {
  /** Nomes de lista cuja criação falha (503). */
  falhaLista?: string[];
  falhaSpace?: boolean;
  /** O ClickUp ignora os status enviados e devolve só o padrão. */
  ignoraStatus?: boolean;
  /** Resposta de erro que ecoa o token, para provar que a mensagem sai limpa. */
  ecoaToken?: boolean;
}

/** ClickUp de mentira, com estado: nada sai da máquina. `op` é lido a cada chamada. */
function clickupFalso(op: Opcoes) {
  const e = {
    spaces: [] as { id: string; name: string; statuses: unknown[] }[],
    lists: [] as { id: string; name: string }[],
    webhooks: [] as {
      id: string;
      endpoint: string;
      secret: string;
      events: string[];
    }[],
    tasks: new Set<string>(),
    chamadas: [] as string[],
    corpos: [] as unknown[],
    n: 0,
  };
  const resp = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status });
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const caminho = u.pathname.replace("/api/v2", "");
    const metodo = init?.method ?? "GET";
    const chave = `${metodo} ${caminho}`;
    e.chamadas.push(chave);
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (corpo !== undefined) e.corpos.push(corpo);
    const cab = init?.headers as Record<string, string> | undefined;
    if (cab && cab.Authorization !== TOKEN) {
      return resp(401, { err: "Token invalid" });
    }
    if (op.ecoaToken && caminho === "/team") {
      return resp(500, { err: `falha com ${TOKEN}` });
    }
    if (chave === "GET /team") {
      return resp(200, { teams: [{ id: "90", name: "Conta Teste" }] });
    }
    if (chave === "GET /team/90/space") return resp(200, { spaces: e.spaces });
    if (chave === "POST /team/90/space") {
      if (op.falhaSpace) return resp(500, { err: "boom" });
      const s = {
        id: "500",
        name: corpo.name,
        statuses: op.ignoraStatus
          ? [{ status: "to do" }, { status: "complete" }]
          : corpo.statuses,
      };
      e.spaces.push(s);
      return resp(200, s);
    }
    if (chave === "PUT /space/500") return resp(400, { err: "nope" });
    if (chave === "GET /space/500") return resp(200, e.spaces[0]);
    if (chave === "GET /space/500/list") return resp(200, { lists: e.lists });
    if (chave === "POST /space/500/list") {
      if (op.falhaLista?.includes(corpo.name)) {
        return resp(503, { err: "indisponível" });
      }
      const l = { id: `L${++e.n}`, name: corpo.name };
      e.lists.push(l);
      return resp(200, l);
    }
    if (chave === "GET /team/90/webhook") {
      return resp(200, { webhooks: e.webhooks });
    }
    if (chave === "POST /team/90/webhook") {
      const w = {
        id: `W${++e.n}`,
        endpoint: corpo.endpoint,
        secret: `${SEGREDO_WH}${e.n}`,
        events: corpo.events,
      };
      e.webhooks.push(w);
      return resp(200, { id: w.id, webhook: w });
    }
    if (metodo === "DELETE" && caminho.startsWith("/webhook/")) {
      e.webhooks = e.webhooks.filter((w) => w.id !== caminho.split("/")[2]);
      return resp(200, {});
    }
    if (/^POST \/list\/[^/]+\/task$/.test(chave)) {
      const id = `T${++e.n}`;
      e.tasks.add(id);
      return resp(200, { id });
    }
    if (/^PUT \/task\//.test(chave)) return resp(200, {});
    if (/^DELETE \/task\//.test(chave)) {
      e.tasks.delete(caminho.split("/")[2]);
      return resp(200, {});
    }
    return resp(404, { err: "Route not found" });
  }) as typeof fetch;
  return { f, e };
}

async function montar(op: Opcoes = {}, eventos = 1) {
  const repo = new RepoFalso();
  const ck = clickupFalso(op);
  const integr = new ServicoIntegracoes(repo, randomBytes(32), ck.f);
  await integr.salvar(adm, "clickup", { campos: { token: TOKEN } });
  const dormir = vi.fn(async () => {});
  const consultas: [string, string][] = [];
  const repoAssist: RepositorioAssistente = {
    async eventosDaTask(taskId, tipo) {
      consultas.push([taskId, tipo]);
      return eventos;
    },
  };
  const s = new ServicoAssistenteClickup(
    integr,
    repo,
    repoAssist,
    ck.f,
    dormir,
  );
  return { repo, ck, integr, s, dormir, consultas, op };
}

const ENTRADA = { workspaceId: "90", urlBase: URL_WEB };
const estados = (r: { passos: { id: string; estado: string }[] }) =>
  Object.fromEntries(r.passos.map((p) => [p.id, p.estado]));

afterEach(() => vi.restoreAllMocks());

describe("configurar", () => {
  it("monta Space, status, uma lista por setor, mapa e webhook", async () => {
    const { s, ck, integr, repo } = await montar();
    const r = await s.configurar(adm, ENTRADA);

    expect(estados(r)).toEqual({
      workspace: "ok",
      space: "ok",
      status: "ok",
      listas: "ok",
      webhook: "ok",
    });
    expect(ck.e.spaces[0].name).toBe("SAC AISA");
    const enviados = (
      ck.e.corpos.find((c) => (c as { name?: string }).name === "SAC AISA") as {
        statuses: { status: string; type: string; color: string }[];
      }
    ).statuses;
    expect(enviados).toHaveLength(7);
    expect(enviados.map((x) => x.type)).toEqual([
      "open",
      "custom",
      "custom",
      "custom",
      "custom",
      "custom",
      "closed",
    ]);
    expect(new Set(enviados.map((x) => x.color)).size).toBe(7);

    expect(ck.e.lists.map((l) => l.name).sort()).toEqual(["Pintura", "Solda"]);
    expect(repo.listasGravadas).toEqual({ s1: "L1", s2: "L2" });
    const cfg = await integr.config("clickup");
    expect(cfg).toMatchObject({ workspaceId: "90", spaceId: "500" });
    expect(cfg.webhookUrl).toBe(URL_HOOK);
    expect((cfg.mapaEstados as Record<string, string>).triagem).toBe("triagem");

    const w = ck.e.webhooks[0];
    expect(w.endpoint).toBe(URL_HOOK);
    expect(w.events).toEqual(["taskStatusUpdated"]);
    expect(
      ck.e.corpos.find((c) => (c as { endpoint?: string }).endpoint),
    ).toMatchObject({ space_id: 500 });
    expect(await integr.segredo("clickup", "segredoWebhook")).toBe(w.secret);
    expect(r.webhook).toEqual({
      ativo: true,
      mascara: `••••${w.secret.slice(-4)}`,
    });
  });

  it("é idempotente: a segunda rodada não cria nada de novo", async () => {
    const { s, ck } = await montar();
    await s.configurar(adm, ENTRADA);
    const antes = ck.e.chamadas.length;
    const r = await s.configurar(adm, ENTRADA);
    const novas = ck.e.chamadas.slice(antes);

    expect(novas.some((c) => c.startsWith("POST"))).toBe(false);
    expect(ck.e.spaces).toHaveLength(1);
    expect(ck.e.lists).toHaveLength(2);
    expect(ck.e.webhooks).toHaveLength(1);
    expect(r.passos.find((p) => p.id === "webhook")?.mensagem).toMatch(
      /reaproveitado/,
    );
    expect(Object.values(estados(r)).every((x) => x === "ok")).toBe(true);
  });

  it("reaproveita pelo nome um Space e listas que já existiam", async () => {
    const { s, ck, repo } = await montar();
    ck.e.spaces.push({
      id: "500",
      name: "sac aisa",
      statuses: [
        "triagem",
        "aguardando cliente",
        "encaminhada ao setor",
        "recebida pelo setor",
        "em tratativa",
        "resolvida no setor técnico",
        "finalizada no sac",
      ].map((status) => ({ status })),
    });
    ck.e.lists.push({ id: "L99", name: "SOLDA" });
    const r = await s.configurar(adm, ENTRADA);
    expect(ck.e.chamadas).not.toContain("POST /team/90/space");
    expect(repo.listasGravadas.s1).toBe("L99");
    expect(estados(r).status).toBe("ok");
  });

  it("recriar o webhook apaga o antigo e cria outro", async () => {
    const { s, ck } = await montar();
    await s.configurar(adm, ENTRADA);
    const antigo = ck.e.webhooks[0].id;
    await s.configurar(adm, { ...ENTRADA, recriarWebhook: true });
    expect(ck.e.webhooks).toHaveLength(1);
    expect(ck.e.webhooks[0].id).not.toBe(antigo);
  });

  it("falha no meio: o que foi criado fica e a segunda rodada continua", async () => {
    const { s, ck, repo, op } = await montar({ falhaLista: ["Pintura"] });
    const r1 = await s.configurar(adm, ENTRADA);
    expect(estados(r1)).toMatchObject({
      space: "ok",
      listas: "erro",
      webhook: "ok",
    });
    expect(r1.passos.find((p) => p.id === "listas")?.mensagem).toMatch(
      /Pintura/,
    );
    expect(repo.listasGravadas).toEqual({ s1: "L1" });
    expect(ck.e.spaces).toHaveLength(1);

    op.falhaLista = [];
    const r2 = await s.configurar(adm, ENTRADA);
    expect(Object.values(estados(r2)).every((x) => x === "ok")).toBe(true);
    expect(repo.listasGravadas).toEqual({ s1: "L1", s2: expect.any(String) });
    expect(ck.e.spaces).toHaveLength(1);
    expect(ck.e.lists).toHaveLength(2);
    expect(ck.e.webhooks).toHaveLength(1);
  });

  it("sem acesso ao Space, os passos seguintes não rodam", async () => {
    const { s, ck } = await montar({ falhaSpace: true });
    const r = await s.configurar(adm, ENTRADA);
    expect(estados(r)).toEqual({
      workspace: "ok",
      space: "erro",
      status: "pulado",
      listas: "pulado",
      webhook: "pulado",
    });
    expect(ck.e.chamadas.some((c) => c.includes("webhook"))).toBe(false);
  });

  it("workspace que o token não enxerga para tudo", async () => {
    const { s } = await montar();
    const r = await s.configurar(adm, { ...ENTRADA, workspaceId: "1" });
    expect(estados(r).workspace).toBe("erro");
    expect(estados(r).space).toBe("pulado");
  });

  it("avisa quando o ClickUp não aceita criar os status pela API", async () => {
    const { s } = await montar({ ignoraStatus: true });
    const r = await s.configurar(adm, ENTRADA);
    const p = r.passos.find((x) => x.id === "status");
    expect(p?.estado).toBe("aviso");
    expect(p?.mensagem).toMatch(/triagem/);
  });
});

describe("URL do webhook", () => {
  it("recusa HTTP e deixa o resto seguir", async () => {
    const { s, ck } = await montar();
    const r = await s.configurar(adm, {
      workspaceId: "90",
      urlBase: "http://sac.exemplo.com.br",
    });
    const p = r.passos.find((x) => x.id === "webhook");
    expect(p?.estado).toBe("erro");
    expect(p?.mensagem).toMatch(/HTTPS/);
    expect(estados(r).listas).toBe("ok");
    expect(ck.e.chamadas).not.toContain("POST /team/90/webhook");
    expect(r.webhook.ativo).toBe(false);
  });

  it("sem URL nenhuma, pede URL_PUBLICA_WEB", () => {
    expect(() => urlDoWebhook(undefined)).toThrow(/URL_PUBLICA_WEB/);
    expect(() => urlDoWebhook("ftp://x.com")).toThrow(/HTTPS/);
  });

  it("monta o caminho do proxy da web, sem barra duplicada", () => {
    expect(urlDoWebhook("https://sac.exemplo.com.br/")).toBe(URL_HOOK);
  });
});

describe("segredos", () => {
  it("o token e o segredo do webhook nunca saem na resposta, nem nos logs", async () => {
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "info"),
    ];
    const { s, ck, repo } = await montar();
    const r = await s.configurar(adm, ENTRADA);
    const t = await s.testar(adm);
    const ws = await s.workspaces(adm);
    const segredo = ck.e.webhooks[0].secret;

    const saida = JSON.stringify([r, t, ws]);
    expect(saida).not.toContain(TOKEN);
    expect(saida).not.toContain(segredo);
    expect(saida).not.toContain("SEGREDO_DO_WEBHOOK");
    expect(JSON.stringify([...repo.registros.values()])).not.toContain(segredo);
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });

  it("erro do ClickUp que ecoa o token chega sem ele", async () => {
    const { s } = await montar({ ecoaToken: true });
    const r = await s.configurar(adm, ENTRADA);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(r.passos[0].mensagem).toContain("[oculto]");
    const erro = await s.workspaces(adm).catch((e) => e);
    expect(erro).toMatchObject({ status: 400 });
    expect(String(erro.message)).not.toContain(TOKEN);
  });

  it("sem token gravado o assistente recusa", async () => {
    const repo = new RepoFalso();
    const ck = clickupFalso({});
    const integr = new ServicoIntegracoes(repo, randomBytes(32), ck.f);
    const s = new ServicoAssistenteClickup(
      integr,
      repo,
      { eventosDaTask: async () => 0 },
      ck.f,
    );
    await expect(s.configurar(adm, ENTRADA)).rejects.toMatchObject({
      status: 400,
    });
    expect(ck.e.chamadas).toHaveLength(0);
  });
});

describe("remover e testar", () => {
  it("remover apaga o webhook e esquece o segredo", async () => {
    const { s, ck, integr } = await montar();
    await s.configurar(adm, ENTRADA);
    const p = await s.removerWebhook(adm);
    expect(p.estado).toBe("ok");
    expect(ck.e.webhooks).toHaveLength(0);
    expect((await integr.config("clickup")).webhookId).toBeUndefined();
    expect(await integr.segredo("clickup", "segredoWebhook")).toBeNull();
    expect((await s.removerWebhook(adm)).mensagem).toMatch(/Não há/);
  });

  it("testar: cria o card, move o status, vê o evento e apaga o card", async () => {
    const { s, ck, consultas } = await montar();
    await s.configurar(adm, ENTRADA);
    const passos = await s.testar(adm);
    expect(passos.map((p) => [p.id, p.estado])).toEqual([
      ["teste-card", "ok"],
      ["teste-status", "ok"],
      ["teste-evento", "ok"],
      ["teste-limpeza", "ok"],
    ]);
    expect(consultas[0][1]).toBe("taskStatusUpdated");
    expect(ck.e.tasks.size).toBe(0);
    expect(
      ck.e.corpos.find((c) => (c as { status?: string }).status),
    ).toMatchObject({ status: "recebida pelo setor" });
  });

  it("testar: evento que não chega vira erro, depois de esperar", async () => {
    const { s, dormir, ck } = await montar({}, 0);
    await s.configurar(adm, ENTRADA);
    dormir.mockClear();
    const passos = await s.testar(adm);
    expect(passos.find((p) => p.id === "teste-evento")?.estado).toBe("erro");
    expect(dormir).toHaveBeenCalledTimes(6);
    expect(ck.e.tasks.size).toBe(0);
  });

  it("testar sem webhook pula a conferência do evento", async () => {
    const { s } = await montar();
    await s.configurar(adm, { workspaceId: "90", urlBase: "http://x.com" });
    const passos = await s.testar(adm);
    expect(passos.find((p) => p.id === "teste-evento")?.estado).toBe("pulado");
  });
});

describe("permissão", () => {
  it("as rotas exigem a permissão de integrações", () => {
    for (const rota of [
      "workspaces",
      "configurar",
      "removerWebhook",
      "testar",
    ] as const) {
      expect(
        Reflect.getMetadata(
          CHAVE_REQUER,
          ControladorAssistenteClickup.prototype[rota],
        ),
      ).toEqual(["integracoes.gerir"]);
    }
  });

  it.each(["gestor", "operacao", "responsavel_setor"] as Perfil[])(
    "%s é recusado em tudo e nada chega ao ClickUp",
    async (perfil) => {
      const { s, ck } = await montar();
      const u = usuario(perfil);
      const antes = ck.e.chamadas.length;
      await expect(s.workspaces(u)).rejects.toMatchObject({ status: 403 });
      await expect(s.configurar(u, ENTRADA)).rejects.toMatchObject({
        status: 403,
      });
      await expect(s.removerWebhook(u)).rejects.toMatchObject({ status: 403 });
      await expect(s.testar(u)).rejects.toMatchObject({ status: 403 });
      expect(ck.e.chamadas.length).toBe(antes);
    },
  );
});
