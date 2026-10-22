import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  type Devolucao,
  type Situacao,
  situacao,
  temPermissao,
} from "@sac-aisa/domain";
import { type Escopo, filtroDeEscopo } from "./reclamacoes";
import { dataValida, ErroEscrita } from "./reclamacoes-escrita";

const LONGO_MAX = 5000;
const CAMPOS = [
  "produtoPrecisaVoltar",
  "produtoRecebidoEm",
  "conclusao",
  "resultado",
] as const;

/** O que o cliente pode mandar. Setor, autor e data de registro nunca vêm dele. */
export interface EntradaAnalise {
  produtoPrecisaVoltar?: boolean;
  produtoRecebidoEm?: string | null;
  conclusao?: string;
  resultado?: string;
}

export function lerAnalise(
  corpo: unknown,
  modo: "criar" | "editar",
): { ok: true; entrada: EntradaAnalise } | { ok: false; mensagem: string } {
  const erro = (mensagem: string) => ({ ok: false as const, mensagem });
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return erro("Corpo inválido.");
  }
  const c = corpo as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (!(CAMPOS as readonly string[]).includes(k)) {
      return erro(`Campo não aceito: "${k}".`);
    }
  }
  const e: EntradaAnalise = {};
  if ("produtoPrecisaVoltar" in c) {
    if (typeof c.produtoPrecisaVoltar !== "boolean") {
      return erro("Informe se o produto precisa voltar.");
    }
    e.produtoPrecisaVoltar = c.produtoPrecisaVoltar;
  }
  if ("produtoRecebidoEm" in c) {
    const v = c.produtoRecebidoEm;
    if (v === null || v === "") e.produtoRecebidoEm = null;
    else if (typeof v !== "string" || !dataValida(v)) {
      return erro('Data inválida em "produtoRecebidoEm".');
    } else e.produtoRecebidoEm = v;
  }
  for (const campo of ["conclusao", "resultado"] as const) {
    if (!(campo in c)) continue;
    const v = c[campo];
    if (typeof v !== "string" || v.length > LONGO_MAX) {
      return erro(`Valor inválido em "${campo}".`);
    }
    e[campo] = v.trim();
  }
  if (modo === "criar" && e.produtoPrecisaVoltar === undefined) {
    return erro("Informe se o produto precisa voltar.");
  }
  if (modo === "editar" && Object.keys(e).length === 0) {
    return erro("Nenhuma alteração enviada.");
  }
  return { ok: true, entrada: e };
}

export interface DadosAnalise {
  produtoPrecisaVoltar: boolean;
  produtoRecebidoEm: string | null;
  conclusao: string;
  resultado: string;
}

export interface AnaliseAtual extends DadosAnalise {
  id: string;
  setorId: string;
}

export interface ReclamacaoParaAnalise {
  id: string;
  numero: number;
  setorRespId: string | null;
  devolucao: Devolucao;
  dataAbertura: string;
  dataAcao: string | null;
  dataRecebimento: string | null;
  analises: AnaliseAtual[];
}

export interface MudancaAnalise {
  campo: string;
  de?: unknown;
  para?: unknown;
  /** Texto livre não vai para a auditoria: só se registra que mudou. */
  alterado?: true;
}

export interface AuditoriaAnalise {
  usuarioId: string;
  usuarioNome: string;
  acao: "analise.criar" | "analise.editar";
  alvo: string;
  detalhe: string;
  reclamacaoId: string;
  extra: { mudancas: MudancaAnalise[] };
}

export interface RepositorioAnalise {
  obterReclamacao(
    where: Prisma.ReclamacaoWhereInput,
  ): Promise<ReclamacaoParaAnalise | null>;
  /** Grava análise, ajuste da devolução e auditoria na mesma transação. */
  salvar(args: {
    reclamacaoId: string;
    analiseId: string | null;
    setorId: string;
    dados: DadosAnalise;
    reclamacao: {
      devolucao: Devolucao;
      dataRecebimento: string | null;
      situacao: Situacao;
    } | null;
    usuarioId: string;
    auditar: (analiseId: string) => AuditoriaAnalise;
  }): Promise<{ id: string }>;
}

function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

/**
 * A decisão de retorno do produto comanda a devolução da reclamação:
 * precisa voltar e não chegou = aguardando; chegou = recebido; não volta = sem devolução.
 */
function devolucaoDaAnalise(
  d: DadosAnalise,
  atual: ReclamacaoParaAnalise,
): { devolucao: Devolucao; dataRecebimento: string | null } {
  if (!d.produtoPrecisaVoltar) {
    if (atual.devolucao === "RECEBIDO") {
      throw new ErroEscrita(
        400,
        "O produto já foi recebido; a análise não pode dizer que ele não volta.",
      );
    }
    return { devolucao: "NA", dataRecebimento: null };
  }
  if (d.produtoRecebidoEm) {
    return { devolucao: "RECEBIDO", dataRecebimento: d.produtoRecebidoEm };
  }
  return { devolucao: "AGUARDANDO", dataRecebimento: null };
}

