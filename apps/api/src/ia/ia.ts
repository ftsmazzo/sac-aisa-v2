import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  CAUSA_POR_ID,
  classificar,
  type PerguntaDef,
  perguntasAplicaveis,
  perguntasFaltantes,
  type TipoPergunta,
  temPermissao,
} from "@sac-aisa/domain";
import type { z } from "zod";
import { esquemaPergunta, esquemaTriagem, lerJson } from "./esquemas";
import {
  type PerfilPrompt,
  sistemaPergunta,
  sistemaTriagem,
  usuarioPergunta,
  usuarioTriagem,
  VERSAO_PROMPT,
} from "./prompts";
import {
  comNovaTentativa,
  ErroProvedor,
  MODELO_PADRAO,
  type ProvedorIa,
} from "./provedor";
import { avisosDaMensagem, redigir, trocarMarcadores } from "./redacao";

export class ErroIa extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

// ---------- Contratos com o banco ----------

export interface ReclamacaoParaIa {
  id: string;
  numero: number;
  descricao: string;
  produto: { codigo: string; nome: string; familia: string } | null;
  canal: string;
  marca: string;
  clienteNome: string;
  pedido: string;
  causaId: string | null;
}

export interface CausaIa {
  id: string;
  nome: string;
  categoria: string;
  setorId: string;
  setorNome: string;
}

export interface PerguntaIa extends PerguntaDef {
  id: string;
  categoria: string;
  exemplo: string;
  opcoes: string[];
  padrao: boolean;
}

export interface PerfilIa extends PerfilPrompt {
  versao: number;
  descricao: string;
  missao: string;
  valores: string;
  metas: string;
  assinatura: string;
  padrao: boolean;
  nota: string;
  publicadaEm: string;
  publicadaPorNome: string;
}

export interface RespostaRegistrada {
  chave: string;
  valor: string;
  dispensada: boolean;
  origem: string;
  textoPergunta: string;
}

export type AceiteIa = "aceita" | "alterada" | "recusada";

export interface RegistroNovo {
  reclamacaoId: string;
  tipo: "triagem" | "pergunta";
  etapa: string;
  sugestao: unknown;
  confianca: number | null;
  modelo: string;
  versaoPrompt: string;
  versaoPerfil: number | null;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  latenciaMs: number;
  entradaRedigida: string;
  erro: string | null;
  usouRegras: boolean;
  usuarioId: string;
}

export interface RegistroGravado extends RegistroNovo {
  id: string;
  aceite: AceiteIa | null;
  causaEscolhidaId: string | null;
  textoFinal: string | null;
  criadoEm: string;
}

export interface AuditoriaIa {
  usuarioId: string;
  usuarioNome: string;
  acao: string;
  alvo: string;
  detalhe: string;
  reclamacaoId?: string;
  extra?: Record<string, unknown>;
}

export interface RepositorioIa {
  reclamacao(
    id: string,
    usuario: UsuarioLogado,
  ): Promise<ReclamacaoParaIa | null>;
  causas(): Promise<CausaIa[]>;
  perguntas(): Promise<PerguntaIa[]>;
  perfil(): Promise<PerfilIa | null>;
  respostas(reclamacaoId: string): Promise<RespostaRegistrada[]>;
  consumo(desde: Date): Promise<{ chamadas: number; custoUsd: number }>;
  gravarRegistro(r: RegistroNovo): Promise<string>;
  registro(id: string): Promise<RegistroGravado | null>;
  /** Do mais novo para o mais antigo. */
  ultimos(reclamacaoId: string): Promise<RegistroGravado[]>;
  aceitar(
    id: string,
    d: {
      aceite: AceiteIa;
      causaEscolhidaId: string | null;
      textoFinal: string | null;
      quando: Date;
      /** Origem do campo decidido, para as métricas de qualidade do registro. */
      origemCampo?: { campo: string; origem: string; aceite: string | null };
    },
    auditoria: AuditoriaIa,
  ): Promise<void>;
  qualidade(): Promise<DadosQualidade>;
  gravarResposta(
    r: {
      reclamacaoId: string;
      perguntaId: string | null;
      chave: string;
      textoPergunta: string;
      valor: string;
      origem: string;
      dispensada: boolean;
      motivo: string;
      usuarioId: string;
      usuarioNome: string;
    },
    auditoria: AuditoriaIa,
  ): Promise<void>;
}

