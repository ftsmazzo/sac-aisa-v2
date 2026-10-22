"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  type BotaoCenario,
  botoesDoCanal,
  type CanalId,
  type EstadoSimulacao,
  formatarHora,
  formatarMs,
  mensagemSimulacao,
  NOME_CANAL,
  simboloDoItem,
} from "@/lib/simulacao";
import "../../treino.css";

type Aviso = { tom: "ok" | "erro"; texto: string };

async function chamar(
  caminho: string,
  metodo: "GET" | "POST" | "PUT",
  corpo?: unknown,
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const r = await fetch(`/api/admin/simulacao${caminho}`, {
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

export function Painel({
  inicial,
  administrador,
}: {
  inicial: EstadoSimulacao;
  administrador: boolean;
}) {
  const [estado, setEstado] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function recarregar() {
    const r = await chamar("", "GET");
    if (r.ok) setEstado(r.dados as unknown as EstadoSimulacao);
  }

  async function rodar(
    id: string,
    f: () => Promise<{
      ok: boolean;
      status: number;
      dados: Record<string, unknown>;
    }>,
    sucesso?: (d: Record<string, unknown>) => string,
  ) {
    if (ocupado) return;
    setOcupado(id);
    setAviso(null);
    try {
      const r = await f();
      if (!r.ok) {
        setAviso({
          tom: "erro",
          texto: mensagemSimulacao(
            r.status,
            typeof r.dados.message === "string" ? r.dados.message : undefined,
          ),
        });
      } else if (r.dados.ok === false) {
        setAviso({ tom: "erro", texto: String(r.dados.mensagem ?? "Falhou.") });
      } else {
        setAviso({
          tom: "ok",
          texto: sucesso
            ? sucesso(r.dados)
            : String(r.dados.mensagem ?? "Pronto."),
        });
      }
      await recarregar();
    } catch {
      setAviso({ tom: "erro", texto: mensagemSimulacao(502) });
    } finally {
      setOcupado(null);
    }
  }

  const cenario = (b: BotaoCenario | "reiniciar", canal: CanalId) =>
    rodar(`${b === "reiniciar" ? b : b.cenario}-${canal}`, () =>
      chamar("/cenario", "POST", {
        cenario: b === "reiniciar" ? b : b.cenario,
        canal,
      }),
    );

  const ligado = estado.ativo;

  return (
    <div className="treino">
      <Cartao className="treino__cartao">
        <h2 className="treino__titulo">
          Marketplace simulado{" "}
          <Selo tom={ligado ? "atencao" : "info"}>
            {ligado ? "Ligado" : "Desligado"}
          </Selo>
        </h2>
        <p className="treino__ajuda">
          Ligado, o sistema responde como as APIs do Mercado Livre e da Shopee
          (12 casos fictícios por canal) e capta as reclamações como treino.
          Nunca fica ligado em produção por padrão. Para ir ao canal de verdade,
          desligue aqui, deixe a URL base vazia e cadastre as credenciais em
          Integrações.
        </p>
        {estado.forcadoPorAmbiente ? (
          <p className="treino__aviso">
            Ligado pela variável CANAL_SIMULADO=1 do servidor.
          </p>
        ) : (
          <div className="treino__acoes">
            <Botao
              variante={ligado ? "secundario" : "primario"}
              onClick={() =>
                rodar(
                  "ativo",
                  () => chamar("/ativo", "PUT", { ativo: !ligado }),
                  () =>
                    ligado
                      ? "Marketplace simulado desligado."
                      : "Marketplace simulado ligado.",
                )
              }
              disabled={ocupado !== null || !administrador}
            >
              {ligado
                ? "Desligar o marketplace simulado"
                : "Ligar o marketplace simulado"}
            </Botao>
            {!administrador && (
              <span className="treino__ajuda">
                Só o administrador liga ou desliga.
              </span>
            )}
          </div>
        )}
        <p className="treino__ajuda">
          {estado.reclamacoesCapturadas} reclamação(ões) de treino vieram da
          captura. O que entra aqui é treino: some do sistema normal e se apaga
          em “Apagar dados de treino”.
        </p>
      </Cartao>

      {aviso && (
        <p
          className={`aviso aviso--${aviso.tom}`}
          role={aviso.tom === "erro" ? "alert" : "status"}
        >
          {aviso.texto}
        </p>
      )}

      <div className="simulacao__canais">
        {estado.canais.map((c) => (
          <Cartao key={c.canal} className="treino__cartao">
            <h2 className="treino__titulo">
              {NOME_CANAL[c.canal]}{" "}
              <Selo tom={c.simulado ? "atencao" : "ok"}>
                {c.simulado ? "Simulado" : "API real"}
              </Selo>
            </h2>
            <p className="treino__ajuda">
              URL base: <code>{c.baseUrl}</code>
              {c.casosNoCanal !== null &&
                ` · ${c.casosNoCanal} caso(s) no canal`}
            </p>
            <div className="treino__acoes">
              {botoesDoCanal(c.canal).map((b) => (
                <Botao
                  key={b.cenario}
                  variante={
                    b.cenario === "novo_caso" ? "primario" : "secundario"
                  }
                  title={b.ajuda}
                  onClick={() => cenario(b, c.canal)}
                  disabled={ocupado !== null || !ligado}
                >
                  {ocupado === `${b.cenario}-${c.canal}`
                    ? "Rodando…"
                    : b.rotulo}
                </Botao>
              ))}
            </div>
            <h3 className="integracao__sub">
              O que falta para funcionar de verdade
            </h3>
            <ul className="simulacao__falta">
              {c.falta.map((f) => {
                const s = simboloDoItem(f.feito);
                return (
                  <li key={f.item}>
                    <span
                      className={`simulacao__marca simulacao__marca--${f.feito === true ? "ok" : f.feito === false ? "falta" : "ver"}`}
                      role="img"
                      aria-label={s.rotulo}
                    >
                      {s.texto}
                    </span>
                    <span>
                      <strong>{f.item}</strong>
                      <br />
                      <span className="treino__ajuda">{f.como}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        ))}
      </div>

      <Cartao className="treino__cartao">
        <h2 className="treino__titulo">Registro de chamadas</h2>
        <p className="treino__ajuda">
          Cada etapa como aconteceria de verdade, na ordem, com o tempo que
          levou. Não guarda token, assinatura nem dado do comprador.
        </p>
        <div className="treino__acoes">
          <Botao
            variante="secundario"
            onClick={() =>
              rodar(
                "limpar",
                () => chamar("/registro/limpar", "POST", {}),
                () => "Registro limpo.",
              )
            }
            disabled={ocupado !== null}
          >
            Limpar o registro
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => cenario("reiniciar", "mercadolivre")}
            disabled={ocupado !== null || !ligado}
            title="Volta os dois canais aos 12 casos iniciais. Não apaga reclamações."
          >
            Reiniciar o marketplace simulado
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => rodar("atualizar", () => chamar("", "GET"))}
            disabled={ocupado !== null}
          >
            Atualizar
          </Botao>
        </div>
        {estado.registro.length === 0 ? (
          <p className="treino__ajuda">
            Ainda sem chamadas. Rode um cenário acima.
          </p>
        ) : (
          <div className="simulacao__tabela">
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Canal</th>
                  <th>Etapa</th>
                  <th>Detalhe</th>
                  <th>Tempo</th>
                </tr>
              </thead>
              <tbody>
                {estado.registro.map((p) => (
                  <tr
                    key={p.seq}
                    className={p.ok ? undefined : "simulacao__falha"}
                  >
                    <td>{formatarHora(p.quando)}</td>
                    <td>{NOME_CANAL[p.canal]}</td>
                    <td>
                      {p.ok ? "" : "✗ "}
                      {p.etapa}
                    </td>
                    <td>{p.detalhe}</td>
                    <td>{formatarMs(p.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
