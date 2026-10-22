import type { Prisma } from "@prisma/client";
import type { Devolucao } from "@sac-aisa/domain";
import { type Escopo, filtroPorId } from "./reclamacoes";

/**
 * Linha do tempo da reclamação: entrada, triagem, encaminhamento ao setor, análise, produto
 * recebido e resolução. Sai da auditoria que já existe (quem fez o quê e quando) e do estado
 * atual, para as reclamações importadas que não têm auditoria.
 */

export type TipoEvento =
  | "entrada"
  | "triagem"
  | "encaminhamento"
  | "causa"
  | "analise"
  | "recebimento"
  | "solucao"
  | "resolucao";

export interface EventoLinha {
  id: string;
  tipo: TipoEvento;
  /** Quando aconteceu no sistema (ISO). Ordena a linha. */
  quando: string;
  /** Data do fato, quando difere do registro (abertura, recebimento, ação). */
  data: string | null;
  titulo: string;
  detalhe: string;
  autor: string | null;
}

export type EstadoEtapa = "feita" | "atual" | "pendente" | "dispensada";

export interface Etapa {
  chave:
    | "entrada"
    | "triagem"
    | "encaminhamento"
    | "analise"
    | "produto"
    | "resolucao";
  rotulo: string;
  estado: EstadoEtapa;
}

export interface LinhaDoTempo {
  eventos: EventoLinha[];
  etapas: Etapa[];
  proximo: string | null;
}

interface MudancaLida {
  campo: string;
  de?: unknown;
  para?: unknown;
  alterado?: true;
}

export interface AuditoriaDaLinha {
  id: string;
  quando: Date;
  usuarioNome: string;
  acao: string;
  extra: unknown;
}

export interface DadosDaLinha {
  id: string;
  dataAbertura: string;
  canalNome: string;
  devolucao: Devolucao;
  dataRecebimento: string | null;
  dataAcao: string | null;
  setorRespId: string | null;
  setorRespNome: string | null;
  analiseDoSetor: boolean;
  auditorias: AuditoriaDaLinha[];
  /** Nomes por id, para escrever "de A para B" sem expor id. */
  setores: Record<string, string>;
  causas: Record<string, string>;
}

/** Campos que a triagem preenche. Mudança neles vira "triagem ajustada". */
const ROTULO_TRIAGEM: Record<string, string> = {
  canalId: "canal",
  marcaId: "marca",
  produtoId: "produto",
  bancadaId: "bancada",
  dataAbertura: "data de abertura",
  protocoloExterno: "protocolo",
  pedido: "pedido",
  descricao: "descrição",
  observacao: "observação",
  clienteNome: "cliente",
  cidade: "cidade",
  uf: "UF",
  transportadora: "transportadora",
};

function lerExtra(extra: unknown): { mudancas: MudancaLida[]; motivo: string } {
  const e = (extra ?? {}) as { mudancas?: unknown; motivo?: unknown };
  const lista = Array.isArray(e.mudancas) ? e.mudancas : [];
  return {
    mudancas: lista.filter(
      (m): m is MudancaLida =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as MudancaLida).campo === "string",
    ),
    motivo: typeof e.motivo === "string" ? e.motivo : "",
  };
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const meioDia = (dia: string) => new Date(`${dia}T12:00:00.000Z`).toISOString();

function nomeDe(mapa: Record<string, string>, id: unknown): string | null {
  return typeof id === "string" ? (mapa[id] ?? null) : null;
}