export interface DadosQualidade {
  /** Campo x origem x aceite, com a contagem. */
  grupos: { campo: string; origem: string; aceite: string | null; n: number }[];
  reclamacoes: number;
  importadas: number;
  /** Tempo da abertura até sair da triagem, em minutos, de cada reclamação que já saiu. */
  minutosEmTriagem: number[];
}

/** Chave e configuração da integração OpenRouter, lidas só dentro do servidor. */
export interface FonteConfigIa {
  chave(): Promise<string | null>;
  config(): Promise<Record<string, unknown>>;
}

// ---------- Configuração ----------

export interface ConfigIa {
  chave: string | null;
  modelo: string;
  limiteChamadas: number;
  limiteCustoUsd: number;
}

const LIMITE_CHAMADAS_PADRAO = 300;
const LIMITE_CUSTO_PADRAO = 3;
const MODELO_VALIDO = /^[A-Za-z0-9._:/-]{3,100}$/;

function positivo(v: unknown, padrao: number): number {
  const n =
    typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/** Chave: primeiro a da tela de integrações (cifrada), depois `OPENROUTER_API_KEY`. */
export async function resolverConfig(
  fonte: FonteConfigIa,
  env: Record<string, string | undefined>,
): Promise<ConfigIa> {
  const cfg = await fonte.config();
  const doBanco = (await fonte.chave())?.trim();
  const chave = doBanco || env.OPENROUTER_API_KEY?.trim() || null;
  const tela = typeof cfg.modelo === "string" ? cfg.modelo.trim() : "";
  const amb = env.OPENROUTER_MODELO?.trim() ?? "";
  const modelo =
    [tela, amb].find((m) => MODELO_VALIDO.test(m)) ?? MODELO_PADRAO;
  return {
    chave,
    modelo,
    limiteChamadas: Math.floor(
      positivo(
        cfg.limiteChamadas ?? env.IA_LIMITE_CHAMADAS,
        LIMITE_CHAMADAS_PADRAO,
      ),
    ),
    limiteCustoUsd: positivo(
      cfg.limiteCustoUsd ?? env.IA_LIMITE_CUSTO_USD,
      LIMITE_CUSTO_PADRAO,
    ),
  };
}

/** Início do dia em Brasília (UTC-3), para o limite diário. */
export function inicioDoDia(agora: Date): Date {
  const local = new Date(agora.getTime() - 3 * 3_600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
      3 * 3_600_000,
  );
}

// ---------- Visões ----------

export interface ConsumoIa {
  chamadas: number;
  custoUsd: number;
  limiteChamadas: number;
  limiteCustoUsd: number;
  limiteAtingido: boolean;
}

export type EstadoPergunta = "respondida" | "dispensada" | "sugerida" | "falta";

export interface PerguntaVisao {
  chave: string;
  texto: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
  exemplo: string;
  categoria: string;
  estado: EstadoPergunta;
  valor: string;
  /** O que a IA achou no texto; só vale depois que a pessoa confirma. */
  sugestaoIa: string;
}

export interface AnaliseVisao {
  registroId: string;
  registroPerguntaId: string | null;
  fonte: "ia" | "regras";
  sintese: string;
  causa: { id: string; nome: string; categoria: string } | null;
  setor: { id: string; nome: string } | null;
  confianca: number | null;
  aceite: AceiteIa | null;
  causaEscolhidaId: string | null;
  mensagem: string | null;
  mensagemAceite: AceiteIa | null;
  avisos: string[];
  criadoEm: string;
}

export interface VisaoIa {
  configurada: boolean;
  modelo: string;
  consumo: ConsumoIa;
  /** Por que não há análise nova: sem chave, limite do dia ou falha da IA. */
  aviso: string | null;
  analise: AnaliseVisao | null;
  perguntas: PerguntaVisao[];
  causas: { id: string; nome: string; categoria: string; setor: string }[];
}

const SEM_CHAVE = "IA não configurada. Siga pelo formulário normal.";
const LIMITE_DIA =
  "O limite de uso da IA de hoje foi atingido. Siga pelo formulário normal.";
const FALHA =
  "A IA não respondeu agora. Mostramos a sugestão das regras; siga pelo formulário normal.";
const TEXTO_MAX = 4000;
const MENSAGEM_MAX = 1500;
const TIMEOUT_MS = 20_000;

function exigirPermissao(u: UsuarioLogado, chave: string) {
  if (!temPermissao(u.permissoes, chave)) {
    throw new ErroIa(403, "Sem permissão para esta ação.");
  }
}

function objeto(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

type Uso = {
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  duracao: number;
};

export class ServicoIa {
  constructor(
    private readonly repo: RepositorioIa,
    private readonly fonte: FonteConfigIa,
    private readonly criarProvedor: (chave: string) => ProvedorIa,
    private readonly env: Record<string, string | undefined> = {},
    private readonly agora: () => Date = () => new Date(),
    private readonly espera?: (ms: number) => Promise<void>,
  ) {}

  private async consumo(cfg: ConfigIa): Promise<ConsumoIa> {
    const c = await this.repo.consumo(inicioDoDia(this.agora()));
    return {
      ...c,
      limiteChamadas: cfg.limiteChamadas,
      limiteCustoUsd: cfg.limiteCustoUsd,
      limiteAtingido:
        c.chamadas >= cfg.limiteChamadas || c.custoUsd >= cfg.limiteCustoUsd,
    };
  }

  /** Consumo do dia para a tela de integrações. */
  async consumoDoDia(usuario: UsuarioLogado) {
    exigirPermissao(usuario, "integracoes.gerir");
    const cfg = await resolverConfig(this.fonte, this.env);
    return {
      configurada: cfg.chave !== null,
      modelo: cfg.modelo,
      ...(await this.consumo(cfg)),
    };
  }

  /** Qualidade do registro: quanto veio pronto, quanto a pessoa aceitou da IA e corrigiu, e o tempo em triagem. */
  async qualidade(usuario: UsuarioLogado): Promise<QualidadeIa> {
    exigirPermissao(usuario, "integracoes.gerir");
    return resumirQualidade(await this.repo.qualidade());
  }

  // ---------- Ficha ----------

  /** O que a ficha mostra. Sem chave, devolve o aviso e as perguntas: o formulário segue valendo. */
  async painel(
    usuario: UsuarioLogado,
    reclamacaoId: string,
    causaIdEscolhida?: string,
  ): Promise<VisaoIa> {
    exigirPermissao(usuario, "ia.usar");
    const r = await this.carregar(usuario, reclamacaoId);
    const cfg = await resolverConfig(this.fonte, this.env);
    const consumo = await this.consumo(cfg);
    return this.montarVisao({
      r,
      cfg,
      consumo,
      ultimos: await this.repo.ultimos(reclamacaoId),
      causaIdEscolhida,
      aviso:
        cfg.chave === null
          ? SEM_CHAVE
          : consumo.limiteAtingido
            ? LIMITE_DIA
            : null,
    });
  }

  /** Triagem e, se faltar algo, a mensagem ao cliente. Nunca grava causa, setor nem estado. */
  async analisar(
    usuario: UsuarioLogado,
    reclamacaoId: string,
  ): Promise<VisaoIa> {
    exigirPermissao(usuario, "ia.usar");
    const r = await this.carregar(usuario, reclamacaoId);
    const cfg = await resolverConfig(this.fonte, this.env);
    if (cfg.chave === null) return this.painel(usuario, reclamacaoId);
    if ((await this.consumo(cfg)).limiteAtingido) {
      return this.painel(usuario, reclamacaoId);
    }

    const [causas, perguntas, perfil, respostas] = await Promise.all([
      this.repo.causas(),
      this.repo.perguntas(),
      this.repo.perfil(),
      this.repo.respostas(reclamacaoId),
    ]);
    const texto = redigir(r.descricao.slice(0, TEXTO_MAX), {
      nomes: [r.clienteNome],
      literais: [r.pedido],
    });
    const ativas = perguntas.filter((p) => p.ativa);
    const provedor = this.criarProvedor(cfg.chave);

    // 1. Triagem. Falha, tempo ou esquema inválido caem nas regras.
    try {
      const esquema = esquemaTriagem(
        causas.map((c) => c.id),
        ativas.map((p) => p.chave),
      );
      const inicio = Date.now();
      const resp = await comNovaTentativa(
        provedor,
        {
          sistema: sistemaTriagem(
            causas.map((c) => ({
              id: c.id,
              nome: c.nome,
              categoria: c.categoria,
            })),
            ativas,
          ),
          usuario: usuarioTriagem({
            produto: r.produto?.nome ?? "",
            sku: r.produto?.codigo ?? "",
            canal: r.canal,
            texto,
          }),
          modelo: cfg.modelo,
          timeoutMs: TIMEOUT_MS,
          maxTokens: 500,
        },
        this.espera,
      );
      const duracao = Date.now() - inicio;
      let saida: z.infer<typeof esquema>;
      try {
        saida = esquema.parse(lerJson(resp.texto));
      } catch {
        await this.gravarFalha(
          usuario,
          r,
          "triagem",
          cfg,
          texto,
          "A IA devolveu uma saída fora do esquema.",
          { ...resp, duracao },
        );
        return this.fallbackRegras(usuario, r, causas, cfg, texto);
      }
      const causa = causas.find((c) => c.id === saida.causaId) ?? null;
      await this.repo.gravarRegistro({
        reclamacaoId,
        tipo: "triagem",
        etapa: "triagem",
        sugestao: {
          fonte: "ia",
          causaId: saida.causaId,
          setorId: causa?.setorId ?? null,
          setorNome: causa?.setorNome ?? null,
          sintese: saida.sintese,
          respondidas: saida.respondidas,
        },
        confianca: saida.confianca,
        modelo: resp.modelo,
        versaoPrompt: VERSAO_PROMPT,
        versaoPerfil: perfil?.versao ?? null,
        tokensEntrada: resp.tokensEntrada,
        tokensSaida: resp.tokensSaida,
        custoUsd: resp.custoUsd,
        latenciaMs: duracao,
        entradaRedigida: texto,
        erro: null,
        usouRegras: false,
        usuarioId: usuario.id,
      });

      // 2. Mensagem ao cliente, só se faltar pergunta obrigatória e ainda houver limite.
      const aplicaveis = perguntasAplicaveis(ativas, this.contexto(r, causa));
      const jaIa = new Set(saida.respondidas.map((x) => x.chave));
      const faltantes = perguntasFaltantes(aplicaveis, respostas).filter(
        (p) => !jaIa.has(p.chave),
      );
      if (faltantes.length > 0 && !(await this.consumo(cfg)).limiteAtingido) {
        await this.gerarPergunta({
          usuario,
          r,
          cfg,
          provedor,
          perfil,
          sintese: saida.sintese,
          faltantes,
        });
      }
    } catch (e) {
      // Erro de rede ou de provedor não derruba a ficha: cai nas regras.
      const mensagem =
        e instanceof ErroProvedor ? e.message : "Falha ao chamar a IA.";
      await this.gravarFalha(usuario, r, "triagem", cfg, texto, mensagem, null);
      return this.fallbackRegras(usuario, r, causas, cfg, texto);
    }
    return this.painel(usuario, reclamacaoId);
  }

  /** Nova mensagem ao cliente com o que ainda falta (depois de registrar respostas). */
  async novaPergunta(
    usuario: UsuarioLogado,
    reclamacaoId: string,
  ): Promise<VisaoIa> {
    exigirPermissao(usuario, "ia.usar");
    const r = await this.carregar(usuario, reclamacaoId);
    const cfg = await resolverConfig(this.fonte, this.env);
    if (cfg.chave === null) return this.painel(usuario, reclamacaoId);
    if ((await this.consumo(cfg)).limiteAtingido) {
      return this.painel(usuario, reclamacaoId);
    }
    const [causas, perguntas, perfil, respostas, ultimos] = await Promise.all([
      this.repo.causas(),
      this.repo.perguntas(),
      this.repo.perfil(),
      this.repo.respostas(reclamacaoId),
      this.repo.ultimos(reclamacaoId),
    ]);
    const triagem = ultimos.find(
      (x) => x.tipo === "triagem" && x.erro === null,
    );
    const sug = objeto(triagem?.sugestao);
    const causa =
      causas.find((c) => c.id === (triagem?.causaEscolhidaId ?? sug.causaId)) ??
      causas.find((c) => c.id === r.causaId) ??
      null;
    const aplicaveis = perguntasAplicaveis(
      perguntas.filter((p) => p.ativa),
      this.contexto(r, causa),
    );
    const faltantes = perguntasFaltantes(aplicaveis, respostas);
    if (faltantes.length > 0) {
      await this.gerarPergunta({
        usuario,
        r,
        cfg,
        provedor: this.criarProvedor(cfg.chave),
        perfil,
        sintese: typeof sug.sintese === "string" ? sug.sintese : "",
        faltantes,
      });
    }
    return this.painel(usuario, reclamacaoId);
  }

  /** O aceite é dado de qualidade: aceita, alterada (outra causa ou texto editado) ou recusada. */
  async aceite(
    usuario: UsuarioLogado,
    reclamacaoId: string,
    entrada: {
      registroId: string;
      aceite: AceiteIa;
      causaId?: string;
      textoFinal?: string;
    },
  ): Promise<void> {
    exigirPermissao(usuario, "ia.usar");
    const r = await this.carregar(usuario, reclamacaoId);
    const reg = await this.repo.registro(entrada.registroId);
    if (!reg || reg.reclamacaoId !== reclamacaoId || reg.erro !== null) {
      throw new ErroIa(404, "Sugestão não encontrada.");
    }
    let aceite = entrada.aceite;
    let causaEscolhida: string | null = null;
    let textoFinal: string | null = null;
    let origemCampo:
      | { campo: string; origem: string; aceite: string | null }
      | undefined;
    const sug = objeto(reg.sugestao);
    if (reg.tipo === "triagem") {
      if (aceite !== "recusada") {
        if (!entrada.causaId || !CAUSA_POR_ID[entrada.causaId]) {
          throw new ErroIa(400, "Causa inexistente.");
        }
        causaEscolhida = entrada.causaId;
        aceite = entrada.causaId === sug.causaId ? "aceita" : "alterada";
        origemCampo = {
          campo: "causa",
          origem: "ia",
          aceite: aceite === "aceita" ? "aceita" : "corrigida",
        };
      } else {
        origemCampo = { campo: "causa", origem: "pessoa", aceite: "recusada" };
      }
    } else if (aceite !== "recusada") {
      const original = typeof sug.mensagem === "string" ? sug.mensagem : "";
      const enviado = (entrada.textoFinal ?? "").slice(0, MENSAGEM_MAX);
      const sugerido = trocarMarcadores(original, {
        nomeCliente: r.clienteNome,
        marca: r.marca,
      });
      if (enviado.trim() !== "" && enviado.trim() !== sugerido.trim()) {
        aceite = "alterada";
        // Só o texto alterado fica, e sem o nome nem outro dado pessoal.
        textoFinal = redigir(enviado, {
          nomes: [r.clienteNome],
          literais: [r.pedido],
        });
      } else {
        aceite = "aceita";
      }
    }
    await this.repo.aceitar(
      reg.id,
      {
        aceite,
        causaEscolhidaId: causaEscolhida,
        textoFinal,
        quando: this.agora(),
        origemCampo,
      },
      {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "ia.aceite",
        alvo: `Reclamação #${r.numero}`,
        detalhe: `Sugestão da IA (${reg.tipo}): ${aceite}.`,
        reclamacaoId,
        extra: { registroId: reg.id, tipo: reg.tipo, aceite },
      },
    );
  }

  /** Resposta do cliente a uma pergunta, ou dispensa com motivo. */
  async responder(
    usuario: UsuarioLogado,
    reclamacaoId: string,
    entrada: {
      chave: string;
      valor?: string;
      dispensada?: boolean;
      motivo?: string;
      origem?: "atendente" | "ia_confirmada";
    },
  ): Promise<void> {
    exigirPermissao(usuario, "reclamacoes.editar");
    const r = await this.carregar(usuario, reclamacaoId);
    const pergunta = (await this.repo.perguntas()).find(
      (p) => p.chave === entrada.chave && p.ativa,
    );
    if (!pergunta) throw new ErroIa(400, "Pergunta inexistente.");
    const valor = (entrada.valor ?? "").trim().slice(0, 500);
    const dispensada = entrada.dispensada === true;
    if (!dispensada && valor === "") {
      throw new ErroIa(400, "Informe a resposta.");
    }
    const motivo = (entrada.motivo ?? "").trim().slice(0, 200);
    if (dispensada && motivo === "") {
      throw new ErroIa(400, "Diga o motivo de dispensar.");
    }
    if (
      pergunta.tipo === "escolha" &&
      !dispensada &&
      !pergunta.opcoes.includes(valor)
    ) {
      throw new ErroIa(400, "Escolha uma das opções.");
    }
    await this.repo.gravarResposta(
      {
        reclamacaoId,
        perguntaId: pergunta.id,
        chave: pergunta.chave,
        textoPergunta: pergunta.texto,
        valor: dispensada ? "" : valor,
        origem: entrada.origem ?? "atendente",
        dispensada,
        motivo,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
      },
      {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "reclamacao.resposta",
        alvo: `Reclamação #${r.numero}`,
        // O texto do cliente não vai para a auditoria: só se registra que mudou.
        detalhe: `Pergunta "${pergunta.chave}": ${dispensada ? "dispensada" : "respondida"}.`,
        reclamacaoId,
        extra: { chave: pergunta.chave, dispensada },
      },
    );
  }

  // ---------- Partes ----------

  private async carregar(usuario: UsuarioLogado, id: string) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new ErroIa(404, "Reclamação não encontrada.");
    }
    const r = await this.repo.reclamacao(id, usuario);
    if (!r) throw new ErroIa(404, "Reclamação não encontrada.");
    return r;
  }

  private contexto(r: ReclamacaoParaIa, causa: CausaIa | null) {
    return {
      familia: r.produto?.familia ?? null,
      causaId: causa?.id ?? null,
      causaCategoria: causa?.categoria ?? null,
    };
  }

  private async gravarFalha(
    usuario: UsuarioLogado,
    r: ReclamacaoParaIa,
    etapa: "triagem" | "pergunta",
    cfg: { modelo: string },
    entrada: string,
    erro: string,
    uso: Uso | null,
  ) {
    await this.repo.gravarRegistro({
      reclamacaoId: r.id,
      tipo: etapa,
      etapa,
      sugestao: {},
      confianca: null,
      modelo: cfg.modelo,
      versaoPrompt: VERSAO_PROMPT,
      versaoPerfil: null,
      tokensEntrada: uso?.tokensEntrada ?? 0,
      tokensSaida: uso?.tokensSaida ?? 0,
      custoUsd: uso?.custoUsd ?? 0,
      latenciaMs: uso?.duracao ?? 0,
      entradaRedigida: entrada,
      erro,
      usouRegras: etapa === "triagem",
      usuarioId: usuario.id,
    });
  }

  /** Sem IA: as regras do domínio propõem a causa; o formulário continua valendo. */
  private async fallbackRegras(
    usuario: UsuarioLogado,
    r: ReclamacaoParaIa,
    causas: CausaIa[],
    cfg: { modelo: string },
    entrada: string,
  ): Promise<VisaoIa> {
    const id = classificar({
      reclamacao: r.descricao,
      produto: r.produto?.nome ?? "",
      sku: r.produto?.codigo ?? "",
    });
    const causa = causas.find((c) => c.id === id) ?? null;
    await this.repo.gravarRegistro({
      reclamacaoId: r.id,
      tipo: "triagem",
      etapa: "triagem_regras",
      sugestao: {
        fonte: "regras",
        causaId: causa?.id ?? null,
        setorId: causa?.setorId ?? null,
        setorNome: causa?.setorNome ?? null,
        sintese: "",
        respondidas: [],
      },
      confianca: null,
      modelo: cfg.modelo,
      versaoPrompt: VERSAO_PROMPT,
      versaoPerfil: null,
      tokensEntrada: 0,
      tokensSaida: 0,
      custoUsd: 0,
      latenciaMs: 0,
      entradaRedigida: entrada,
      erro: null,
      usouRegras: true,
      usuarioId: usuario.id,
    });
    return { ...(await this.painel(usuario, r.id)), aviso: FALHA };
  }

  private async gerarPergunta(a: {
    usuario: UsuarioLogado;
    r: ReclamacaoParaIa;
    cfg: ConfigIa;
    provedor: ProvedorIa;
    perfil: PerfilIa | null;
    sintese: string;
    faltantes: PerguntaIa[];
  }) {
    const entradaTexto = usuarioPergunta({
      produto: a.r.produto?.nome ?? "",
      sintese: a.sintese,
      canal: a.r.canal,
      faltantes: a.faltantes.map((f) => ({
        chave: f.chave,
        texto: f.texto,
        exemplo: f.exemplo,
      })),
    });
    try {
      const esquema = esquemaPergunta(a.faltantes.map((f) => f.chave));
      const inicio = Date.now();
      const resp = await comNovaTentativa(
        a.provedor,
        {
          sistema: sistemaPergunta({
            tomDeVoz: a.perfil?.tomDeVoz ?? "",
            dizer: a.perfil?.dizer ?? "",
            evitar: a.perfil?.evitar ?? "",
            exemplos: a.perfil?.exemplos ?? [],
          }),
          usuario: entradaTexto,
          modelo: a.cfg.modelo,
          timeoutMs: TIMEOUT_MS,
          maxTokens: 400,
        },
        this.espera,
      );
      const duracao = Date.now() - inicio;
      let saida: z.infer<typeof esquema>;
      try {
        saida = esquema.parse(lerJson(resp.texto));
      } catch {
        await this.gravarFalha(
          a.usuario,
          a.r,
          "pergunta",
          a.cfg,
          entradaTexto,
          "A IA devolveu uma saída fora do esquema.",
          { ...resp, duracao },
        );
        return;
      }
      const mensagem = [saida.mensagem, a.perfil?.assinatura ?? ""]
        .filter(Boolean)
        .join("\n\n");
      await this.repo.gravarRegistro({
        reclamacaoId: a.r.id,
        tipo: "pergunta",
        etapa: "pergunta",
        sugestao: {
          mensagem,
          perguntaChaves: saida.perguntaChaves,
          avisos: avisosDaMensagem(saida.mensagem, entradaTexto),
        },
        confianca: null,
        modelo: resp.modelo,
        versaoPrompt: VERSAO_PROMPT,
        versaoPerfil: a.perfil?.versao ?? null,
        tokensEntrada: resp.tokensEntrada,
        tokensSaida: resp.tokensSaida,
        custoUsd: resp.custoUsd,
        latenciaMs: duracao,
        entradaRedigida: entradaTexto,
        erro: null,
        usouRegras: false,
        usuarioId: a.usuario.id,
      });
    } catch (e) {
      const mensagem =
        e instanceof ErroProvedor ? e.message : "Falha ao chamar a IA.";
      await this.gravarFalha(
        a.usuario,
        a.r,
        "pergunta",
        a.cfg,
        entradaTexto,
        mensagem,
        null,
      );
    }
  }

  private async montarVisao(a: {
    r: ReclamacaoParaIa;
    cfg: ConfigIa;
    consumo: ConsumoIa;
    ultimos: RegistroGravado[];
    causaIdEscolhida?: string;
    aviso: string | null;
  }): Promise<VisaoIa> {
    const [causas, perguntas, respostas] = await Promise.all([
      this.repo.causas(),
      this.repo.perguntas(),
      this.repo.respostas(a.r.id),
    ]);
    // O registro de triagem mais novo manda. Se foi falha, vale o aviso e a sugestão das regras já gravada.
    const triagemRec = a.ultimos.find((x) => x.tipo === "triagem");
    const triagem = triagemRec && triagemRec.erro === null ? triagemRec : null;
    const falhou = triagemRec !== undefined && triagemRec.erro !== null;
    const sug = objeto(triagem?.sugestao);
    const causaSug = causas.find((c) => c.id === sug.causaId) ?? null;
    const causaAtual =
      causas.find((c) => c.id === a.causaIdEscolhida) ??
      causaSug ??
      causas.find((c) => c.id === a.r.causaId) ??
      null;
    const sugeridas = Array.isArray(sug.respondidas)
      ? (sug.respondidas as { chave?: unknown; valor?: unknown }[])
      : [];
    const aplicaveis = perguntasAplicaveis(
      perguntas.filter((p) => p.ativa),
      this.contexto(a.r, causaAtual),
    );
    const visaoPerguntas: PerguntaVisao[] = aplicaveis.map((p) => {
      const dada = respostas.find((x) => x.chave === p.chave);
      const ia = sugeridas.find((x) => x.chave === p.chave);
      const sugestaoIa = typeof ia?.valor === "string" ? ia.valor : "";
      const respondida = dada && !dada.dispensada && dada.valor.trim() !== "";
      const estado: EstadoPergunta = respondida
        ? "respondida"
        : dada?.dispensada
          ? "dispensada"
          : sugestaoIa
            ? "sugerida"
            : "falta";
      return {
        chave: p.chave,
        texto: p.texto,
        tipo: p.tipo,
        opcoes: p.opcoes,
        obrigatoria: p.obrigatoria,
        exemplo: p.exemplo,
        categoria: p.categoria,
        estado,
        valor: dada?.valor ?? "",
        sugestaoIa,
      };
    });
    const perguntaRec = a.ultimos.find(
      (x) => x.tipo === "pergunta" && x.erro === null,
    );
    const sugP = objeto(perguntaRec?.sugestao);
    // O nome do cliente entra aqui, no servidor, depois do modelo.
    const mensagem =
      typeof sugP.mensagem === "string"
        ? trocarMarcadores(sugP.mensagem, {
            nomeCliente: a.r.clienteNome,
            marca: a.r.marca,
          })
        : null;
    const analise: AnaliseVisao | null = triagem
      ? {
          registroId: triagem.id,
          registroPerguntaId: perguntaRec?.id ?? null,
          fonte: sug.fonte === "regras" ? "regras" : "ia",
          sintese: typeof sug.sintese === "string" ? sug.sintese : "",
          causa: causaSug
            ? {
                id: causaSug.id,
                nome: causaSug.nome,
                categoria: causaSug.categoria,
              }
            : null,
          setor: causaSug
            ? { id: causaSug.setorId, nome: causaSug.setorNome }
            : null,
          confianca: triagem.confianca,
          aceite: triagem.aceite,
          causaEscolhidaId: triagem.causaEscolhidaId,
          mensagem,
          mensagemAceite: perguntaRec?.aceite ?? null,
          avisos: Array.isArray(sugP.avisos) ? (sugP.avisos as string[]) : [],
          criadoEm: triagem.criadoEm,
        }
      : null;
    return {
      configurada: a.cfg.chave !== null,
      modelo: a.cfg.modelo,
      consumo: a.consumo,
      aviso: a.aviso ?? (falhou ? FALHA : null),
      analise,
      perguntas: visaoPerguntas,
      causas: causas.map((c) => ({
        id: c.id,
        nome: c.nome,
        categoria: c.categoria,
        setor: c.setorNome,
      })),
    };
  }
}

