"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import { ESTADOS, ROTULO_ESTADO } from "@/lib/reclamacoes-formato";
import { mensagemTreino, type SituacaoTreino } from "@/lib/treino";
import "../../treino.css";

type Aviso = { tom: "ok" | "erro" | "info"; texto: string };
type Acao = "carregar" | "apagar" | "mercadolivre" | "shopee";

async function chamar(
  caminho: string,
  corpo?: unknown,
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const r = await fetch(`/api/admin/treino/${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo ?? {}),
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
  inicial: SituacaoTreino;
  administrador: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);

  async function executar(
    acao: Acao,
    caminho: string,
    corpo: unknown,
    texto: (d: Record<string, unknown>) => string,
  ) {
    if (ocupado) return;
    setOcupado(acao);
    setAviso(null);
    setFicha(null);
    try {
      const r = await chamar(caminho, corpo);
      if (!r.ok) {
        setAviso({
          tom: "erro",
          texto: mensagemTreino(
            r.status,
            typeof r.dados.message === "string" ? r.dados.message : undefined,
          ),
        });
        return;
      }
      setAviso({ tom: "ok", texto: texto(r.dados) });
      if (typeof r.dados.id === "string") setFicha(r.dados.id);
      router.refresh();
    } catch {
      setAviso({ tom: "erro", texto: mensagemTreino(502) });
    } finally {
      setOcupado(null);
      setConfirmando(false);
    }
  }

  const total = inicial.resumo.reclamacoes;

  return (
    <div className="treino">
      <Cartao className="treino__cartao">
        <h2 className="treino__titulo">
          Dados de treino{" "}
          <Selo tom={inicial.modoTreino ? "atencao" : "info"}>
            {inicial.modoTreino ? "Visão de treino ligada" : "Visão real"}
          </Selo>
        </h2>
        <p className="treino__ajuda">
          {total === 0
            ? "Ainda não há reclamações de treino."
            : `${total} reclamação(ões) de treino no banco.`}{" "}
          {inicial.modoTreino
            ? "Você está vendo só dados de treino."
            : "Ligue o “Modo treino” no topo para vê-las: a visão mostra só treino, nunca os dados reais."}
        </p>
        {total > 0 && (
          <ul className="treino__ajuda">
            {ESTADOS.filter((e) => inicial.resumo.porEstado[e] > 0).map((e) => (
              <li key={e}>
                {ROTULO_ESTADO[e]}: {inicial.resumo.porEstado[e]}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao className="treino__cartao">
        <h2 className="treino__titulo">Simular a chegada de um canal</h2>
        <p className="treino__ajuda">
          Cria uma reclamação de treino em Triagem a partir de uma carga
          fictícia no formato da API do canal: pedido, SKU, texto do comprador e
          prazo do marketplace. A Shopee entrega o e-mail mascarado.
        </p>
        <div className="treino__acoes">
          <Botao
            onClick={() =>
              executar(
                "mercadolivre",
                "simular",
                { canal: "mercadolivre" },
                (d) => `Reclamação de treino #${String(d.numero)} criada.`,
              )
            }
            disabled={ocupado !== null}
          >
            {ocupado === "mercadolivre"
              ? "Simulando…"
              : "Simular reclamação do Mercado Livre"}
          </Botao>
          <Botao
            onClick={() =>
              executar(
                "shopee",
                "simular",
                { canal: "shopee" },
                (d) => `Devolução de treino #${String(d.numero)} criada.`,
              )
            }
            disabled={ocupado !== null}
          >
            {ocupado === "shopee"
              ? "Simulando…"
              : "Simular devolução da Shopee"}
          </Botao>
        </div>
        {aviso && (
          <p
            className={`aviso aviso--${aviso.tom}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
          >
            {aviso.texto}
            {ficha && inicial.modoTreino && (
              <>
                {" "}
                <Link href={`/reclamacoes?ficha=${ficha}`}>Abrir a ficha</Link>
              </>
            )}
          </p>
        )}
      </Cartao>

      {administrador && (
        <Cartao className="treino__cartao">
          <h2 className="treino__titulo">Dados de demonstração</h2>
          <p className="treino__ajuda">
            Cria cerca de 18 reclamações fictícias nas três marcas, nos sete
            estados, com histórico, relógios, algumas atrasadas, uma perto do
            prazo do marketplace e uma reaberta. Pode rodar de novo: não
            duplica.
          </p>
          <div className="treino__acoes">
            <Botao
              onClick={() =>
                executar(
                  "carregar",
                  "demonstracao",
                  {},
                  (d) =>
                    `Demonstração carregada: ${String(d.criadas)} criadas, ${String(d.jaExistiam)} já existiam.`,
                )
              }
              disabled={ocupado !== null}
            >
              {ocupado === "carregar"
                ? "Carregando…"
                : "Carregar dados de demonstração"}
            </Botao>
            {confirmando ? (
              <>
                <Botao
                  variante="secundario"
                  onClick={() =>
                    executar(
                      "apagar",
                      "apagar",
                      { confirmar: true },
                      (d) =>
                        `Apagadas ${String(d.reclamacoes)} reclamações de treino.`,
                    )
                  }
                  disabled={ocupado !== null}
                >
                  {ocupado === "apagar" ? "Apagando…" : "Sim, apagar o treino"}
                </Botao>
                <Botao
                  variante="secundario"
                  onClick={() => setConfirmando(false)}
                  disabled={ocupado !== null}
                >
                  Cancelar
                </Botao>
              </>
            ) : (
              <Botao
                variante="secundario"
                onClick={() => setConfirmando(true)}
                disabled={ocupado !== null || total === 0}
              >
                Apagar dados de treino
              </Botao>
            )}
          </div>
          {confirmando && (
            <p className="treino__aviso" role="alert">
              Isto apaga as {total} reclamações de treino, com histórico e
              capturas. Os dados reais não são tocados. Não dá para desfazer.
            </p>
          )}
        </Cartao>
      )}

      <Cartao className="treino__cartao">
        <h2 className="treino__titulo">ClickUp</h2>
        <p className="treino__ajuda">
          Reclamações de treino{" "}
          <strong>
            {inicial.criarCardsTreino ? "criam" : "não criam"} cards
          </strong>{" "}
          no ClickUp.{" "}
          {administrador ? (
            <>
              A opção fica em{" "}
              <Link href="/admin/integracoes">Integrações › ClickUp</Link>.
            </>
          ) : (
            "Só o administrador muda isto."
          )}
        </p>
        {inicial.criarCardsTreino && (
          <p className="treino__aviso">
            Atenção: com a opção ligada, o treino aparece no ClickUp
            configurado.
          </p>
        )}
      </Cartao>
    </div>
  );
}
