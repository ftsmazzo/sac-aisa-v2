import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  type Devolucao,
  type Estado,
  ehEstado,
  MOTIVO_MAX,
  ROTULO_ESTADO,
  type Situacao,
  situacao,
  validarTransicao,
} from "@sac-aisa/domain";
import { type Escopo, filtroDeEscopo } from "./reclamacoes";
import { ErroEscrita } from "./reclamacoes-escrita";

export interface EntradaEstado {
  para: Estado;
  motivo?: string;
}

/** O corpo só leva o estado de destino e, quando a regra pede, o motivo. Autor e data vêm do servidor. */
export function lerEntradaEstado(
  corpo: unknown,
): { ok: true; entrada: EntradaEstado } | { ok: false; mensagem: string } {
  const erro = (mensagem: string) => ({ ok: false as const, mensagem });
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return erro("Corpo inválido.");
  }
  const c = corpo as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (k !== "para" && k !== "motivo")
      return erro(`Campo não aceito: "${k}".`);
  }
  if (!ehEstado(c.para)) return erro("Estado inválido.");
  const entrada: EntradaEstado = { para: c.para };
  if ("motivo" in c) {
    if (typeof c.motivo !== "string" || c.motivo.length > MOTIVO_MAX) {
      return erro('Valor inválido em "motivo".');
    }
    if (c.motivo.trim() !== "") entrada.motivo = c.motivo.trim();
  }
  return { ok: true, entrada };
}

export interface ReclamacaoParaEstado {
  id: string;
  numero: number;
  estado: Estado;
  devolucao: Devolucao;
  dataAbertura: string;
  dataAcao: string | null;
  setorRespId: string | null;
}

/**
 * A data de ação acompanha o estado: existe quando o setor devolveu a solução ou o SAC finalizou,
 * e some em qualquer outro estado (reabertura inclusive). Mantém a situação do domínio coerente.
 */
export function dataDeAcaoDoEstado(
  para: Estado,
  atual: { dataAcao: string | null; dataAbertura: string },
  hoje: string,
): string | null {
  if (para !== "resolvida_setor" && para !== "finalizada") return null;
  if (atual.dataAcao) return atual.dataAcao;
  return hoje < atual.dataAbertura ? atual.dataAbertura : hoje;
}

export interface AuditoriaEstado {
  usuarioId: string;
  usuarioNome: string;
  acao: "reclamacao.estado";
  alvo: string;
  detalhe: string;
  reclamacaoId: string;
  extra: { de: Estado; para: Estado; motivo?: string; reabertura: boolean };
}

export interface RepositorioJornada {
  obter(
    where: Prisma.ReclamacaoWhereInput,
  ): Promise<ReclamacaoParaEstado | null>;
  /**
   * Grava, numa transação: estado, data de ação, histórico, auditoria e a marca de que o
   * card do ClickUp precisa de novo status. Recusa se o estado atual já não for `de`.
   */
  gravar(args: {
    id: string;
    de: Estado;
    para: Estado;
    dataAcao: string | null;
    situacao: Situacao;
    motivo: string;
    reabertura: boolean;
    auditoria: AuditoriaEstado;
  }): Promise<void>;
}

function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

export class ServicoJornada {
  constructor(
    private readonly repo: RepositorioJornada,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Muda o estado pela matriz do domínio. Quem decide é o servidor, nunca a tela. */
  async mudar(id: string, entrada: EntradaEstado, usuario: UsuarioLogado) {
    const escopo: Escopo = {
      perfil: usuario.perfil,
      setores: usuario.setores,
      marcas: usuario.marcas,
    };
    const doEscopo = filtroDeEscopo(escopo);
    const where: Prisma.ReclamacaoWhereInput = doEscopo
      ? { AND: [{ id }, doEscopo] }
      : { id };
    // Fora do escopo é igual a não existir.
    const r = await this.repo.obter(where);
    if (!r) throw new ErroEscrita(404, "Reclamação não encontrada.");

    const v = validarTransicao({
      perfil: usuario.perfil,
      de: r.estado,
      para: entrada.para,
      motivo: entrada.motivo,
      devolucao: r.devolucao,
      temSetor: r.setorRespId !== null,
    });
    if (!v.ok) {
      throw new ErroEscrita(
        v.codigo === "sem_permissao" ? 403 : 400,
        v.mensagem,
      );
    }

    const dataAcao = dataDeAcaoDoEstado(
      entrada.para,
      r,
      hojeEmSaoPaulo(this.agora()),
    );
    const motivo = entrada.motivo ?? "";
    await this.repo.gravar({
      id: r.id,
      de: r.estado,
      para: entrada.para,
      dataAcao,
      situacao: situacao({ dataAcao, devolucao: r.devolucao }),
      motivo,
      reabertura: v.reabertura,
      auditoria: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "reclamacao.estado",
        alvo: `Reclamação #${r.numero}`,
        detalhe: `${v.reabertura ? "Reabertura: " : "Estado: "}${ROTULO_ESTADO[r.estado]} → ${ROTULO_ESTADO[entrada.para]}.`,
        reclamacaoId: r.id,
        extra: {
          de: r.estado,
          para: entrada.para,
          ...(motivo ? { motivo } : {}),
          reabertura: v.reabertura,
        },
      },
    });
    return {
      id: r.id,
      numero: r.numero,
      de: r.estado,
      estado: entrada.para,
      reabertura: v.reabertura,
    };
  }
}