export function montarLinhaDoTempo(d: DadosDaLinha): LinhaDoTempo {
  const eventos: EventoLinha[] = [
    {
      id: "entrada",
      tipo: "entrada",
      // A abertura é uma data; o início do dia mantém a entrada antes de tudo no mesmo dia.
      quando: new Date(`${d.dataAbertura}T00:00:00.000Z`).toISOString(),
      data: d.dataAbertura,
      titulo: "Reclamação recebida",
      detalhe: `Canal: ${d.canalNome}.`,
      autor: null,
    },
  ];

  let viuRecebimento = false;
  let viuResolucao = false;

  const auditorias = [...d.auditorias].sort(
    (a, b) => a.quando.getTime() - b.quando.getTime(),
  );
  for (const a of auditorias) {
    const { mudancas, motivo } = lerExtra(a.extra);
    const por = (campo: string) => mudancas.find((m) => m.campo === campo);
    const base = {
      quando: a.quando.toISOString(),
      autor: a.usuarioNome,
      data: null,
    };
    const add = (
      tipo: TipoEvento,
      titulo: string,
      detalhe = "",
      data: string | null = null,
    ) =>
      eventos.push({
        ...base,
        id: `${a.id}:${tipo}`,
        tipo,
        titulo,
        detalhe,
        data,
      });

    const cadastro = a.acao === "reclamacao.criar";
    const edicao = a.acao === "reclamacao.editar";
    const analise = a.acao === "analise.criar" || a.acao === "analise.editar";
    if (!cadastro && !edicao && !analise) continue;

    if (cadastro) {
      add(
        "triagem",
        "Triagem registrada",
        "Dados do consumidor e do caso coletados.",
      );
    } else if (edicao) {
      const campos = mudancas
        .map((m) => ROTULO_TRIAGEM[m.campo])
        .filter((r): r is string => !!r);
      if (campos.length > 0) {
        add("triagem", "Triagem ajustada", `Campos: ${campos.join(", ")}.`);
      }
    } else {
      const volta = por("produtoPrecisaVoltar");
      add(
        "analise",
        a.acao === "analise.criar"
          ? "Análise do setor registrada"
          : "Análise do setor atualizada",
        volta?.para === true
          ? "O produto precisa voltar."
          : volta?.para === false
            ? "O produto não precisa voltar."
            : "",
      );
    }

    const setor = por("setorRespId");
    if (setor && !analise) {
      const para = nomeDe(d.setores, setor.para) ?? "sem setor";
      const de = nomeDe(d.setores, setor.de);
      const manual = por("setorRespManual");
      const causa = nomeDe(d.causas, por("causaId")?.para);
      const sugestao = causa
        ? `Sugerido pela causa: ${causa}.`
        : "Sugerido pela regra.";
      if (manual?.para === true) {
        add(
          "encaminhamento",
          de
            ? `Setor trocado: ${de} → ${para}`
            : `Encaminhada ao setor ${para} à mão`,
          motivo ? `Motivo: ${motivo}` : "",
        );
      } else if (manual?.para === false && manual.de === true) {
        add("encaminhamento", `Setor voltou ao automático: ${para}`);
      } else if (!de) {
        add("encaminhamento", `Encaminhada ao setor ${para}`, sugestao);
      } else {
        add("encaminhamento", `Reencaminhada: ${de} → ${para}`, sugestao);
      }
    }

    // Causa final: só quando uma pessoa a definiu (a automática já vai no encaminhamento).
    const causaFinal = por("causaId");
    if (causaFinal && por("causaManual")?.para === true) {
      add(
        "causa",
        "Causa final definida",
        nomeDe(d.causas, causaFinal.para) ?? "",
      );
    }

    const partes = [
      por("laudo") && "laudo",
      por("solucao") && "solução",
    ].filter((p): p is string => typeof p === "string");
    if (partes.length > 0) {
      const texto = partes.join(" e ");
      add(
        "solucao",
        `${texto[0].toUpperCase()}${texto.slice(1)} registrado pelo setor`,
      );
    }

    const rec = por("dataRecebimento") ?? por("reclamacao.dataRecebimento");
    if (rec && typeof rec.para === "string") {
      viuRecebimento = true;
      add(
        "recebimento",
        "Produto recebido",
        `Recebido em ${dataBr(rec.para)}.`,
        rec.para,
      );
    }
    const acao = por("dataAcao");
    if (acao && typeof acao.para === "string") {
      viuResolucao = true;
      add(
        "resolucao",
        "Reclamação resolvida",
        `Ação em ${dataBr(acao.para)}.`,
        acao.para,
      );
    }
  }

  // Sem auditoria (importada do sistema antigo), o estado atual ainda conta a história.
  if (!viuRecebimento && d.dataRecebimento) {
    eventos.push({
      id: "recebimento",
      tipo: "recebimento",
      quando: meioDia(d.dataRecebimento),
      data: d.dataRecebimento,
      titulo: "Produto recebido",
      detalhe: `Recebido em ${dataBr(d.dataRecebimento)}.`,
      autor: null,
    });
  }
  if (!viuResolucao && d.dataAcao) {
    eventos.push({
      id: "resolucao",
      tipo: "resolucao",
      quando: meioDia(d.dataAcao),
      data: d.dataAcao,
      titulo: "Reclamação resolvida",
      detalhe: `Ação em ${dataBr(d.dataAcao)}.`,
      autor: null,
    });
  }

  // Estável: no mesmo instante vale a ordem em que foram montados.
  eventos.sort((a, b) => a.quando.localeCompare(b.quando));
  return { eventos, ...etapasEProximo(d) };
}

