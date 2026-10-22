import type { Prisma, PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import type { RegraPergunta, TipoPergunta } from "@sac-aisa/domain";
import { filtroDeEscopo } from "../reclamacoes";
import type {
  EntradaPerfil,
  EntradaPergunta,
  RepositorioIaAdmin,
  VersaoPerfil,
} from "./admin";
import type {
  AceiteIa,
  AuditoriaIa,
  PerfilIa,
  PerguntaIa,
  RegistroGravado,
  RepositorioIa,
} from "./ia";

const num = (v: { toString(): string } | null | undefined) =>
  v == null ? 0 : Number(v.toString());

function regrasDe(v: unknown): RegraPergunta[] {
  if (!Array.isArray(v)) return [];
  const lista = (x: unknown) =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
  return v
    .filter((r) => typeof r === "object" && r !== null)
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        familias: lista(o.familias),
        causaIds: lista(o.causaIds),
        causaCategorias: lista(o.causaCategorias),
      };
    });
}

function exemplosDe(v: unknown): { situacao: string; resposta: string }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return typeof o.situacao === "string" && typeof o.resposta === "string"
      ? [{ situacao: o.situacao, resposta: o.resposta }]
      : [];
  });
}

function paraPergunta(p: {
  id: string;
  chave: string;
  categoria: string;
  texto: string;
  tipo: string;
  opcoes: string[];
  obrigatoria: boolean;
  exemplo: string;
  ordem: number;
  ativa: boolean;
  regras: unknown;
  padrao: boolean;
}): PerguntaIa {
  return {
    id: p.id,
    chave: p.chave,
    categoria: p.categoria,
    texto: p.texto,
    tipo: p.tipo as TipoPergunta,
    opcoes: p.opcoes,
    obrigatoria: p.obrigatoria,
    exemplo: p.exemplo,
    ordem: p.ordem,
    ativa: p.ativa,
    regras: regrasDe(p.regras),
    padrao: p.padrao,
  };
}

function paraPerfil(p: {
  versao: number;
  descricao: string;
  missao: string;
  valores: string;
  metas: string;
  tomDeVoz: string;
  dizer: string;
  evitar: string;
  assinatura: string;
  exemplos: unknown;
  padrao: boolean;
  nota: string;
  publicadaEm: Date;
  publicadaPorNome: string;
}): PerfilIa {
  return {
    versao: p.versao,
    descricao: p.descricao,
    missao: p.missao,
    valores: p.valores,
    metas: p.metas,
    tomDeVoz: p.tomDeVoz,
    dizer: p.dizer,
    evitar: p.evitar,
    assinatura: p.assinatura,
    exemplos: exemplosDe(p.exemplos),
    padrao: p.padrao,
    nota: p.nota,
    publicadaEm: p.publicadaEm.toISOString(),
    publicadaPorNome: p.publicadaPorNome,
  };
}

function paraRegistro(r: {
  id: string;
  reclamacaoId: string | null;
  tipo: string;
  etapa: string;
  sugestao: unknown;
  confianca: { toString(): string } | null;
  modelo: string;
  versaoPrompt: string;
  versaoPerfil: number | null;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: { toString(): string };
  latenciaMs: number;
  entradaRedigida: string;
  erro: string | null;
  usouRegras: boolean;
  usuarioId: string | null;
  aceite: string | null;
  causaEscolhidaId: string | null;
  textoFinal: string | null;
  criadoEm: Date;
}): RegistroGravado & { reclamacaoId: string } {
  return {
    id: r.id,
    reclamacaoId: r.reclamacaoId ?? "",
    tipo: r.tipo as RegistroGravado["tipo"],
    etapa: r.etapa,
    sugestao: r.sugestao,
    confianca: r.confianca == null ? null : num(r.confianca),
    modelo: r.modelo,
    versaoPrompt: r.versaoPrompt,
    versaoPerfil: r.versaoPerfil,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    custoUsd: num(r.custoUsd),
    latenciaMs: r.latenciaMs,
    entradaRedigida: r.entradaRedigida,
    erro: r.erro,
    usouRegras: r.usouRegras,
    usuarioId: r.usuarioId ?? "",
    aceite: (r.aceite as AceiteIa | null) ?? null,
    causaEscolhidaId: r.causaEscolhidaId,
    textoFinal: r.textoFinal,
    criadoEm: r.criadoEm.toISOString(),
  };
}

const auditar = (tx: Prisma.TransactionClient, a: AuditoriaIa) =>
  tx.auditoria.create({
    data: {
      usuarioId: a.usuarioId,
      usuarioNome: a.usuarioNome,
      acao: a.acao,
      alvo: a.alvo,
      detalhe: a.detalhe,
      reclamacaoId: a.reclamacaoId,
      extra: (a.extra ?? {}) as Prisma.InputJsonValue,
    },
  });

