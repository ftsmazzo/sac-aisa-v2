import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import type {
  AuditoriaIa,
  CausaIa,
  FonteConfigIa,
  PerfilIa,
  PerguntaIa,
  ReclamacaoParaIa,
  RegistroGravado,
  RegistroNovo,
  RepositorioIa,
  RespostaRegistrada,
} from "./ia";
import type { PedidoIa, ProvedorIa, RespostaIa } from "./provedor";

export const AGORA = () => new Date("2026-10-22T15:00:00Z");

export function usuario(
  perfil: Perfil,
  extra: Partial<UsuarioLogado> = {},
): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: `Pessoa ${perfil}`,
    perfil,
    setores: [],
    marcas: [],
    permissoes: mesclarPermissoes(perfil, []),
    ...extra,
  };
}

export const CAUSAS_TESTE: CausaIa[] = [
  {
    id: "eletrico",
    nome: "Falha elétrica",
    categoria: "Produto",
    setorId: "s-q",
    setorNome: "Qualidade",
  },
  {
    id: "avaria",
    nome: "Avaria no transporte",
    categoria: "Transporte",
    setorId: "s-l",
    setorNome: "Logística",
  },
  {
    id: "kit",
    nome: "Kit faltando",
    categoria: "Item faltando",
    setorId: "s-e",
    setorNome: "Embalagem",
  },
  {
    id: "outros",
    nome: "Outros",
    categoria: "Outros",
    setorId: "s-o",
    setorNome: "SAC",
  },
];

const base = {
  tipo: "texto" as const,
  obrigatoria: true,
  ativa: true,
  exemplo: "",
  opcoes: [] as string[],
  padrao: false,
};

export const PERGUNTAS_TESTE: PerguntaIa[] = [
  {
    ...base,
    id: "p1",
    chave: "voltagem_tomada",
    categoria: "eletrica",
    texto: "Qual a voltagem da tomada?",
    tipo: "escolha",
    opcoes: ["110 V", "220 V"],
    ordem: 10,
    regras: [{ causaIds: ["eletrico"] }],
  },
  {
    ...base,
    id: "p2",
    chave: "extensao",
    categoria: "eletrica",
    texto: "Usa extensao?",
    ordem: 20,
    regras: [{ causaIds: ["eletrico"] }],
  },
  {
    ...base,
    id: "p3",
    chave: "local_dano",
    categoria: "embalagem",
    texto: "Onde estava o dano?",
    ordem: 10,
    regras: [{ causaIds: ["avaria"] }],
  },
  {
    ...base,
    id: "p4",
    chave: "inativa",
    categoria: "x",
    texto: "Pergunta desligada",
    ativa: false,
    ordem: 1,
    regras: [{ causaIds: ["eletrico"] }],
  },
];

export const PERFIL_TESTE: PerfilIa = {
  versao: 1,
  descricao: "",
  missao: "",
  valores: "",
  metas: "",
  tomDeVoz: "Cordial e direto.",
  dizer: "Agradecer.",
  evitar: "Prometer prazo.",
  assinatura: "Equipe SAC {marca}",
  exemplos: [],
  padrao: true,
  nota: "",
  publicadaEm: "2026-10-22T00:00:00.000Z",
  publicadaPorNome: "Teste",
};

export const RECLAMACAO_TESTE: ReclamacaoParaIa = {
  id: "r1",
  numero: 7,
  descricao:
    "O produto nao liga. Sou Maria Souza, telefone (11) 91234-5678, maria@exemplo.com. Pedido 20001234567.",
  produto: { codigo: "F10", nome: "Fritadeira 10L", familia: "FRITADEIRA" },
  canal: "Mercado Livre",
  marca: "AISA",
  clienteNome: "Maria Souza",
  pedido: "20001234567",
  causaId: null,
};

export interface EstadoRepo {
  registros: (RegistroGravado & { reclamacaoId: string })[];
  respostas: (RespostaRegistrada & { reclamacaoId: string })[];
  auditorias: AuditoriaIa[];
  escritasProibidas: string[];
  origens: { campo: string; origem: string; aceite: string | null }[];
  consumo: { chamadas: number; custoUsd: number };
  reclamacao: ReclamacaoParaIa | null;
  perguntas: PerguntaIa[];
  perfil: PerfilIa | null;
}