/** Onde a reclamação está agora e o que falta, só pelo estado atual. */
export function etapasEProximo(
  d: Pick<
    DadosDaLinha,
    | "devolucao"
    | "dataAcao"
    | "setorRespId"
    | "setorRespNome"
    | "analiseDoSetor"
  >,
): Pick<LinhaDoTempo, "etapas" | "proximo"> {
  const resolvida = d.dataAcao !== null;
  const temSetor = d.setorRespId !== null;
  const setor = d.setorRespNome ?? "responsável";

  let atual: Etapa["chave"] | null = null;
  let proximo: string | null = null;
  if (!resolvida) {
    if (!temSetor) {
      atual = "encaminhamento";
      proximo =
        "Definir o setor responsável: escolha a causa ou troque o setor.";
    } else if (!d.analiseDoSetor) {
      atual = "analise";
      proximo = `Aguardando a análise do setor ${setor}.`;
    } else if (d.devolucao === "AGUARDANDO") {
      atual = "produto";
      proximo = `Aguardando o produto chegar ao setor ${setor}.`;
    } else {
      atual = "resolucao";
      proximo = `O setor ${setor} registra a solução e a data de ação para resolver.`;
    }
  }

  const produto: EstadoEtapa =
    d.devolucao === "RECEBIDO"
      ? "feita"
      : d.devolucao === "AGUARDANDO"
        ? "pendente"
        : d.analiseDoSetor || resolvida
          ? "dispensada"
          : "pendente";
  const da = (feita: boolean): EstadoEtapa => (feita ? "feita" : "pendente");
  const estado = (chave: Etapa["chave"], base: EstadoEtapa): EstadoEtapa =>
    atual === chave ? "atual" : base;

  return {
    etapas: [
      { chave: "entrada", rotulo: "Entrada", estado: "feita" },
      { chave: "triagem", rotulo: "Triagem", estado: "feita" },
      {
        chave: "encaminhamento",
        rotulo: "Encaminhamento",
        estado: estado("encaminhamento", da(temSetor)),
      },
      {
        chave: "analise",
        rotulo: "Análise do setor",
        estado: estado("analise", da(d.analiseDoSetor)),
      },
      {
        chave: "produto",
        rotulo: "Produto",
        estado: estado("produto", produto),
      },
      {
        chave: "resolucao",
        rotulo: "Resolução",
        estado: estado("resolucao", da(resolvida)),
      },
    ],
    proximo,
  };
}

// ---------- Serviço ----------

export interface RepositorioLinha {
  obter(where: Prisma.ReclamacaoWhereInput): Promise<DadosDaLinha | null>;
}

export class ServicoLinhaDoTempo {
  constructor(private readonly repo: RepositorioLinha) {}

  /** Fora do escopo é igual a não existir, como na ficha. */
  async obter(id: string, escopo: Escopo): Promise<LinhaDoTempo | null> {
    const where = filtroPorId(id, escopo);
    const dados = await this.repo.obter(where);
    return dados ? montarLinhaDoTempo(dados) : null;
  }
}