/** Consultas parametrizadas pelo Prisma. A auditoria entra na mesma transação do dado. */
export class RepositorioIaPrisma implements RepositorioIa, RepositorioIaAdmin {
  constructor(private readonly prisma: PrismaClient) {}

  async reclamacao(id: string, usuario: UsuarioLogado) {
    const escopo = filtroDeEscopo(usuario);
    const r = await this.prisma.reclamacao.findFirst({
      where: escopo ? { AND: [{ id }, escopo] } : { id },
      select: {
        id: true,
        numero: true,
        descricao: true,
        clienteNome: true,
        pedido: true,
        causaId: true,
        produto: { select: { codigo: true, nome: true, familia: true } },
        canal: { select: { nome: true } },
        marca: { select: { nome: true } },
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      numero: r.numero,
      descricao: r.descricao,
      produto: r.produto,
      canal: r.canal.nome,
      marca: r.marca?.nome ?? "",
      clienteNome: r.clienteNome,
      pedido: r.pedido,
      causaId: r.causaId,
    };
  }

  async causas() {
    const l = await this.prisma.causa.findMany({
      orderBy: [{ ordem: "asc" }, { id: "asc" }],
      include: { setor: true, regra: { include: { setor: true } } },
    });
    return l.map((c) => {
      const setor = c.regra?.setor ?? c.setor;
      return {
        id: c.id,
        nome: c.nome,
        categoria: c.categoria,
        setorId: setor.id,
        setorNome: setor.nome,
      };
    });
  }

  async perguntas() {
    const l = await this.prisma.perguntaObrigatoria.findMany({
      orderBy: [{ categoria: "asc" }, { ordem: "asc" }, { chave: "asc" }],
    });
    return l.map(paraPergunta);
  }

  async perfil() {
    const p = await this.prisma.perfilEmpresaVersao.findFirst({
      orderBy: { versao: "desc" },
    });
    return p ? paraPerfil(p) : null;
  }

  async versoes(): Promise<VersaoPerfil[]> {
    const l = await this.prisma.perfilEmpresaVersao.findMany({
      orderBy: { versao: "desc" },
      take: 30,
      select: {
        versao: true,
        publicadaEm: true,
        publicadaPorNome: true,
        padrao: true,
      },
    });
    return l.map((v) => ({ ...v, publicadaEm: v.publicadaEm.toISOString() }));
  }

  async respostas(reclamacaoId: string) {
    return this.prisma.reclamacaoResposta.findMany({
      where: { reclamacaoId },
      select: {
        chave: true,
        valor: true,
        dispensada: true,
        origem: true,
        textoPergunta: true,
      },
    });
  }

  /** Cada chamada ao modelo conta, com ou sem erro. A sugestão das regras não é chamada. */
  async consumo(desde: Date) {
    const r = await this.prisma.iaRegistro.aggregate({
      where: {
        criadoEm: { gte: desde },
        tipo: { in: ["triagem", "pergunta"] },
        etapa: { not: "triagem_regras" },
      },
      _count: { _all: true },
      _sum: { custoUsd: true },
    });
    return { chamadas: r._count._all, custoUsd: num(r._sum.custoUsd) };
  }

  async gravarRegistro(r: Parameters<RepositorioIa["gravarRegistro"]>[0]) {
    const c = await this.prisma.iaRegistro.create({
      data: {
        reclamacaoId: r.reclamacaoId,
        tipo: r.tipo,
        etapa: r.etapa,
        sugestao: r.sugestao as Prisma.InputJsonValue,
        confianca: r.confianca,
        modelo: r.modelo,
        versaoPrompt: r.versaoPrompt,
        versaoPerfil: r.versaoPerfil,
        tokensEntrada: r.tokensEntrada,
        tokensSaida: r.tokensSaida,
        custoUsd: r.custoUsd,
        latenciaMs: r.latenciaMs,
        entradaRedigida: r.entradaRedigida,
        erro: r.erro,
        usouRegras: r.usouRegras,
        usuarioId: r.usuarioId,
      },
      select: { id: true },
    });
    return c.id;
  }

  async registro(id: string) {
    const r = await this.prisma.iaRegistro.findUnique({ where: { id } });
    return r ? paraRegistro(r) : null;
  }

  async ultimos(reclamacaoId: string) {
    const l = await this.prisma.iaRegistro.findMany({
      where: { reclamacaoId, tipo: { in: ["triagem", "pergunta"] } },
      orderBy: { criadoEm: "desc" },
      take: 20,
    });
    return l.map(paraRegistro);
  }

  async aceitar(
    id: string,
    d: Parameters<RepositorioIa["aceitar"]>[1],
    auditoria: AuditoriaIa,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.iaRegistro.update({
        where: { id },
        data: {
          aceite: d.aceite,
          causaEscolhidaId: d.causaEscolhidaId,
          textoFinal: d.textoFinal,
          aceitoEm: d.quando,
        },
      });
      if (d.origemCampo) {
        const reg = await tx.iaRegistro.findUnique({
          where: { id },
          select: { reclamacaoId: true },
        });
        if (reg?.reclamacaoId) {
          const dados = {
            origem: d.origemCampo.origem,
            aceite: d.origemCampo.aceite,
            quando: d.quando,
            usuarioId: auditoria.usuarioId,
          };
          await tx.reclamacaoCampoOrigem.upsert({
            where: {
              reclamacaoId_campo: {
                reclamacaoId: reg.reclamacaoId,
                campo: d.origemCampo.campo,
              },
            },
            create: {
              reclamacaoId: reg.reclamacaoId,
              campo: d.origemCampo.campo,
              ...dados,
            },
            update: dados,
          });
        }
      }
      await auditar(tx, auditoria);
    });
  }

