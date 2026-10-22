import { performance } from "node:perf_hooks";
import type { ContextoCaptura, ServicoCaptura } from "./canal-captura";
import type { ArmazemToken, CanalReal } from "./canal-clientes";
import type { RegistroChamadas } from "./canal-registro";
import type { CanalSim, MarketplaceSimulado } from "./canal-simulado";

/**
 * Cenários da simulação de canais. Cada um mexe no marketplace simulado e faz o canal "avisar"
 * o sistema pelo mesmo caminho do aviso real: assinatura conferida, resposta rápida, fila,
 * busca do caso, mapeamento e gravação. Tudo aparece no registro de chamadas.
 */

export const CENARIOS = [
  "novo_caso",
  "atualizacao",
  "aviso_duplicado",
  "aviso_perdido",
  "busca",
  "reiniciar",
] as const;

export type Cenario = (typeof CENARIOS)[number];

export function ehCenario(v: unknown): v is Cenario {
  return typeof v === "string" && (CENARIOS as readonly string[]).includes(v);
}

export interface ResultadoCenario {
  ok: boolean;
  mensagem: string;
}

const NOME: Record<CanalReal, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
};

export class CenariosSimulados {
  constructor(
    private readonly sim: MarketplaceSimulado,
    private readonly captura: ServicoCaptura,
    private readonly contexto: () => Promise<ContextoCaptura>,
    private readonly armazem: ArmazemToken,
    /** URL pública que o canal chamaria, para o push da Shopee assinar `url|corpo`. */
    private readonly urlPush: () => string,
    private readonly registro: RegistroChamadas,
  ) {}

  /** Sem token, faz a autorização como o redirecionamento faria: code novo, trocado por token. */
  private async garantirAutorizacao(canal: CanalReal): Promise<void> {
    if (await this.armazem.ler(canal)) return;
    this.registro.registrar({
      canal,
      etapa: "autorização iniciada",
      detalhe: `a conta autorizou o aplicativo e o ${NOME[canal]} devolveu um code de uso único`,
      ok: true,
    });
    const code = this.sim.emitirCode(canal as CanalSim);
    const ctx = await this.contexto();
    if (canal === "mercadolivre") await ctx.ml.autorizar(code);
    else await ctx.shopee.autorizar(code);
  }

  /** O canal avisa: monta o POST (assinado) e entrega à rota de aviso, medindo a resposta. */
  private async enviarAviso(canal: CanalReal, id: string): Promise<void> {
    this.registro.registrar({
      canal,
      etapa: "canal enviou o aviso",
      detalhe:
        canal === "mercadolivre"
          ? `POST no tópico post_purchase (claims) sobre a reclamação ${id}`
          : `push 29 (return_updates_push) sobre a devolução ${id}`,
      ok: true,
    });
    const inicio = performance.now();
    const r =
      canal === "mercadolivre"
        ? await (async () => {
            const a = this.sim.avisoML(id);
            return this.captura.receberAvisoML(a.corpo, a.assinatura);
          })()
        : await (async () => {
            const url = this.urlPush();
            const p = this.sim.pushShopee(id, url);
            return this.captura.receberPushShopee(
              url,
              p.corpo,
              p.authorization,
            );
          })();
    this.registro.registrar({
      canal,
      etapa: "respondeu ao aviso",
      detalhe: `HTTP ${r.status}${canal === "mercadolivre" ? " (o canal exige até 500 ms)" : " (a Shopee espera até 3 s)"}`,
      ok: r.status === 200,
      ms: performance.now() - inicio,
    });
    await this.captura.fila.ocioso();
  }

  async executar(
    cenario: Cenario,
    canal: CanalReal,
  ): Promise<ResultadoCenario> {
    if (cenario === "reiniciar") {
      this.sim.reiniciar();
      this.registro.registrar({
        canal: "sistema",
        etapa: "marketplace simulado reiniciado",
        detalhe:
          "12 casos por canal, sem tokens emitidos; as reclamações já gravadas não mudam",
        ok: true,
      });
      return { ok: true, mensagem: "Marketplace simulado reiniciado." };
    }

    await this.garantirAutorizacao(canal);
    const c = canal as CanalSim;

    if (cenario === "novo_caso") {
      const id = this.sim.novoCaso(c);
      this.registro.registrar({
        canal,
        etapa: "novo caso no canal",
        detalhe: `${NOME[canal]}: caso ${id} aberto pelo comprador`,
        ok: true,
      });
      await this.enviarAviso(canal, id);
      return { ok: true, mensagem: `Caso ${id} do ${NOME[canal]} capturado.` };
    }

    if (cenario === "busca") {
      const r = await this.captura.buscar(canal);
      await this.captura.fila.ocioso();
      return {
        ok: true,
        mensagem: `Busca no ${NOME[canal]}: ${r.vistos} caso(s) no canal, ${r.enfileirados} processado(s).`,
      };
    }

    const id = this.sim.ultimoId(c);
    if (!id) return { ok: false, mensagem: "O canal não tem caso para mexer." };

    if (cenario === "aviso_perdido") {
      const novo = this.sim.novoCaso(c);
      this.registro.registrar({
        canal,
        etapa: "aviso perdido",
        detalhe: `${NOME[canal]}: o caso ${novo} foi aberto, mas o aviso nunca chegou`,
        ok: false,
      });
      const r = await this.captura.buscar(canal);
      await this.captura.fila.ocioso();
      return {
        ok: true,
        mensagem: `A busca periódica recuperou o caso ${novo} (${r.enfileirados} processado(s)).`,
      };
    }

    // Os dois cenários abaixo precisam de um caso que o sistema já conheça.
    if (!(await this.captura.capturado(canal, id))) {
      await this.enviarAviso(canal, id);
    }

    if (cenario === "atualizacao") {
      this.sim.atualizar(c, id, {
        acrescentar: "Atualização do comprador: a loja ainda não respondeu.",
        prazoMaisDias: 1,
      });
      this.registro.registrar({
        canal,
        etapa: "caso atualizado no canal",
        detalhe: `${NOME[canal]}: o comprador acrescentou texto e o prazo mudou no caso ${id}`,
        ok: true,
      });
      await this.enviarAviso(canal, id);
      return { ok: true, mensagem: `Caso ${id} atualizado e reprocessado.` };
    }

    // aviso_duplicado: o mesmo aviso chega duas vezes seguidas.
    await this.enviarAviso(canal, id);
    await this.enviarAviso(canal, id);
    return {
      ok: true,
      mensagem: `O aviso do caso ${id} chegou duas vezes e nada foi duplicado.`,
    };
  }
}
