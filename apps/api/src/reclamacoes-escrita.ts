import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  CAUSA_POR_ID,
  classificar,
  type Devolucao,
  type Estado,
  type Situacao,
  situacao,
  temPermissao,
  validarTransicao,
} from "@sac-aisa/domain";
import { type Escopo, filtroDeEscopo } from "./reclamacoes";

// ---------- Estado e entrada ----------

export interface Custos {
  freteEnvio: number;
  freteRetorno: number;
  valorPeca: number;
  estorno: number;
  desconto: number;
  guia: number;
}

/** Os campos que a equipe pode gravar, no formato plano usado para comparar e auditar. */
export interface EstadoReclamacao {
  canalId: string;
  marcaId: string | null;
  produtoId: string | null;
  bancadaId: string | null;
  causaId: string | null;
  causaManual: boolean;
  setorRespId: string | null;
  setorRespManual: boolean;
  devolucao: Devolucao;
  /** Estado da jornada. Só muda por transição (ver `jornada.ts`) ou como efeito de data de ação e troca de setor. */
  estado: Estado;
  dataAbertura: string;
  dataAcao: string | null;
  dataRecebimento: string | null;
  /** Prazo do marketplace (AAAA-MM-DD). Corre à parte do relógio interno. */
  prazoMarketplace: string | null;
  protocoloExterno: string | null;
  descricao: string;
  laudo: string;
  procedencia: string;
  solucao: string;
  observacao: string;
  garantia: string;
  pedido: string;
  clienteNome: string;
  cidade: string;
  uf: string;
  transportadora: string;
  peca: string;
  custos: Custos;
}

/**
 * O que o cliente pode mandar. Não há `situacao`, nem `setorRespManual`, nem `causaManual`:
 * a situação sai da regra do domínio e os dois indicadores saem de quem escolheu o quê.
 * `causaId: null` e `setorRespId: null` devolvem o campo ao cálculo automático.
 */
export interface EntradaEscrita {
  canalId?: string;
  marcaId?: string | null;
  produtoCodigo?: string | null;
  bancadaId?: string | null;
  causaId?: string | null;
  setorRespId?: string | null;
  devolucao?: Devolucao;
  dataAbertura?: string;
  dataAcao?: string | null;
  dataRecebimento?: string | null;
  prazoMarketplace?: string | null;
  protocoloExterno?: string | null;
  descricao?: string;
  laudo?: string;
  procedencia?: string;
  solucao?: string;
  observacao?: string;
  garantia?: string;
  pedido?: string;
  clienteNome?: string;
  cidade?: string;
  uf?: string;
  transportadora?: string;
  peca?: string;
  custos?: Partial<Custos>;
  /** Só acompanha a troca de setor: vai para a auditoria, não para a reclamação. */
  motivoTroca?: string;
}

export class ErroEscrita extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

const ID_MAX = 64;
const CURTO_MAX = 200;
const LONGO_MAX = 5000;
const CUSTO_MAX = 9_999_999.99;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DEVOLUCOES: readonly Devolucao[] = ["NA", "AGUARDANDO", "RECEBIDO"];

const CAMPOS_ID = ["canalId", "marcaId", "bancadaId", "causaId", "setorRespId"];
const CAMPOS_CURTOS = [
  "protocoloExterno",
  "pedido",
  "clienteNome",
  "cidade",
  "transportadora",
  "peca",
  "garantia",
  "procedencia",
] as const;
const CAMPOS_LONGOS = ["descricao", "laudo", "solucao", "observacao"] as const;
const CAMPOS_CUSTO: (keyof Custos)[] = [
  "freteEnvio",
  "freteRetorno",
  "valorPeca",
  "estorno",
  "desconto",
  "guia",
];
/**
 * O que é do setor responsável, não da triagem: causa final, devolução do produto, laudo,
 * solução, ação (resolve), peça, garantia, procedência e custo. Exige "reclamacoes.analisar".
 */