export interface QualidadeIa {
  reclamacoes: number;
  /** Campos com origem conhecida. */
  camposRegistrados: number;
  /** Parte deles que veio sem digitação (canal, IA ou importação). */
  pctAutomatico: number | null;
  tempoMedioTriagemMin: number | null;
  porCampo: {
    campo: string;
    canal: number;
    ia: number;
    pessoa: number;
    importado: number;
    aceitasIa: number;
    corrigidasIa: number;
    taxaAceiteIa: number | null;
  }[];
}

const pct = (n: number, d: number) =>
  d === 0 ? null : Math.round((1000 * n) / d) / 10;

export function resumirQualidade(d: DadosQualidade): QualidadeIa {
  const por = new Map<string, QualidadeIa["porCampo"][number]>();
  for (const g of d.grupos) {
    const c = por.get(g.campo) ?? {
      campo: g.campo,
      canal: 0,
      ia: 0,
      pessoa: 0,
      importado: 0,
      aceitasIa: 0,
      corrigidasIa: 0,
      taxaAceiteIa: null,
    };
    if (
      g.origem === "canal" ||
      g.origem === "ia" ||
      g.origem === "pessoa" ||
      g.origem === "importado"
    ) {
      c[g.origem] += g.n;
    }
    if (g.origem === "ia" && g.aceite === "aceita") c.aceitasIa += g.n;
    if (g.origem === "ia" && g.aceite === "corrigida") c.corrigidasIa += g.n;
    if (g.origem === "pessoa" && g.aceite === "recusada") c.corrigidasIa += g.n;
    por.set(g.campo, c);
  }
  const porCampo = [...por.values()].map((c) => ({
    ...c,
    taxaAceiteIa: pct(c.aceitasIa, c.aceitasIa + c.corrigidasIa),
  }));
  const soma = (f: (c: QualidadeIa["porCampo"][number]) => number) =>
    porCampo.reduce((s, c) => s + f(c), 0);
  const t = d.minutosEmTriagem;
  return {
    reclamacoes: d.reclamacoes,
    camposRegistrados: soma((c) => c.canal + c.ia + c.pessoa + c.importado),
    pctAutomatico: pct(
      soma((c) => c.canal + c.ia + c.importado),
      soma((c) => c.canal + c.ia + c.pessoa + c.importado),
    ),
    tempoMedioTriagemMin: t.length
      ? Math.round(t.reduce((a, b) => a + b, 0) / t.length)
      : null,
    porCampo,
  };
}
