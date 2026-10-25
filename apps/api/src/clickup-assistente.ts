import type { UsuarioLogado } from "@sac-aisa/auth";
import { ESTADOS, type Estado } from "@sac-aisa/domain";
import { mapaEstadosEfetivo } from "./clickup";
import {
  ErroIntegracao,
  exigirAdministrador,
  type Http,
  type RepositorioIntegracoes,
  type ServicoIntegracoes,
} from "./integracoes";
import { mascarar, removerSegredos } from "./segredos";

/**
 * Assistente do ClickUp: com o token já gravado, monta o Space, as listas por setor, o mapa de
 * status e o webhook. Cada passo é idempotente (reaproveita pelo nome ou pela URL) e o que já foi
 * criado fica, então rodar de novo depois de uma falha só continua de onde parou.
 */

const API = "https://api.clickup.com/api/v2";
export const NOME_DO_SPACE = "SAC AISA";
export const CAMINHO_WEBHOOK = "/api/webhooks/clickup";
export const EVENTOS_WEBHOOK = ["taskStatusUpdated"];

/** Tipo e cor de cada estado no ClickUp: o primeiro é aberto, o último fechado, o resto personalizado. */
const VISUAL: Record<
  Estado,
  { tipo: "open" | "custom" | "closed"; cor: string }
> = {
  triagem: { tipo: "open", cor: "#9ca3af" },
  aguardando_cliente: { tipo: "custom", cor: "#f59e0b" },
  encaminhada: { tipo: "custom", cor: "#3b82f6" },
  recebida: { tipo: "custom", cor: "#06b6d4" },
  em_tratativa: { tipo: "custom", cor: "#8b5cf6" },
  resolvida_setor: { tipo: "custom", cor: "#10b981" },
  finalizada: { tipo: "closed", cor: "#6b7280" },
};

const FUNCIONALIDADES = {
  due_dates: {
    enabled: true,
    start_date: false,
    remap_due_dates: false,
    remap_closed_due_date: false,
  },
  time_tracking: { enabled: false },
  tags: { enabled: true },
  time_estimates: { enabled: false },
  checklists: { enabled: true },
  custom_fields: { enabled: true },
  remap_dependencies: { enabled: false },
  dependency_warning: { enabled: false },
  portfolios: { enabled: false },
};

export type EstadoPasso = "ok" | "erro" | "aviso" | "pulado";

export interface PassoAssistente {
  id: string;
  rotulo: string;
  estado: EstadoPasso;
  mensagem: string;
}

export interface ResultadoAssistente {
  passos: PassoAssistente[];
  /** Nunca o segredo: só se está ativo e a máscara dos 4 últimos caracteres. */
  webhook: { ativo: boolean; mascara: string };
}

export interface RepositorioAssistente {
  /** Quantos eventos do tipo já chegaram para a task. */
  eventosDaTask(taskId: string, tipo: string): Promise<number>;
}

class ErroApi extends Error {}

const norm = (s: string) => s.trim().toLowerCase();

