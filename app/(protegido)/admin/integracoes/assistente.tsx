"use client";

import { useState } from "react";
import { Botao, Selo } from "@/components/ui";
import {
  type Integracao,
  type ListaEmUso,
  mensagemIntegracao,
  type PassoAssistente,
  ROTULO_PASSO,
} from "@/lib/integracoes";

type Aviso = { tom: "ok" | "erro" | "info"; texto: string };
type Resposta = { ok: boolean; status: number; dados: Record<string, unknown> };

async function chamar(
  caminho: string,
  metodo: "GET" | "POST",
  corpo?: unknown,
): Promise<Resposta> {
  const r = await fetch(`/api/admin/integracoes/clickup/assistente${caminho}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = ((await r.json().catch(() => null)) ?? {}) as Record<
    string,
    unknown
  >;
  return { ok: r.ok, status: r.status, dados };
}

type Acao =
  | "workspaces"
  | "trazer"
  | "ativar"
  | "configurar"
  | "remover"
  | "testar";

function listasDaResposta(dados: Record<string, unknown>): ListaEmUso[] {
  if (!Array.isArray(dados.listas)) return [];
  return dados.listas.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.nome !== "string") return [];
    const statuses = Array.isArray(o.statuses)
      ? o.statuses.filter((s): s is string => typeof s === "string")
      : [];
    return [
      {
        id: o.id,
        nome: o.nome,
        space: typeof o.space === "string" ? o.space : "",
        statuses,
      },
    ];
  });
}

export function AssistenteClickup({
  integracao,
  gravacaoLiberada,
  atualizar,
  aoTrazer,
}: {
  integracao: Integracao;
  gravacaoLiberada: boolean;
  atualizar: () => Promise<void>;
  aoTrazer: (listas: ListaEmUso[], workspaceId: string) => void;
}) {
  const [workspaces, setWorkspaces] = useState<{ id: string; nome: string }[]>(
    [],
  );
  const [escolhido, setEscolhido] = useState(
    integracao.clickup?.assistente.workspaceId ?? "",
  );
  const [passos, setPassos] = useState<PassoAssistente[]>([]);
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const token = integracao.campos.find((c) => c.nome === "token");
  const segredoWh = integracao.campos.find((c) => c.nome === "segredoWebhook");
  const webhookAtivo = integracao.clickup?.assistente.webhookAtivo ?? false;
  const falhou = passos.some((p) => p.estado === "erro");

  async function rodar(acao: Acao, f: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(acao);
    setAviso(null);
    try {
      await f();
    } catch {
      setAviso({ tom: "erro", texto: "Não foi possível conectar." });
    } finally {
      setOcupado(null);
    }
  }

  function falha(r: Resposta) {
    setAviso({
      tom: "erro",
      texto: mensagemIntegracao(
        r.status,
        typeof r.dados.message === "string" ? r.dados.message : undefined,
      ),
    });
  }

  const carregar = () =>
    rodar("workspaces", async () => {
      const r = await chamar("/workspaces", "GET");
      if (!r.ok) return falha(r);
      const lista = (r.dados.workspaces ?? []) as {
        id: string;
        nome: string;
      }[];
      setWorkspaces(lista);
      if (lista.length === 1) setEscolhido(lista[0].id);
      if (lista.length === 0) {
        setAviso({
          tom: "info",
          texto: "O token não enxerga nenhum workspace.",
        });
      }
    });

  const trazer = () =>
    rodar("trazer", async () => {
      const r = await chamar(
        `/inventario?workspaceId=${encodeURIComponent(escolhido)}`,
        "GET",
      );
      if (!r.ok) return falha(r);
      const listas = listasDaResposta(r.dados);
      aoTrazer(listas, escolhido);
      setAviso({
        tom: listas.length > 0 ? "ok" : "info",
        texto:
          listas.length > 0
            ? `${listas.length} listas do ClickUp. Onde o nome da lista é o do setor, ela já fica escolhida. Confira e grave.`
            : "Esse workspace não tem lista ativa.",
      });
    });

  const configurar = (recriarWebhook = false) =>
    rodar("configurar", async () => {
      setPassos([]);
      const r = await chamar("/configurar", "POST", {
        workspaceId: escolhido,
        recriarWebhook,
      });
      if (!r.ok) return falha(r);
      const novos = (r.dados.passos ?? []) as PassoAssistente[];
      setPassos(novos);
      await atualizar();
      setAviso(
        novos.some((p) => p.estado === "erro")
          ? {
              tom: "erro",
              texto:
                "Um passo falhou. O que já foi criado ficou: corrija e clique em “Continuar configuração”.",
            }
          : { tom: "ok", texto: "ClickUp configurado. Use “Testar fluxo”." },
      );
    });

  function remover() {
    if (
      !window.confirm("Remover o webhook? O ClickUp deixa de avisar o SAC.")
    ) {
      return;
    }
    void rodar("remover", async () => {
      const r = await chamar("/webhook/remover", "POST");
      if (!r.ok) return falha(r);
      setPassos((r.dados.passos ?? []) as PassoAssistente[]);
      await atualizar();
    });
  }

  const ativar = (recriarWebhook = false) =>
    rodar("ativar", async () => {
      const r = await chamar("/webhook/ativar", "POST", {
        workspaceId: escolhido,
        recriar: recriarWebhook,
      });
      if (!r.ok) return falha(r);
      await atualizar();
      setAviso({
        tom: "ok",
        texto:
          typeof r.dados.mensagem === "string"
            ? r.dados.mensagem
            : "Webhook ativo.",
      });
    });

  function recriar() {
    if (
      window.confirm(
        "Recriar o webhook? O atual é apagado e um novo, com outro segredo, é criado. Nenhuma lista é criada.",
      )
    ) {
      void ativar(true);
    }
  }

  const testar = () =>
    rodar("testar", async () => {
      setPassos([]);
      const r = await chamar("/testar", "POST");
      if (!r.ok) return falha(r);
      setPassos((r.dados.passos ?? []) as PassoAssistente[]);
    });

  const livre = gravacaoLiberada && !!token?.preenchido && ocupado === null;

  return (
    <div className="assistente">
      <h3 className="integracao__sub">
        Trocar para o ClickUp que já está em uso
      </h3>
      <ol className="assistente__roteiro">
        <li>
          Se a conta ligada agora é a de teste, clique em Excluir conexão, no
          fim deste cartão.
        </li>
        <li>
          Cole o token novo, que começa com pk_, no campo Token da API e clique
          em Gravar.
        </li>
        <li>
          Clique em Buscar workspaces, escolha a conta e depois em Trazer listas
          e status.
        </li>
        <li>
          Confira a lista de cada setor e grave de novo. O SAC usa o que já
          existe no ClickUp e não cria Space, lista nem status.
        </li>
      </ol>
      {!token?.preenchido && (
        <p className="aviso aviso--info" role="status">
          Grave o token do ClickUp primeiro.
        </p>
      )}

      <div className="assistente__linha">
        <Botao variante="secundario" onClick={carregar} disabled={!livre}>
          {ocupado === "workspaces" ? "Buscando…" : "Buscar workspaces"}
        </Botao>
        {workspaces.length > 0 && (
          <select
            className="assistente__select"
            aria-label="Workspace do ClickUp"
            value={escolhido}
            onChange={(e) => setEscolhido(e.target.value)}
          >
            <option value="">Escolha o workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="assistente__linha">
        <Botao onClick={trazer} disabled={!livre || !escolhido}>
          {ocupado === "trazer" ? "Trazendo…" : "Trazer listas e status"}
        </Botao>
        <Botao variante="secundario" onClick={testar} disabled={!livre}>
          {ocupado === "testar" ? "Testando…" : "Testar fluxo"}
        </Botao>
      </div>

      <div className="assistente__linha">
        {webhookAtivo ? (
          <>
            <Selo tom="ok">Webhook ativo</Selo>
            {segredoWh?.mascara && (
              <span className="campo__ajuda">Segredo {segredoWh.mascara}</span>
            )}
            <Botao
              variante="secundario"
              onClick={recriar}
              disabled={!livre || !escolhido}
            >
              Recriar webhook
            </Botao>
            <Botao variante="secundario" onClick={remover} disabled={!livre}>
              Remover webhook
            </Botao>
          </>
        ) : (
          <>
            <Selo tom="atencao">Webhook inativo</Selo>
            <Botao onClick={() => ativar()} disabled={!livre || !escolhido}>
              {ocupado === "ativar" ? "Ativando…" : "Ativar webhook"}
            </Botao>
            <span className="campo__ajuda">
              O ClickUp avisa o SAC quando alguém move um card. Isso só registra
              o aviso no workspace escolhido.
            </span>
          </>
        )}
      </div>

      <details className="integracao__passos">
        <summary>Jeito antigo: criar o Space de teste</summary>
        <p className="campo__ajuda">
          Era assim que o sistema fazia com a conta vazia: criava o Space “SAC
          AISA”, uma lista por setor, os status e o webhook. No ClickUp que já
          está em uso, não use isto.
        </p>
        <Botao
          variante="secundario"
          onClick={() => configurar()}
          disabled={!livre || !escolhido}
        >
          {ocupado === "configurar"
            ? "Criando…"
            : falhou
              ? "Continuar a criação de teste"
              : "Criar estrutura de teste"}
        </Botao>
      </details>

      {passos.length > 0 && (
        <ol className="assistente__passos" aria-label="Progresso">
          {passos.map((p) => (
            <li key={p.id} className={`assistente__passo is-${p.estado}`}>
              <strong>{p.rotulo}</strong>
              <span className="assistente__estado">
                {ROTULO_PASSO[p.estado]}
              </span>
              <span className="assistente__msg">{p.mensagem}</span>
            </li>
          ))}
        </ol>
      )}

      {aviso && (
        <p
          className={`aviso aviso--${aviso.tom}`}
          role={aviso.tom === "erro" ? "alert" : "status"}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
