import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  ALERT_CONFIG_PADRAO,
  type AlertConfig,
  type AlertTipo,
  compararUrgencia,
  type ReclamacaoLike,
  ROTULO_ALERTA,
  temPermissao,
  urgenciaDe,
} from "@sac-aisa/domain";
import { type Escopo, filtroDeEscopo } from "./reclamacoes";
import { ErroEscrita } from "./reclamacoes-escrita";

/** Reclamação em aberto, com só o que as regras de alerta e a fila precisam. */
export interface LinhaAberta {
  id: string;
  numero: number;
  dataAbertura: string;
  devolucao: "NA" | "AGUARDANDO" | "RECEBIDO";
  causaId: string | null;
  causaManual: boolean;
  descricao: string;
  laudo: string;
  solucao: string;
  produto: { codigo: string; nome: string } | null;
  causaNome: string | null;
  setorResp: { id: string; nome: string } | null;
  /** Setores que já registraram análise. */
  setoresComAnalise: string[];
  custos: {
    freteEnvio: number;
    freteRetorno: number;
    valorPeca: number;
    estorno: number;
    desconto: number;
    guia: number;
  };
}

export interface RepositorioFila {
  /** Reclamações dentro do filtro, já limitadas pelo repositório. */
  abertas(where: Prisma.ReclamacaoWhereInput): Promise<LinhaAberta[]>;
}

function paraDominio(l: LinhaAberta): ReclamacaoLike {
  return {
    data: l.dataAbertura,
    dataAcao: null,
    devolucao: l.devolucao,
    causaId: l.causaId,
    causaManual: l.causaManual,
    reclamacao: l.descricao,
    laudo: l.laudo,
    solucao: l.solucao,
    ...l.custos,
  };
}

function exigir(u: UsuarioLogado, chave: string) {
  if (!temPermissao(u.permissoes, chave)) {
    throw new ErroEscrita(403, "Sem permissão para esta ação.");
  }
}

function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

const arredondar = (v: number) => Math.round(v * 100) / 100;

export class ServicoFilaAlertas {
  constructor(
    private readonly repo: RepositorioFila,
    private readonly agora: () => Date = () => new Date(),
    private readonly cfg: AlertConfig = ALERT_CONFIG_PADRAO,
  ) {}

  private abertas(
    usuario: UsuarioLogado,
    extra: Prisma.ReclamacaoWhereInput[] = [],
  ) {
    const escopo: Escopo = { perfil: usuario.perfil, setores: usuario.setores };
    const doEscopo = filtroDeEscopo(escopo);
    const e: Prisma.ReclamacaoWhereInput[] = [{ dataAcao: null }, ...extra];
    if (doEscopo) e.push(doEscopo);
    return this.repo.abertas({ AND: e });
  }

  /** Pendentes de análise: com setor responsável que ainda não analisou. Mais urgentes primeiro. */
  async fila(usuario: UsuarioLogado) {
    exigir(usuario, "reclamacoes.analisar");
    const hoje = hojeEmSaoPaulo(this.agora());
    const linhas = await this.abertas(usuario, [
      { setorRespId: { not: null } },
    ]);
    const itens = linhas
      .filter(
        (l) => l.setorResp && !l.setoresComAnalise.includes(l.setorResp.id),
      )
      .map((l) => ({ l, u: urgenciaDe(paraDominio(l), this.cfg, hoje) }))
      .sort((a, b) => compararUrgencia(a.u, b.u) || a.l.numero - b.l.numero)
      .map(({ l, u }) => ({
        id: l.id,
        numero: l.numero,
        dataAbertura: l.dataAbertura,
        diasEmAberto: u.dias,
        devolucao: l.devolucao,
        produto: l.produto,
        causa: l.causaNome,
        setorResp: l.setorResp,
        custoTotal: arredondar(u.custo),
        alertas: u.alertas,
      }));
    return { itens, total: itens.length };
  }

  /** Alertas gerados na hora pelas regras do domínio, sobre o que está em aberto. */
  async alertas(usuario: UsuarioLogado) {
    exigir(usuario, "alertas.ver");
    const hoje = hojeEmSaoPaulo(this.agora());
    const linhas = await this.abertas(usuario);
    const itens = linhas.flatMap((l) => {
      const u = urgenciaDe(paraDominio(l), this.cfg, hoje);
      return u.alertas.map((tipo: AlertTipo) => ({
        tipo,
        titulo: ROTULO_ALERTA[tipo],
        reclamacaoId: l.id,
        numero: l.numero,
        diasEmAberto: u.dias,
        custoTotal: arredondar(u.custo),
        setor: l.setorResp?.nome ?? null,
        produto: l.produto?.nome ?? null,
      }));
    });
    itens.sort(
      (a, b) => b.diasEmAberto - a.diasEmAberto || a.numero - b.numero,
    );
    const porTipo: Partial<Record<AlertTipo, number>> = {};
    for (const i of itens) porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1;
    return { itens, total: itens.length, porTipo };
  }
}