function objeto(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(objeto) : [];
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function idDe(v: unknown): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function nomesStatus(brutos: unknown): string[] {
  const out: string[] = [];
  for (const s of lista(brutos)) {
    const n = texto(s.status).trim();
    if (n && !out.some((x) => norm(x) === norm(n))) out.push(n);
  }
  return out;
}

/** Lista que já existe no ClickUp. O SAC escolhe uma; não cria. */
export interface ListaEmUso {
  id: string;
  nome: string;
  space: string;
  statuses: string[];
}

/** Junta as listas soltas e as de pasta. Status próprio da lista; senão, o do Space. */
export function montarInventario(
  spaces: Record<string, unknown>[],
  porSpace: { spaceId: string; listas: Record<string, unknown>[] }[],
): ListaEmUso[] {
  const saida: ListaEmUso[] = [];
  const vistos = new Set<string>();
  for (const space of spaces) {
    const spaceId = idDe(space.id);
    const nomeSpace = texto(space.name).trim() || "Space";
    const herdados = nomesStatus(space.statuses);
    const extras = porSpace.find((p) => p.spaceId === spaceId)?.listas ?? [];
    for (const item of [...lista(space.lists), ...extras]) {
      const id = idDe(item.id);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const proprios = nomesStatus(item.statuses);
      saida.push({
        id,
        nome: texto(item.name).trim() || id,
        space: nomeSpace,
        statuses: proprios.length > 0 ? proprios : herdados,
      });
    }
  }
  return saida;
}

type Cliente = (
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  caminho: string,
  corpo?: unknown,
) => Promise<Record<string, unknown>>;

/** Cliente do ClickUp: lança `ErroApi` com mensagem em português e sem o corpo bruto da resposta. */
function cliente(http: Http, token: string): Cliente {
  return async (metodo, caminho, corpo) => {
    let r: Response;
    try {
      r = await http(`${API}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: token,
          ...(corpo === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ErroApi("Sem resposta do ClickUp. Tente de novo.");
    }
    const json = objeto(await r.json().catch(() => null));
    if (r.status === 401) throw new ErroApi("O ClickUp recusou o token.");
    if (r.status < 200 || r.status >= 300) {
      const err = texto(json.err);
      throw new ErroApi(
        `O ClickUp respondeu ${r.status}${err ? `: ${err}` : ""}.`,
      );
    }
    return json;
  };
}

export function urlDoWebhook(base: string | undefined): string {
  const b = (base ?? "").trim().replace(/\/+$/, "");
  if (!b) {
    throw new ErroApi(
      "Não sei a URL pública. Defina URL_PUBLICA_WEB (https://...) na web.",
    );
  }
  let u: URL;
  try {
    u = new URL(b);
  } catch {
    throw new ErroApi("A URL pública da web é inválida.");
  }
  if (u.protocol !== "https:") {
    throw new ErroApi(
      "O webhook exige HTTPS. Defina URL_PUBLICA_WEB com https:// (o ClickUp não entrega em HTTP).",
    );
  }
  return `${u.origin}${CAMINHO_WEBHOOK}`;
}

interface DefStatus {
  status: string;
  type: string;
  orderindex: number;
  color: string;
}

function statusDesejados(mapa: Record<Estado, string>): DefStatus[] {
  return ESTADOS.map((e, i) => ({
    status: mapa[e],
    type: VISUAL[e].tipo,
    orderindex: i,
    color: VISUAL[e].cor,
  }));
}

function faltantes(espaco: Record<string, unknown>, desejados: DefStatus[]) {
  const tem = new Set(lista(espaco.statuses).map((s) => norm(texto(s.status))));
  return desejados.filter((d) => !tem.has(norm(d.status)));
}

const PASSOS_DEPOIS: [string, string][] = [
  ["space", `Space “${NOME_DO_SPACE}”`],
  ["status", "Status do fluxo"],
  ["listas", "Uma lista por setor"],
  ["webhook", "Webhook"],
];

export class ServicoAssistenteClickup {
  constructor(
    private readonly integr: ServicoIntegracoes,
    private readonly repoInteg: Pick<RepositorioIntegracoes, "setores">,
    private readonly repoAssist: RepositorioAssistente,
    private readonly http: Http = fetch,
    private readonly dormir: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async token(): Promise<string> {
    const t = await this.integr.segredo("clickup", "token");
    if (!t) {
      throw new ErroIntegracao(
        400,
        "Grave o token do ClickUp na tela de integrações antes de usar o assistente.",
      );
    }
    return t;
  }

  async workspaces(
    usuario: UsuarioLogado,
  ): Promise<{ id: string; nome: string }[]> {
    exigirAdministrador(usuario);
    const token = await this.token();
    try {
      const r = await cliente(this.http, token)("GET", "/team");
      return lista(r.teams).map((t) => ({
        id: String(t.id ?? ""),
        nome: texto(t.name),
      }));
    } catch (e) {
      throw new ErroIntegracao(
        400,
        removerSegredos(
          e instanceof ErroApi ? e.message : "Falha ao consultar o ClickUp.",
          [token],
        ),
      );
    }
  }

  /** Lê spaces, pastas, listas e status do workspace. Não cria nada no ClickUp. */
  async inventario(
    usuario: UsuarioLogado,
    workspaceId: string,
  ): Promise<ListaEmUso[]> {
    exigirAdministrador(usuario);
    const token = await this.token();
    const api = cliente(this.http, token);
    try {
      const r = await api("GET", `/team/${workspaceId}/space?archived=false`);
      const spaces = lista(r.spaces);
      const porSpace = await Promise.all(
        spaces.map(async (space) => {
          const spaceId = idDe(space.id);
          if (!spaceId) return { spaceId: "", listas: [] };
          const [soltas, pastas] = await Promise.all([
            api("GET", `/space/${spaceId}/list?archived=false`),
            api("GET", `/space/${spaceId}/folder?archived=false`),
          ]);
          const listas = [...lista(soltas.lists)];
          for (const pasta of lista(pastas.folders)) {
            const dentro = lista(pasta.lists);
            if (dentro.length > 0) {
              listas.push(...dentro);
              continue;
            }
            const pastaId = idDe(pasta.id);
            if (!pastaId) continue;
            const mais = await api(
              "GET",
              `/folder/${pastaId}/list?archived=false`,
            );
            listas.push(...lista(mais.lists));
          }
          return { spaceId, listas };
        }),
      );
      return montarInventario(spaces, porSpace);
    } catch (e) {
      throw new ErroIntegracao(
        400,
        removerSegredos(
          e instanceof ErroApi ? e.message : "Falha ao consultar o ClickUp.",
          [token],
        ),
      );
    }
  }

  async configurar(
    usuario: UsuarioLogado,
    entrada: {
      workspaceId: string;
      recriarWebhook?: boolean;
      urlBase?: string;
    },
  ): Promise<ResultadoAssistente> {
    exigirAdministrador(usuario);
    const token = await this.token();
    const api = cliente(this.http, token);
    const segredos = [token];
    const passos: PassoAssistente[] = [];
    let webhook = { ativo: false, mascara: "" };

    const limpo = (m: string) => removerSegredos(m, segredos);
    const passo = async (
      id: string,
      rotulo: string,
      f: () => Promise<{ estado?: EstadoPasso; mensagem: string }>,
    ): Promise<boolean> => {
      try {
        const r = await f();
        passos.push({
          id,
          rotulo,
          estado: r.estado ?? "ok",
          mensagem: limpo(r.mensagem),
        });
        return (r.estado ?? "ok") !== "erro";
      } catch (e) {
        const m =
          e instanceof ErroApi || e instanceof ErroIntegracao
            ? e.message
            : "Falha inesperada neste passo.";
        passos.push({ id, rotulo, estado: "erro", mensagem: limpo(m) });
        return false;
      }
    };
    const pular = (id: string, rotulo: string, porque: string) =>
      passos.push({ id, rotulo, estado: "pulado", mensagem: porque });

    // 1. Workspace
    const okWs = await passo("workspace", "Workspace", async () => {
      const r = await api("GET", "/team");
      const t = lista(r.teams).find(
        (x) => String(x.id) === entrada.workspaceId,
      );
      if (!t) {
        return {
          estado: "erro" as const,
          mensagem: "O token não tem acesso a este workspace.",
        };
      }
      return { mensagem: `Workspace “${texto(t.name)}”.` };
    });
    if (!okWs) {
      for (const [id, r] of PASSOS_DEPOIS) {
        pular(id, r, "Depende do workspace.");
      }
      return { passos, webhook };
    }

    const cfg = await this.integr.config("clickup");
    const mapa = mapaEstadosEfetivo(cfg);
    const desejados = statusDesejados(mapa);

    // 2. Space
    let spaceId = "";
    let espaco: Record<string, unknown> = {};
    const okSpace = await passo(
      "space",
      `Space “${NOME_DO_SPACE}”`,
      async () => {
        const r = await api(
          "GET",
          `/team/${encodeURIComponent(entrada.workspaceId)}/space?archived=false`,
        );
        const achado = lista(r.spaces).find(
          (s) => norm(texto(s.name)) === norm(NOME_DO_SPACE),
        );
        if (achado) {
          espaco = achado;
          spaceId = String(achado.id);
        } else {
          espaco = await api(
            "POST",
            `/team/${encodeURIComponent(entrada.workspaceId)}/space`,
            {
              name: NOME_DO_SPACE,
              multiple_assignees: false,
              features: FUNCIONALIDADES,
              statuses: desejados,
            },
          );
          spaceId = String(espaco.id ?? "");
          if (!spaceId) throw new ErroApi("O ClickUp não devolveu o Space.");
        }
        // Preenche o mapa estado → status e guarda onde o Space está.
        await this.integr.salvar(usuario, "clickup", {
          mapaEstados: mapa,
          extra: { workspaceId: entrada.workspaceId, spaceId },
        });
        return {
          mensagem: achado
            ? "Space já existia: reaproveitado."
            : "Space criado.",
        };
      },
    );
    if (!okSpace) {
      for (const [id, r] of PASSOS_DEPOIS.slice(1)) {
        pular(id, r, "Depende do Space.");
      }
      return { passos, webhook };
    }

    // 3. Status. A API pública não altera status do Space: o PUT oficial não tem esse campo.
    await passo("status", "Status do fluxo", async () => {
      espaco = await api("GET", `/space/${encodeURIComponent(spaceId)}`);
      const falta = faltantes(espaco, desejados);
      if (falta.length > 0) {
        return {
          estado: "aviso" as const,
          mensagem: `A API do ClickUp não cria status. No Space “${NOME_DO_SPACE}”, abra os três pontinhos e escolha Status da tarefa. Crie: ${falta.map((f) => f.status).join(", ")}.`,
        };
      }
      return { mensagem: `${desejados.length} status no Space e no mapa.` };
    });

    // 4. Listas por setor
    await passo("listas", "Uma lista por setor", async () => {
      const setores = await this.repoInteg.setores();
      const r = await api(
        "GET",
        `/space/${encodeURIComponent(spaceId)}/list?archived=false`,
      );
      const existentes = lista(r.lists);
      const mapaListas: Record<string, string> = {};
      const falhas: string[] = [];
      let criadas = 0;
      const criarLista = async (nome: string): Promise<string> => {
        let ultimo = "sem detalhe do ClickUp";
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          if (tentativa > 0) await this.dormir(500 * 2 ** (tentativa - 1));
          try {
            const nova = await api(
              "POST",
              `/space/${encodeURIComponent(spaceId)}/list`,
              { name: nome },
            );
            const aninhada = objeto(nova.list);
            const id = String(nova.id ?? aninhada.id ?? "");
            if (!id) throw new ErroApi("O ClickUp não devolveu o id da lista.");
            return id;
          } catch (e) {
            ultimo =
              e instanceof ErroApi ? e.message : "Falha ao criar a lista.";
          }
        }
        throw new ErroApi(ultimo);
      };
      for (const s of setores) {
        const achada = existentes.find(
          (l) => norm(texto(l.name)) === norm(s.nome),
        );
        if (achada) {
          mapaListas[s.id] = String(achada.id);
          continue;
        }
        try {
          if (criadas > 0) await this.dormir(400);
          const id = await criarLista(s.nome);
          mapaListas[s.id] = id;
          existentes.push({ id, name: s.nome });
          criadas++;
        } catch (e) {
          const motivo =
            e instanceof ErroApi ? e.message : "Falha ao criar a lista.";
          falhas.push(`${s.nome} (${motivo})`);
        }
      }
      if (Object.keys(mapaListas).length > 0) {
        await this.integr.salvar(usuario, "clickup", { listas: mapaListas });
      }
      const total = setores.length;
      if (falhas.length > 0) {
        return {
          estado: "erro" as const,
          mensagem: `${Object.keys(mapaListas).length} de ${total} setores com lista (${criadas} criadas). Falhou: ${falhas.join(", ")}. Rode de novo para continuar.`,
        };
      }
      return {
        mensagem: `${total} setores com lista (${criadas} criadas, ${total - criadas} já existiam).`,
      };
    });

    // 5. Webhook
    const okWh = await passo("webhook", "Webhook", async () => {
      const url = urlDoWebhook(entrada.urlBase);
      const base = `/team/${encodeURIComponent(entrada.workspaceId)}/webhook`;
      const r = await api("GET", base);
      const nosso = lista(r.webhooks).find(
        (w) => texto(w.endpoint).replace(/\/+$/, "") === url,
      );
      let id = "";
      let segredo = "";
      let reaproveitado = false;
      if (nosso && !entrada.recriarWebhook && texto(nosso.secret)) {
        id = String(nosso.id);
        segredo = texto(nosso.secret);
        reaproveitado = true;
      } else {
        if (nosso) {
          await api(
            "DELETE",
            `/webhook/${encodeURIComponent(String(nosso.id))}`,
          );
        }
        const c = await api("POST", base, {
          endpoint: url,
          events: EVENTOS_WEBHOOK,
          space_id: Number(spaceId),
        });
        const w = objeto(c.webhook);
        id = String(c.id ?? w.id ?? "");
        segredo = texto(w.secret);
        if (!id || !segredo) {
          throw new ErroApi("O ClickUp não devolveu o webhook completo.");
        }
      }
      segredos.push(segredo);
      await this.integr.salvar(usuario, "clickup", {
        campos: { segredoWebhook: segredo },
        extra: { webhookId: id, webhookUrl: url },
      });
      webhook = { ativo: true, mascara: mascarar(segredo.slice(-4)) };
      return {
        mensagem: reaproveitado
          ? "Webhook ativo (já existia: reaproveitado)."
          : "Webhook criado e ativo.",
      };
    });
    if (!okWh) {
      const s = await this.integr.config("clickup");
      webhook = { ativo: !!s.webhookId, mascara: "" };
    }

    return { passos, webhook };
  }

  async removerWebhook(usuario: UsuarioLogado): Promise<PassoAssistente> {
    exigirAdministrador(usuario);
    const token = await this.token();
    const cfg = await this.integr.config("clickup");
    const id = texto(cfg.webhookId);
    const rotulo = "Remover webhook";
    if (!id) {
      return {
        id: "remover",
        rotulo,
        estado: "ok",
        mensagem: "Não há webhook para remover.",
      };
    }
    try {
      try {
        await cliente(this.http, token)(
          "DELETE",
          `/webhook/${encodeURIComponent(id)}`,
        );
      } catch (e) {
        // Já apagado no ClickUp não é problema.
        if (!(e instanceof ErroApi) || !/respondeu 404/.test(e.message)) {
          throw e;
        }
      }
      await this.integr.salvar(usuario, "clickup", {
        extra: { webhookId: null, webhookUrl: null },
        limparSegredos: ["segredoWebhook"],
      });
      return {
        id: "remover",
        rotulo,
        estado: "ok",
        mensagem: "Webhook removido.",
      };
    } catch (e) {
      return {
        id: "remover",
        rotulo,
        estado: "erro",
        mensagem: removerSegredos(
          e instanceof ErroApi ? e.message : "Falha ao remover o webhook.",
          [token],
        ),
      };
    }
  }

  /** Cria um card de teste, move o status, confere se o evento chegou e apaga o card. */
  async testar(usuario: UsuarioLogado): Promise<PassoAssistente[]> {
    exigirAdministrador(usuario);
    const token = await this.token();
    const api = cliente(this.http, token);
    const passos: PassoAssistente[] = [];
    const add = (id: string, rotulo: string, estado: EstadoPasso, m: string) =>
      passos.push({
        id,
        rotulo,
        estado,
        mensagem: removerSegredos(m, [token]),
      });
    const msg = (e: unknown) =>
      e instanceof ErroApi ? e.message : "Falha inesperada neste passo.";

    const cfg = await this.integr.config("clickup");
    const listas = await this.integr.listasClickup();
    const listaId = Object.values(listas)[0] ?? texto(cfg.listaPadraoId);
    if (!listaId) {
      add("teste-card", "Card de teste", "erro", "Nenhuma lista configurada.");
      return passos;
    }
    const alvo = mapaEstadosEfetivo(cfg).recebida;

    let taskId = "";
    try {
      const t = await api("POST", `/list/${encodeURIComponent(listaId)}/task`, {
        name: "[Teste do SAC AISA] pode apagar",
      });
      taskId = String(t.id ?? "");
      if (!taskId) throw new ErroApi("O ClickUp não devolveu o card.");
      add("teste-card", "Card de teste", "ok", "Card criado.");
    } catch (e) {
      add("teste-card", "Card de teste", "erro", msg(e));
      return passos;
    }

    let moveu = false;
    try {
      await api("PUT", `/task/${encodeURIComponent(taskId)}`, {
        status: alvo,
      });
      moveu = true;
      add("teste-status", "Mover o status", "ok", `Status “${alvo}” aplicado.`);
    } catch (e) {
      add(
        "teste-status",
        "Mover o status",
        "erro",
        `${msg(e)} Confira se o status “${alvo}” existe na lista.`,
      );
    }

    if (!moveu) {
      add("teste-evento", "Evento no webhook", "pulado", "O status não mudou.");
    } else if (!cfg.webhookId) {
      add(
        "teste-evento",
        "Evento no webhook",
        "pulado",
        "O webhook ainda não está ativo.",
      );
    } else {
      let chegou = false;
      for (let i = 0; i < 6 && !chegou; i++) {
        await this.dormir(2000);
        chegou =
          (await this.repoAssist.eventosDaTask(taskId, "taskStatusUpdated")) >
          0;
      }
      add(
        "teste-evento",
        "Evento no webhook",
        chegou ? "ok" : "erro",
        chegou
          ? "O evento chegou e a assinatura conferiu."
          : "O evento não chegou em 12 segundos. Confira a URL pública (HTTPS) e o webhook no ClickUp.",
      );
    }

    try {
      await api("DELETE", `/task/${encodeURIComponent(taskId)}`);
      add("teste-limpeza", "Apagar o card", "ok", "Card de teste apagado.");
    } catch (e) {
      add(
        "teste-limpeza",
        "Apagar o card",
        "aviso",
        `${msg(e)} Apague o card de teste à mão.`,
      );
    }
    return passos;
  }
}
