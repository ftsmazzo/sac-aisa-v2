import type { Prisma, PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  ALERT_CONFIG_PADRAO,
  type AlertConfig,
  type AlertTipo,
  chaveDoAlerta,
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

export interface AlertaGravado {
  chaveDedupe: string;
  tipo: AlertTipo;
  titulo: string;
  mensagem: string;
  reclamacaoId: string;
  setor: string | null;
}

/** Grava o que a regra acabou de calcular e fecha o que ela já não confirma. */
export interface GravadorAlertas {
  sincronizar(args: {
    atuais: AlertaGravado[];
    vistas: string[];
    agora: Date;
  }): Promise<void>;
}

export class GravadorAlertasPrisma implements GravadorAlertas {
  constructor(private readonly prisma: PrismaClient) {}

  async sincronizar(args: {
    atuais: AlertaGravado[];
    vistas: string[];
    agora: Date;
  }) {
    for (const a of args.atuais) {
      await this.prisma.alerta.upsert({
        where: { chaveDedupe: a.chaveDedupe },
        create: {
          tipo: a.tipo,
          titulo: a.titulo,
          mensagem: a.mensagem,
          reclamacaoId: a.reclamacaoId,
          setor: a.setor ?? "",
          chaveDedupe: a.chaveDedupe,
          status: "aberto",
        },
        update: {
          status: "aberto",
          resolvidoEm: null,
          titulo: a.titulo,
          mensagem: a.mensagem,
          setor: a.setor ?? "",
        },
      });
    }
    const chaves = args.atuais.map((a) => a.chaveDedupe);
    await this.prisma.alerta.updateMany({
      where: {
        status: "aberto",
        reclamacaoId: { in: args.vistas },
        ...(chaves.length > 0 ? { chaveDedupe: { notIn: chaves } } : {}),
      },
      data: { status: "resolvido", resolvidoEm: args.agora },
    });
  }
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
    private readonly cfg: AlertConfig | undefined = ALERT_CONFIG_PADRAO,
    private readonly gravador?: GravadorAlertas,
  ) {}

  private config(): AlertConfig {
    return this.cfg ?? ALERT_CONFIG_PADRAO;
  }

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
        u: urgenciaDe(paraDominio(l), this.config(), hoje, agora),
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
      const u = urgenciaDe(paraDominio(l), this.config(), hoje, agora);
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
    if (this.gravador) {
      await this.gravador.sincronizar({
        atuais: itens.map((i) => ({
          chaveDedupe: chaveDoAlerta(i.reclamacaoId, i.tipo),
          tipo: i.tipo,
          titulo: i.titulo,
          mensagem: `Reclamação #${i.numero}`,
          reclamacaoId: i.reclamacaoId,
          setor: i.setor,
        })),
        vistas: linhas.map((l) => l.id),
        agora,
      });
    }
    const porTipo: Partial<Record<AlertTipo, number>> = {};
    for (const i of itens) porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1;
    return { itens, total: itens.length, porTipo };
  }
}