  async gravarResposta(
    r: Parameters<RepositorioIa["gravarResposta"]>[0],
    auditoria: AuditoriaIa,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const dados = {
        perguntaId: r.perguntaId,
        textoPergunta: r.textoPergunta,
        valor: r.valor,
        origem: r.origem,
        dispensada: r.dispensada,
        motivo: r.motivo,
        registradaPorId: r.usuarioId,
        registradaPorNome: r.usuarioNome,
        registradaEm: new Date(),
      };
      await tx.reclamacaoResposta.upsert({
        where: {
          reclamacaoId_chave: { reclamacaoId: r.reclamacaoId, chave: r.chave },
        },
        create: { reclamacaoId: r.reclamacaoId, chave: r.chave, ...dados },
        update: dados,
      });
      await auditar(tx, auditoria);
    });
  }

  async qualidade() {
    const [grupos, reclamacoes, importadas, historico] = await Promise.all([
      this.prisma.reclamacaoCampoOrigem.groupBy({
        by: ["campo", "origem", "aceite"],
        _count: { _all: true },
      }),
      this.prisma.reclamacao.count({ where: { rascunho: false } }),
      this.prisma.reclamacao.count({ where: { origemRegistro: "importado" } }),
      this.prisma.estadoHistorico.findMany({
        where: { de: "triagem" },
        orderBy: { quando: "asc" },
        take: 2000,
        select: {
          reclamacaoId: true,
          quando: true,
          reclamacao: { select: { criadoEm: true } },
        },
      }),
    ]);
    const primeira = new Map<string, number>();
    for (const h of historico) {
      if (primeira.has(h.reclamacaoId)) continue;
      const min =
        (h.quando.getTime() - h.reclamacao.criadoEm.getTime()) / 60000;
      if (min >= 0) primeira.set(h.reclamacaoId, min);
    }
    return {
      grupos: grupos.map((g) => ({
        campo: g.campo,
        origem: g.origem,
        aceite: g.aceite,
        n: g._count._all,
      })),
      reclamacoes,
      importadas,
      minutosEmTriagem: [...primeira.values()],
    };
  }

  // ---------- Administração ----------

  async publicarPerfil(
    e: EntradaPerfil,
    quem: { id: string; nome: string },
    auditoria: (versao: number) => AuditoriaIa,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ultima = await tx.perfilEmpresaVersao.aggregate({
        _max: { versao: true },
      });
      const versao = (ultima._max.versao ?? 0) + 1;
      await tx.perfilEmpresaVersao.create({
        data: {
          versao,
          descricao: e.descricao,
          missao: e.missao,
          valores: e.valores,
          metas: e.metas,
          tomDeVoz: e.tomDeVoz,
          dizer: e.dizer,
          evitar: e.evitar,
          assinatura: e.assinatura,
          exemplos: e.exemplos as Prisma.InputJsonValue,
          padrao: false,
          nota: e.nota,
          publicadaPorId: quem.id,
          publicadaPorNome: quem.nome,
        },
      });
      await auditar(tx, auditoria(versao));
      return versao;
    });
  }

  async salvarPergunta(
    e: EntradaPergunta,
    auditoria: (criada: boolean) => AuditoriaIa,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const atual = await tx.perguntaObrigatoria.findUnique({
        where: { chave: e.chave },
        select: { id: true },
      });
      const dados = {
        categoria: e.categoria,
        texto: e.texto,
        tipo: e.tipo as TipoPergunta,
        opcoes: e.opcoes,
        obrigatoria: e.obrigatoria,
        exemplo: e.exemplo,
        ordem: e.ordem,
        ativa: e.ativa,
        regras: e.regras as Prisma.InputJsonValue,
        // Editada: deixa de ser o exemplo de teste semeado.
        padrao: false,
      };
      if (atual) {
        await tx.perguntaObrigatoria.update({
          where: { id: atual.id },
          data: dados,
        });
      } else {
        await tx.perguntaObrigatoria.create({
          data: { chave: e.chave, ...dados },
        });
      }
      await auditar(tx, auditoria(!atual));
      return { criada: !atual };
    });
  }
}