const CAMPOS_DO_SETOR = [
  "causaId",
  "devolucao",
  "dataRecebimento",
  "dataAcao",
  "laudo",
  "solucao",
  "peca",
  "garantia",
  "procedencia",
  "custos",
] as const;
const MOTIVO_MAX = 200;
const CAMPOS_ACEITOS = new Set<string>([
  "motivoTroca",
  ...CAMPOS_ID,
  ...CAMPOS_CURTOS,
  ...CAMPOS_LONGOS,
  "produtoCodigo",
  "devolucao",
  "dataAbertura",
  "dataAcao",
  "dataRecebimento",
  "prazoMarketplace",
  "uf",
  "custos",
]);

export function dataValida(s: string): boolean {
  if (!DATA_ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valida o corpo da requisição. Campo desconhecido, tipo errado ou valor fora do limite
 * é recusado com mensagem, nunca ignorado em silêncio nem "consertado".
 */
export function lerEntrada(
  corpo: unknown,
  modo: "criar" | "editar",
): { ok: true; entrada: EntradaEscrita } | { ok: false; mensagem: string } {
  if (!ehObjeto(corpo)) return { ok: false, mensagem: "Corpo inválido." };
  const erro = (mensagem: string) => ({ ok: false as const, mensagem });

  for (const k of Object.keys(corpo)) {
    if (!CAMPOS_ACEITOS.has(k)) return erro(`Campo não aceito: "${k}".`);
  }

  const e: Record<string, unknown> = {};

  for (const campo of CAMPOS_ID) {
    if (!(campo in corpo)) continue;
    const v = corpo[campo];
    if (v === null && campo !== "canalId") {
      e[campo] = null;
      continue;
    }
    if (typeof v !== "string" || v === "" || v.length > ID_MAX) {
      return erro(`Valor inválido em "${campo}".`);
    }
    e[campo] = v;
  }

  if ("produtoCodigo" in corpo) {
    const v = corpo.produtoCodigo;
    if (v === null || v === "") e.produtoCodigo = null;
    else if (typeof v !== "string" || v.trim().length > CURTO_MAX) {
      return erro('Valor inválido em "produtoCodigo".');
    } else e.produtoCodigo = v.trim();
  }

  for (const campo of CAMPOS_CURTOS) {
    if (!(campo in corpo)) continue;
    const v = corpo[campo];
    if (typeof v !== "string" || v.length > CURTO_MAX) {
      return erro(`Valor inválido em "${campo}".`);
    }
    const t = v.trim();
    e[campo] = campo === "protocoloExterno" && t === "" ? null : t;
  }

  for (const campo of CAMPOS_LONGOS) {
    if (!(campo in corpo)) continue;
    const v = corpo[campo];
    if (typeof v !== "string" || v.length > LONGO_MAX) {
      return erro(`Valor inválido em "${campo}".`);
    }
    e[campo] = v.trim();
  }

  if ("motivoTroca" in corpo) {
    const v = corpo.motivoTroca;
    if (typeof v !== "string" || v.length > MOTIVO_MAX) {
      return erro('Valor inválido em "motivoTroca".');
    }
    if (!("setorRespId" in corpo) || corpo.setorRespId === null) {
      return erro("O motivo só vale junto com a troca de setor.");
    }
    if (v.trim() !== "") e.motivoTroca = v.trim();
  }

  if ("uf" in corpo) {
    const v = corpo.uf;
    if (typeof v !== "string" || !/^([A-Za-z]{2})?$/.test(v.trim())) {
      return erro("UF inválida.");
    }
    e.uf = v.trim().toUpperCase();
  }

  if ("devolucao" in corpo) {
    if (!DEVOLUCOES.includes(corpo.devolucao as Devolucao)) {
      return erro("Devolução inválida.");
    }
    e.devolucao = corpo.devolucao;
  }

  for (const campo of [
    "dataAbertura",
    "dataAcao",
    "dataRecebimento",
    "prazoMarketplace",
  ]) {
    if (!(campo in corpo)) continue;
    const v = corpo[campo];
    if (v === null || v === "") {
      if (campo === "dataAbertura") return erro("Informe a data de abertura.");
      e[campo] = null;
    } else if (typeof v !== "string" || !dataValida(v)) {
      return erro(`Data inválida em "${campo}".`);
    } else e[campo] = v;
  }

  if ("custos" in corpo) {
    const c = corpo.custos;
    if (!ehObjeto(c)) return erro("Custos inválidos.");
    const custos: Partial<Custos> = {};
    for (const [k, v] of Object.entries(c)) {
      if (!CAMPOS_CUSTO.includes(k as keyof Custos)) {
        return erro(`Custo não aceito: "${k}".`);
      }
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > CUSTO_MAX
      ) {
        return erro(`Valor inválido no custo "${k}".`);
      }
      custos[k as keyof Custos] = Math.round(v * 100) / 100;
    }
    e.custos = custos;
  }

  if (modo === "criar") {
    if (typeof e.canalId !== "string") return erro("Informe o canal.");
    if (typeof e.descricao !== "string" || e.descricao === "") {
      return erro("Descreva o que aconteceu.");
    }
  } else if (Object.keys(e).length === 0) {
    return erro("Nenhuma alteração enviada.");
  }

  return { ok: true, entrada: e as EntradaEscrita };
}

// ---------- Regras ----------

/** Referências que existem no banco. Causa leva o setor que ela direciona (regra manual incluída). */
export interface Referencias {
  canais: Set<string>;
  marcas: Set<string>;
  bancadas: Set<string>;
  setores: Set<string>;
  causaSetor: Map<string, string>;
}

export interface MudancaAuditada {
  campo: string;
  de?: unknown;
  para?: unknown;
  /** Texto livre não vai para a auditoria: só se registra que mudou. */
  alterado?: true;
}

export interface AuditoriaNova {
  usuarioId: string;
  usuarioNome: string;
  acao: "reclamacao.criar" | "reclamacao.editar";
  alvo: string;
  detalhe: string;
  reclamacaoId: string;
  extra: { mudancas: MudancaAuditada[]; motivo?: string };
}

export interface RegistroAtual {
  id: string;
  numero: number;
  estado: EstadoReclamacao;
}

/** A mudança de estado que acompanha a gravação. Vai para o histórico de estados na mesma transação. */
export interface TransicaoGravada {
  de: Estado;
  para: Estado;
  motivo: string;
  reabertura: boolean;
}

export interface RepositorioEscrita {
  referencias(): Promise<Referencias>;
  produtoPorCodigo(codigo: string): Promise<string | null>;
  obterAtual(where: Prisma.ReclamacaoWhereInput): Promise<RegistroAtual | null>;
  criar(args: {
    estado: EstadoReclamacao;
    situacao: Situacao;
    usuarioId: string;
    usuarioNome: string;
    auditar: (r: { id: string; numero: number }) => AuditoriaNova;
  }): Promise<{ id: string; numero: number }>;
  atualizar(args: {
    id: string;
    estado: EstadoReclamacao;
    situacao: Situacao;
    usuarioId: string;
    auditoria: AuditoriaNova;
    /** Nulo quando o estado não mudou. */
    transicao: TransicaoGravada | null;
  }): Promise<void>;
}

const TEXTO_LIVRE = new Set<string>([...CAMPOS_LONGOS, ...CAMPOS_CURTOS, "uf"]);

export function estadoVazio(canalId: string, hoje: string): EstadoReclamacao {
  return {
    canalId,
    marcaId: null,
    produtoId: null,
    bancadaId: null,
    causaId: null,
    causaManual: false,
    setorRespId: null,
    setorRespManual: false,
    devolucao: "NA",
    estado: "triagem",
    dataAbertura: hoje,
    dataAcao: null,
    dataRecebimento: null,
    prazoMarketplace: null,
    protocoloExterno: null,
    descricao: "",
    laudo: "",
    procedencia: "",
    solucao: "",
    observacao: "",
    garantia: "",
    pedido: "",
    clienteNome: "",
    cidade: "",
    uf: "",
    transportadora: "",
    peca: "",
    custos: {
      freteEnvio: 0,
      freteRetorno: 0,
      valorPeca: 0,
      estorno: 0,
      desconto: 0,
      guia: 0,
    },
  };
}

export function situacaoDe(e: EstadoReclamacao): Situacao {
  return situacao({ dataAcao: e.dataAcao, devolucao: e.devolucao });
}

/** Lista o que mudou entre dois estados. Texto livre só marca "alterado", sem copiar o conteúdo. */
export function compararEstados(
  antes: EstadoReclamacao | null,
  depois: EstadoReclamacao,
): MudancaAuditada[] {
  const mudancas: MudancaAuditada[] = [];
  const { custos: custosDepois, ...planoDepois } = depois;
  const planoAntes = antes as unknown as Record<string, unknown> | null;
  for (const [campo, valor] of Object.entries(planoDepois)) {
    const anterior = planoAntes?.[campo];
    if (planoAntes) {
      if (anterior === valor) continue;
    } else if (valor === "" || valor === null || valor === false) continue;
    mudancas.push(
      TEXTO_LIVRE.has(campo)
        ? { campo, alterado: true }
        : { campo, de: planoAntes ? anterior : null, para: valor },
    );
  }
  for (const k of CAMPOS_CUSTO) {
    const de = antes?.custos[k] ?? 0;
    if (de !== custosDepois[k]) {
      mudancas.push({ campo: `custos.${k}`, de, para: custosDepois[k] });
    }
  }
  return mudancas;
}

/** O que muda sozinho depois de qualquer gravação: a causa pelas palavras e o setor pela causa. */
function derivar(e: EstadoReclamacao, ref: Referencias): EstadoReclamacao {
  const r = { ...e };
  if (!r.causaManual) {
    const id = classificar({
      laudo: r.laudo,
      reclamacao: r.descricao,
      solucao: r.solucao,
    });
    r.causaId = CAUSA_POR_ID[id] && ref.causaSetor.has(id) ? id : null;
  }
  // O setor é sugestão da causa enquanto a causa é automática. A causa final escolhida pelo
  // setor não tira a reclamação dele sozinha: mudar de setor é troca explícita.
  if (!r.setorRespManual && (!r.causaManual || !r.setorRespId)) {
    r.setorRespId = r.causaId ? (ref.causaSetor.get(r.causaId) ?? null) : null;
  }
  return r;
}

function extraAuditoria(
  mudancas: MudancaAuditada[],
  entrada: EntradaEscrita,
): AuditoriaNova["extra"] {
  const trocou = mudancas.some((m) => m.campo === "setorRespId");
  return entrada.motivoTroca && trocou
    ? { mudancas, motivo: entrada.motivoTroca }
    : { mudancas };
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

/** Estados em que o setor já assumiu a reclamação: trocar o setor obriga o novo a receber. */
const ESTADOS_EM_ANDAMENTO: readonly Estado[] = ["recebida", "em_tratativa"];

/**
 * Efeito da gravação sobre a jornada. Registrar a data de ação resolve no setor técnico;
 * apagá-la volta a tratativa; trocar o setor de algo já assumido volta a "encaminhada".
 * O estado só anda assim ou por transição explícita (`jornada.ts`).
 */
function acertarEstado(
  base: EstadoReclamacao,
  e: EstadoReclamacao,
  entrada: EntradaEscrita,
  usuario: UsuarioLogado,
): { estado: EstadoReclamacao; motivo: string } {
  let destino = base.estado;
  let motivo = "";
  const resolveu =
    !base.dataAcao &&
    !!e.dataAcao &&
    base.estado !== "resolvida_setor" &&
    base.estado !== "finalizada";
  const limpou = !!base.dataAcao && !e.dataAcao;

  if (resolveu) {
    const r = validarTransicao({
      perfil: usuario.perfil,
      de: base.estado,
      para: "resolvida_setor",
      motivo: "Data de ação registrada na ficha.",
      devolucao: e.devolucao,
      temSetor: !!e.setorRespId,
    });
    if (!r.ok) {
      throw new ErroEscrita(
        r.codigo === "sem_permissao" ? 403 : 400,
        r.mensagem,
      );
    }
    destino = "resolvida_setor";
    motivo = "Data de ação registrada na ficha.";
  } else if (limpou) {
    if (base.estado === "finalizada") {
      throw new ErroEscrita(
        400,
        "Reabra a reclamação, com motivo, antes de apagar a data de ação.",
      );
    }
    if (base.estado === "resolvida_setor") {
      destino = "em_tratativa";
      motivo = "Data de ação removida.";
    }
  } else if (
    base.setorRespId !== e.setorRespId &&
    ESTADOS_EM_ANDAMENTO.includes(base.estado)
  ) {
    destino = "encaminhada";
    motivo = entrada.motivoTroca ?? "Setor responsável trocado.";
  }
  return { estado: { ...e, estado: destino }, motivo };
}

export class ServicoEscrita {
  constructor(
    private readonly repo: RepositorioEscrita,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Aplica a entrada validada sobre um estado e confere cada referência no banco. */
  private async aplicar(
    base: EstadoReclamacao,
    entrada: EntradaEscrita,
    usuario: UsuarioLogado,
    ref: Referencias,
  ): Promise<{ estado: EstadoReclamacao; motivoEstado: string }> {
    const e: EstadoReclamacao = { ...base, custos: { ...base.custos } };
    const solto = e as unknown as Record<string, unknown>;

    if (CAMPOS_DO_SETOR.some((k) => entrada[k] !== undefined)) {
      exigir(usuario, "reclamacoes.analisar");
    }

    if (entrada.canalId !== undefined) {
      if (!ref.canais.has(entrada.canalId)) {
        throw new ErroEscrita(400, "Canal inexistente.");
      }
      e.canalId = entrada.canalId;
    }
    if (entrada.marcaId !== undefined) {
      if (entrada.marcaId !== null && !ref.marcas.has(entrada.marcaId)) {
        throw new ErroEscrita(400, "Marca inexistente.");
      }
      e.marcaId = entrada.marcaId;
    }
    if (entrada.bancadaId !== undefined) {
      if (entrada.bancadaId !== null && !ref.bancadas.has(entrada.bancadaId)) {
        throw new ErroEscrita(400, "Bancada inexistente.");
      }
      e.bancadaId = entrada.bancadaId;
    }
    if (entrada.produtoCodigo !== undefined) {
      if (entrada.produtoCodigo === null) e.produtoId = null;
      else {
        const id = await this.repo.produtoPorCodigo(entrada.produtoCodigo);
        if (!id) throw new ErroEscrita(400, "Produto não encontrado.");
        e.produtoId = id;
      }
    }

    // Causa: escolher à mão trava a causa; `null` volta para o cálculo pelas palavras.
    if (entrada.causaId !== undefined) {
      if (entrada.causaId === null) {
        e.causaManual = false;
      } else {
        if (!ref.causaSetor.has(entrada.causaId)) {
          throw new ErroEscrita(400, "Causa inexistente.");
        }
        e.causaId = entrada.causaId;
        e.causaManual = true;
      }
    }

    // Setor: a troca manual é do gestor. `null` devolve ao setor da causa.
    if (entrada.setorRespId !== undefined) {
      exigir(usuario, "reclamacoes.trocar_setor");
      if (entrada.setorRespId === null) {
        e.setorRespManual = false;
      } else {
        if (!ref.setores.has(entrada.setorRespId)) {
          throw new ErroEscrita(400, "Setor inexistente.");
        }
        e.setorRespId = entrada.setorRespId;
        e.setorRespManual = true;
      }
    }

    for (const campo of [...CAMPOS_CURTOS, ...CAMPOS_LONGOS, "uf"] as const) {
      const v = entrada[campo];
      if (v !== undefined) solto[campo] = v;
    }
    for (const campo of [
      "devolucao",
      "dataAbertura",
      "dataAcao",
      "dataRecebimento",
      "prazoMarketplace",
    ] as const) {
      const v = entrada[campo];
      if (v !== undefined) solto[campo] = v;
    }
    if (entrada.custos) Object.assign(e.custos, entrada.custos);

    // Tratativa só depois do produto recebido, ou sem devolução.
    const mexeuNaTratativa =
      entrada.dataAcao !== undefined ||
      entrada.devolucao !== undefined ||
      entrada.dataRecebimento !== undefined;
    if (mexeuNaTratativa) {
      if (e.dataAcao && e.devolucao === "AGUARDANDO") {
        throw new ErroEscrita(
          400,
          "Registre o recebimento do produto antes da data de ação.",
        );
      }
      if (e.dataRecebimento && e.devolucao === "NA") {
        throw new ErroEscrita(
          400,
          "Há data de recebimento, mas a devolução está como sem devolução.",
        );
      }
      if (e.dataAcao && e.dataAcao < e.dataAbertura) {
        throw new ErroEscrita(400, "A data de ação vem antes da abertura.");
      }
    }

    const { estado, motivo } = acertarEstado(
      base,
      derivar(e, ref),
      entrada,
      usuario,
    );
    return { estado, motivoEstado: motivo };
  }

  async criar(
    entrada: EntradaEscrita,
    usuario: UsuarioLogado,
  ): Promise<{ id: string; numero: number }> {
    exigir(usuario, "reclamacoes.criar");
    const ref = await this.repo.referencias();
    const hoje = hojeEmSaoPaulo(this.agora());
    const base = estadoVazio("", entrada.dataAbertura ?? hoje);
    const { estado } = await this.aplicar(base, entrada, usuario, ref);
    if (estado.dataAbertura > hoje) {
      throw new ErroEscrita(400, "A data de abertura está no futuro.");
    }
    const mudancas = compararEstados(null, estado);
    return this.repo.criar({
      estado,
      situacao: situacaoDe(estado),
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      auditar: (r) => ({
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "reclamacao.criar",
        alvo: `Reclamação #${r.numero}`,
        detalhe: "Reclamação registrada.",
        reclamacaoId: r.id,
        extra: extraAuditoria(mudancas, entrada),
      }),
    });
  }

  async editar(
    id: string,
    entrada: EntradaEscrita,
    usuario: UsuarioLogado,
  ): Promise<{ id: string; numero: number; alterou: boolean }> {
    exigir(usuario, "reclamacoes.editar");
    const escopo: Escopo = {
      perfil: usuario.perfil,
      setores: usuario.setores,
      marcas: usuario.marcas,
    };
    const doEscopo = filtroDeEscopo(escopo);
    const where: Prisma.ReclamacaoWhereInput = doEscopo
      ? { AND: [{ id }, doEscopo] }
      : { id };
    // Fora do escopo é igual a não existir, como na leitura.
    const atual = await this.repo.obterAtual(where);
    if (!atual) throw new ErroEscrita(404, "Reclamação não encontrada.");

    const ref = await this.repo.referencias();
    const { estado, motivoEstado } = await this.aplicar(
      atual.estado,
      entrada,
      usuario,
      ref,
    );
    const mudancas = compararEstados(atual.estado, estado);
    if (mudancas.length === 0) {
      return { id: atual.id, numero: atual.numero, alterou: false };
    }
    await this.repo.atualizar({
      id: atual.id,
      estado,
      situacao: situacaoDe(estado),
      usuarioId: usuario.id,
      transicao:
        estado.estado === atual.estado.estado
          ? null
          : {
              de: atual.estado.estado,
              para: estado.estado,
              motivo: motivoEstado,
              reabertura: false,
            },
      auditoria: {
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "reclamacao.editar",
        alvo: `Reclamação #${atual.numero}`,
        detalhe: `Campos alterados: ${mudancas.map((m) => m.campo).join(", ")}.`,
        reclamacaoId: atual.id,
        extra: extraAuditoria(mudancas, entrada),
      },
    });
    return { id: atual.id, numero: atual.numero, alterou: true };
  }
}