/** Repositório em memória. Só tem os métodos de IA: não existe como gravar causa, setor nem estado. */
export function repoFalso(parcial: Partial<EstadoRepo> = {}) {
  const e: EstadoRepo = {
    registros: [],
    respostas: [],
    auditorias: [],
    escritasProibidas: [],
    origens: [],
    consumo: { chamadas: 0, custoUsd: 0 },
    reclamacao: RECLAMACAO_TESTE,
    perguntas: PERGUNTAS_TESTE,
    perfil: PERFIL_TESTE,
    ...parcial,
  };
  const repo: RepositorioIa = {
    async reclamacao(id) {
      return e.reclamacao && e.reclamacao.id === id ? e.reclamacao : null;
    },
    async causas() {
      return CAUSAS_TESTE;
    },
    async perguntas() {
      return e.perguntas;
    },
    async perfil() {
      return e.perfil;
    },
    async respostas(id) {
      return e.respostas.filter((r) => r.reclamacaoId === id);
    },
    async consumo() {
      return e.consumo;
    },
    async gravarRegistro(r: RegistroNovo) {
      const id = `reg${e.registros.length + 1}`;
      e.registros.unshift({
        ...r,
        id,
        aceite: null,
        causaEscolhidaId: null,
        textoFinal: null,
        criadoEm: AGORA().toISOString(),
      });
      return id;
    },
    async registro(id) {
      return e.registros.find((r) => r.id === id) ?? null;
    },
    async ultimos(id) {
      return e.registros.filter((r) => r.reclamacaoId === id);
    },
    async casoParaResposta() {
      return null;
    },
    async casosFinalizados() {
      return [];
    },
    async aceitar(id, d, auditoria) {
      const r = e.registros.find((x) => x.id === id);
      if (r) {
        r.aceite = d.aceite;
        r.causaEscolhidaId = d.causaEscolhidaId;
        r.textoFinal = d.textoFinal;
      }
      if (d.origemCampo) e.origens.push(d.origemCampo);
      e.auditorias.push(auditoria);
    },
    async qualidade() {
      return {
        grupos: [],
        reclamacoes: 0,
        importadas: 0,
        minutosEmTriagem: [],
      };
    },
    async gravarResposta(r, auditoria) {
      e.respostas = e.respostas.filter(
        (x) => !(x.reclamacaoId === r.reclamacaoId && x.chave === r.chave),
      );
      e.respostas.push({
        reclamacaoId: r.reclamacaoId,
        chave: r.chave,
        valor: r.valor,
        dispensada: r.dispensada,
        origem: r.origem,
        textoPergunta: r.textoPergunta,
      });
      e.auditorias.push(auditoria);
    },
  };
  return { repo, e };
}

export function fonteFalsa(
  chave: string | null,
  config: Record<string, unknown> = {},
): FonteConfigIa {
  return { chave: async () => chave, config: async () => config };
}

/** Provedor simulado: devolve as respostas na ordem e guarda cada pedido para conferir o prompt. */
export function provedorFalso(
  respostas: (string | Error | ((p: PedidoIa) => string))[],
) {
  const pedidos: PedidoIa[] = [];
  const provedor: ProvedorIa = {
    async completar(p): Promise<RespostaIa> {
      pedidos.push(p);
      const r = respostas[Math.min(pedidos.length - 1, respostas.length - 1)];
      if (r instanceof Error) throw r;
      const texto = typeof r === "function" ? r(p) : r;
      return {
        texto,
        tokensEntrada: 400,
        tokensSaida: 80,
        custoUsd: 0.0002,
        modelo: p.modelo,
      };
    },
  };
  return { provedor, pedidos };
}

export const TRIAGEM_OK = JSON.stringify({
  causaId: "eletrico",
  confianca: 0.86,
  sintese: "Produto nao liga desde a primeira vez.",
  respondidas: [{ chave: "voltagem_tomada", valor: "220 V" }],
});

export const PERGUNTA_OK = JSON.stringify({
  mensagem:
    "Ola, {{nome_cliente}}! Pode nos contar se usa extensao ou estabilizador?",
  perguntaChaves: ["extensao"],
});
