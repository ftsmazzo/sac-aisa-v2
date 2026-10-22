import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  ALERT_CONFIG_PADRAO,
  type AlertConfig,
  type AlertTipo,
  compararUrgencia,
  ESTADOS_NA_FILA_DO_SETOR,
  type Estado,
  type ReclamacaoLike,
  ROTULO_ALERTA,
  temPermissao,
  transicoesPermitidas,
  urgenciaDe,
} from "@sac-aisa/domain";
import { type Escopo, filtroDeEscopo, filtroDeTreino } from "./reclamacoes";
import { ErroEscrita } from "./reclamacoes-escrita";

/** Reclamação em aberto, com só o que as regras de alerta e a fila precisam. */
export interface LinhaAberta {
  id: string;
  numero: number;
  dataAbertura: string;
  dataAcao: string | null;
  estado: Estado;
  /** Desde quando está nesse estado (ISO 8601). */
  estadoDesde: string;
  prazoMarketplace: string | null;
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
    dataAcao: l.dataAcao,
    estado: l.estado,
    estadoDesde: l.estadoDesde,
    prazoMarketplace: l.prazoMarketplace,
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

/** Marca opcional da fila e dos alertas: vai como valor parametrizado do Prisma. */
function filtroDeMarca(marcaId?: string): Prisma.ReclamacaoWhereInput[] {
  return marcaId ? [{ marcaId }] : [];
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
    const escopo: Escopo = {
      perfil: usuario.perfil,
      setores: usuario.setores,
      marcas: usuario.marcas,
      treino: usuario.modoTreino,
    };
    // Em aberto = ainda não finalizada pelo SAC (a solução devolvida sem finalização conta).
    const e: Prisma.ReclamacaoWhereInput[] = [
      { estado: { not: "finalizada" } },
      ...extra,
    ];
    e.push(filtroDeTreino(escopo));
    const doEscopo = filtroDeEscopo(escopo);
    if (doEscopo) e.push(doEscopo);
    return this.repo.abertas({ AND: e });
  }

  /**
   * A fila do setor: o que está com ele (encaminhada, recebida ou em tratativa), do setor
   * responsável. Mais urgentes primeiro. "Assumir" (receber) vale para quem está no setor.
   */
  async fila(usuario: UsuarioLogado, marcaId?: string) {
    exigir(usuario, "reclamacoes.analisar");
    const agora = this.agora();
    const hoje = hojeEmSaoPaulo(agora);
    const linhas = await this.abertas(usuario, [
      { setorRespId: { not: null } },
      { estado: { in: [...ESTADOS_NA_FILA_DO_SETOR] } },
      ...filtroDeMarca(marcaId),
    ]);
    const itens = linhas
      .filter((l) => l.setorResp)
      .map((l) => ({
        l,
        u: urgenciaDe(paraDominio(l), this.cfg, hoje, agora),
      }))
      .sort((a, b) => compararUrgencia(a.u, b.u) || a.l.numero - b.l.numero)
      .map(({ l, u }) => ({
        id: l.id,
        numero: l.numero,
        dataAbertura: l.dataAbertura,
        estado: l.estado,
        estadoDesde: l.estadoDesde,
        podeAssumir:
          l.estado === "encaminhada" &&
          transicoesPermitidas(usuario.perfil, l.estado).some(
            (o) => o.para === "recebida",
          ),
        analisada: l.setorResp
          ? l.setoresComAnalise.includes(l.setorResp.id)
          : false,
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
  async alertas(usuario: UsuarioLogado, marcaId?: string) {
    exigir(usuario, "alertas.ver");
    const agora = this.agora();
    const hoje = hojeEmSaoPaulo(agora);
    const linhas = await this.abertas(usuario, filtroDeMarca(marcaId));
    const itens = linhas.flatMap((l) => {
      const u = urgenciaDe(paraDominio(l), this.cfg, hoje, agora);
      return u.alertas.map((tipo: AlertTipo) => ({
        tipo,
        titulo: ROTULO_ALERTA[tipo],
        reclamacaoId: l.id,
        numero: l.numero,
        estado: l.estado,
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