export class ServicoAnalise {
  constructor(
    private readonly repo: RepositorioAnalise,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  private async carregar(id: string, usuario: UsuarioLogado) {
    if (!temPermissao(usuario.permissoes, "reclamacoes.analisar")) {
      throw new ErroEscrita(403, "Sem permissão para esta ação.");
    }
    const escopo: Escopo = { perfil: usuario.perfil, setores: usuario.setores };
    const doEscopo = filtroDeEscopo(escopo);
    const where: Prisma.ReclamacaoWhereInput = doEscopo
      ? { AND: [{ id }, doEscopo] }
      : { id };
    // Fora do escopo é igual a não existir.
    const r = await this.repo.obterReclamacao(where);
    if (!r) throw new ErroEscrita(404, "Reclamação não encontrada.");
    if (r.dataAcao) {
      throw new ErroEscrita(400, "A reclamação já foi resolvida.");
    }
    // O setor vem da reclamação, nunca do cliente.
    if (!r.setorRespId) {
      throw new ErroEscrita(
        400,
        "A reclamação ainda não tem setor responsável.",
      );
    }
    return { r, setorId: r.setorRespId };
  }

  private async gravar(
    r: ReclamacaoParaAnalise,
    setorId: string,
    base: AnaliseAtual | null,
    entrada: EntradaAnalise,
    usuario: UsuarioLogado,
  ) {
    const dados: DadosAnalise = {
      produtoPrecisaVoltar:
        entrada.produtoPrecisaVoltar ?? base?.produtoPrecisaVoltar ?? false,
      produtoRecebidoEm:
        entrada.produtoRecebidoEm !== undefined
          ? entrada.produtoRecebidoEm
          : (base?.produtoRecebidoEm ?? r.dataRecebimento),
      conclusao: entrada.conclusao ?? base?.conclusao ?? "",
      resultado: entrada.resultado ?? base?.resultado ?? "",
    };
    if (!dados.produtoPrecisaVoltar) {
      if (entrada.produtoRecebidoEm) {
        throw new ErroEscrita(
          400,
          "Há data de recebimento, mas o produto não precisa voltar.",
        );
      }
      dados.produtoRecebidoEm = null;
    }
    if (dados.produtoRecebidoEm) {
      if (dados.produtoRecebidoEm < r.dataAbertura) {
        throw new ErroEscrita(400, "O recebimento vem antes da abertura.");
      }
      if (dados.produtoRecebidoEm > hojeEmSaoPaulo(this.agora())) {
        throw new ErroEscrita(400, "A data de recebimento está no futuro.");
      }
    }

    const novaDev = devolucaoDaAnalise(dados, r);
    const mudouDev =
      novaDev.devolucao !== r.devolucao ||
      novaDev.dataRecebimento !== r.dataRecebimento;

    const mudancas: MudancaAnalise[] = [];
    const antes = base ?? {
      produtoPrecisaVoltar: null,
      produtoRecebidoEm: null,
      conclusao: "",
      resultado: "",
    };
    if (antes.produtoPrecisaVoltar !== dados.produtoPrecisaVoltar) {
      mudancas.push({
        campo: "produtoPrecisaVoltar",
        de: antes.produtoPrecisaVoltar,
        para: dados.produtoPrecisaVoltar,
      });
    }
    if (antes.produtoRecebidoEm !== dados.produtoRecebidoEm) {
      mudancas.push({
        campo: "produtoRecebidoEm",
        de: antes.produtoRecebidoEm,
        para: dados.produtoRecebidoEm,
      });
    }
    for (const t of ["conclusao", "resultado"] as const) {
      if (antes[t] !== dados[t]) mudancas.push({ campo: t, alterado: true });
    }
    if (novaDev.devolucao !== r.devolucao) {
      mudancas.push({
        campo: "reclamacao.devolucao",
        de: r.devolucao,
        para: novaDev.devolucao,
      });
    }
    if (novaDev.dataRecebimento !== r.dataRecebimento) {
      mudancas.push({
        campo: "reclamacao.dataRecebimento",
        de: r.dataRecebimento,
        para: novaDev.dataRecebimento,
      });
    }
    if (base && mudancas.length === 0)
      return {
        id: base.id,
        alterou: false,
        criando: false,
        devolucaoRecebida: false,
      };

    const criando = base === null;
    const { id } = await this.repo.salvar({
      reclamacaoId: r.id,
      analiseId: base?.id ?? null,
      setorId,
      dados,
      reclamacao: mudouDev
        ? {
            ...novaDev,
            situacao: situacao({
              dataAcao: null,
              devolucao: novaDev.devolucao,
            }),
          }
        : null,
      usuarioId: usuario.id,
      auditar: () => ({
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: criando ? "analise.criar" : "analise.editar",
        alvo: `Reclamação #${r.numero}`,
        detalhe: criando
          ? "Análise do setor registrada."
          : `Análise alterada: ${mudancas.map((m) => m.campo).join(", ")}.`,
        reclamacaoId: r.id,
        extra: { mudancas },
      }),
    });
    return {
      id,
      alterou: true,
      criando,
      devolucaoRecebida:
        novaDev.devolucao === "RECEBIDO" && r.devolucao !== "RECEBIDO",
    };
  }

  async criar(
    reclamacaoId: string,
    entrada: EntradaAnalise,
    usuario: UsuarioLogado,
  ) {
    const { r, setorId } = await this.carregar(reclamacaoId, usuario);
    if (r.analises.some((a) => a.setorId === setorId)) {
      throw new ErroEscrita(
        400,
        "O setor já registrou a análise; edite a existente.",
      );
    }
    return this.gravar(r, setorId, null, entrada, usuario);
  }

  async editar(
    reclamacaoId: string,
    analiseId: string,
    entrada: EntradaAnalise,
    usuario: UsuarioLogado,
  ) {
    const { r, setorId } = await this.carregar(reclamacaoId, usuario);
    // Só a análise do setor atual é editável; a de outro setor (histórico) fica como está.
    const base = r.analises.find(
      (a) => a.id === analiseId && a.setorId === setorId,
    );
    if (!base) throw new ErroEscrita(404, "Análise não encontrada.");
    return this.gravar(r, setorId, base, entrada, usuario);
  }
}
