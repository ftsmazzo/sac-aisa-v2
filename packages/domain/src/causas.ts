import {
  type CausaDef,
  clean,
  type Origem,
  type ReclamacaoLike,
  stripAcc,
  U,
} from "./base";

type MatchFn = (L: string, T: string) => boolean;

const R = {
  faltando: (L: string, T: string) =>
    /FALTANDO/.test(L) ||
    /FALTOU|FOI FALTANDO|NAO FOI ENVIADO|NAO FORAM ENVIADOS/.test(T),
  errado: (L: string) => /ERRADO/.test(L),
};

interface CausaInternal extends CausaDef {
  t: MatchFn;
}

export const CAUSAS: CausaInternal[] = [
  {
    id: "prazo",
    cat: "Prazo e entrega",
    nome: "Prazo de produção / entrega",
    setor: "PCP",
    acao: "Comparar o prazo prometido no anúncio com a capacidade real de produção e avisar o cliente antes de vencer.",
    t: (L, T) =>
      /PRAZO|ATRASO/.test(L) ||
      /PRAZO|ATRASO NO ENVIO|TEMPO DE PRODUCAO|AGUARDAR/.test(T),
  },
  {
    id: "entrega",
    cat: "Prazo e entrega",
    nome: "Extravio / entrega não realizada",
    setor: "Logística",
    acao: "Abrir ocorrência na transportadora, reenviar ou estornar rápido e avaliar troca de transportadora nas rotas com recorrência.",
    t: (L, T) =>
      /TRANSPORTE|ENTREGA/.test(L) ||
      /EXTRAVI|PERDEU A|NAO (QUIS )?(REALIZ|EFETU)\w* A ENTREGA|NAO REALIZOU A ENTREGA|NAO EFETUOU A ENTREGA|FILIAL DO DESTINO/.test(
        T,
      ),
  },
  {
    id: "anuncio",
    cat: "Venda e cadastro",
    nome: "Anúncio / cadastro divergente",
    setor: "Comercial / Anúncios",
    acao: "Conferir título, fotos, variação e SKU do anúncio antes de publicar ou alterar.",
    t: (_L, T) =>
      /ANUNCIO|ALTERADO SKU|SKU NO ML|SITE PUXOU|CODIGO DIFERENTE/.test(T),
  },
  {
    id: "lancamento",
    cat: "Venda e cadastro",
    nome: "Erro de lançamento do pedido",
    setor: "Comercial / Pedidos",
    acao: "Dupla checagem de código × descrição na digitação do pedido.",
    t: (_L, T) => /LANCADO|LANCAMENTO/.test(T),
  },
  {
    id: "arrepend",
    cat: "Venda e cadastro",
    nome: "Cliente desistiu / produto não atendeu",
    setor: "Comercial / Anúncios",
    acao: "Oferecer orientação ou troca antes do estorno e revisar o que o anúncio promete.",
    t: (L, T) =>
      /ARREPEN/.test(L) ||
      /DESIST|NAO ATENDEU|NAO CONSEGUE FAZER|ACHOU .*PEQUENO|NAO SUPORTA CORTAR|NAO COMPORTA|AGRADOU|OPTOU PELA/.test(
        T,
      ),
  },
  {
    id: "pecas",
    cat: "Venda e cadastro",
    nome: "Compra de peça / assistência (não é falha)",
    setor: "SAC / Pós-venda",
    acao: "Tratar como venda de peça de reposição, fora do indicador de reclamações.",
    t: (L) => /ASSISTENCIA|REPOSICAO/.test(L),
  },
  {
    id: "manipulo",
    cat: "Produto",
    nome: "Manípulo quebrado (máquinas de corte e vinco)",
    setor: "Qualidade / Engenharia",
    acao: "Avaliar reforço do manípulo ou da embalagem e acompanhar a recorrência por modelo.",
    t: (_L, T) => /MANIPULO|MANOPLA/.test(T) && /QUEBRAD|QUEBROU/.test(T),
  },
  {
    id: "voltagem",
    cat: "Envio errado",
    nome: "Voltagem errada",
    setor: "Montagem",
    acao: "Conferir a voltagem na montagem e na expedição, com checklist e foto da etiqueta.",
    t: (L, T) =>
      R.errado(L) &&
      /VOLTAGEM|\b(110|127|220) ?V?\b.*\b(110|127|220) ?V?\b/.test(T),
  },
  {
    id: "cubas",
    cat: "Envio errado",
    nome: "Cubas trocadas (inox × acrílico)",
    setor: "Montagem",
    acao: "Conferir o material das cubas contra o pedido antes de fechar a condimentadora.",
    t: (L, T) => R.errado(L) && /CUBA/.test(T) && /ACRIL|ACRI\b|INOX/.test(T),
  },
  {
    id: "erro_envio",
    cat: "Envio errado",
    nome: "Produto, modelo ou tamanho trocado",
    setor: "Embalagem / Expedição",
    acao: "Conferência por código na separação e na embalagem antes de fechar a caixa.",
    t: (L) => R.errado(L),
  },
  {
    id: "kit",
    cat: "Item faltando",
    nome: "Kit de montagem faltando (parafusos, mãos francesas, pés)",
    setor: "Embalagem / Expedição",
    acao: "Padronizar o kit de montagem por produto e conferir por checklist na embalagem.",
    t: (L, T) =>
      R.faltando(L, T) &&
      /PARAFUSO|MAO(S)? FRANCESA|PEZINHO|KIT DE PE|\bPES\b|APOIO|ADESIVO|BORRACHA|MONTAGEM|COLUNA/.test(
        T,
      ),
  },
  {
    id: "unidade",
    cat: "Item faltando",
    nome: "Unidade ou produto faltando no pedido",
    setor: "Embalagem / Expedição",
    acao: "Conferir quantidade de volumes e de unidades contra o pedido antes do despacho.",
    t: (L, T) =>
      R.faltando(L, T) &&
      (/COMPR(OU|ADO)S? ?(\d+|DOIS|TRES|QUATRO)\b.*\b(APENAS|SOMENTE|ENVIARAM? (1|UM)|SO FOI|CHEGOU (1|UM))\b/.test(
        T,
      ) ||
        /FALTOU (UM |UMA |O |A )?[GFABMK]\d+/.test(T) ||
        /NO PEDIDO DO CLIENTE/.test(T)),
  },
  {
    id: "item",
    cat: "Item faltando",
    nome: "Acessório ou peça faltando (manivela, cubas, tampas...)",
    setor: "Embalagem / Expedição",
    acao: "Checklist de acessórios por produto na embalagem.",
    t: (L, T) => R.faltando(L, T),
  },
  {
    id: "ferrugem",
    cat: "Fabricação",
    nome: "Ferrugem / oxidação",
    setor: "Pintura / Acabamento",
    acao: "Revisar tratamento, secagem e proteção contra umidade na embalagem.",
    t: (L, T) => /FERRUJ|FERRJ|OXID/.test(L + " " + T),
  },
  {
    id: "solda",
    cat: "Fabricação",
    nome: "Solda soltando ou sem solda",
    setor: "Solda",
    acao: "Inspeção de solda no controle final e reforço dos pontos dos paneleiros e suportes.",
    t: (_L, T) =>
      /SOLDA|SOLDAD/.test(T) ||
      (/PANEL(EI|IE)RO/.test(T) && /SOLT|PROBLEMA/.test(T)),
  },
  {
    id: "cuba_furada",
    cat: "Fabricação",
    nome: "Cuba da manteigueira furada",
    setor: "Solda",
    acao: "Verificar chapa e solda da cuba e testar estanqueidade antes de embalar.",
    t: (_L, T) => /CUBA/.test(T) && /FURO|FUROU|FURAD/.test(T),
  },
  {
    id: "pintura",
    cat: "Fabricação",
    nome: "Pintura / acabamento (riscado, arranhado)",
    setor: "Pintura / Acabamento",
    acao: "Inspeção visual final de pintura e acabamento.",
    t: (L, T) =>
      !/AVARIA/.test(L) && /PINTURA|ACABAMENTO|RISCAD|ARRANHAD/.test(T),
  },
  {
    id: "avaria",
    cat: "Transporte",
    nome: "Avaria no transporte / embalagem",
    setor: "Logística",
    acao: "Abrir sinistro na transportadora e reforçar proteção nos produtos mais avariados.",
    t: (L, T) =>
      /AVARIA/.test(L) ||
      /AMASS|QUEBRAD|DANIFIC|TORT[AO]|RACHAD|PANCADA|AVARIA/.test(T),
  },
  {
    id: "eletrico",
    cat: "Produto",
    nome: "Falha elétrica / componente",
    setor: "Qualidade / Engenharia",
    acao: "Teste elétrico final antes de embalar e avaliar o fornecedor do componente mais recorrente.",
    t: (_L, T) =>
      /NAO LIGA|NAO LIGOU|NAO ESQUENTA|NAO ESQUENTOU|NAO AQUECE|NAO ESTAVA ESQUENTANDO|QUEIM|FUSIVEL|LAMPADA|ESTALO|ESTOURO|CHOQUE|CURTO|FAISCA|TERMOSTATO|CONTROLADOR|RESISTENCIA|AQUECE DEMAIS|AQUECENDO|SUPERAQUEC|DERRETEU|PAROU DE FUNCIONAR|NAO FUNCIONA|MAU CONTATO|MAL CONTATO|SOQUETE|PISCA|NAO PEGOU|NAO PEGA/.test(
        T,
      ),
  },
  {
    id: "furacao",
    cat: "Fabricação",
    nome: "Furação / encaixe / dimensão",
    setor: "Corte e Dobra",
    acao: "Conferir furação, dobra e encaixe com gabarito.",
    t: (_L, T) =>
      /FURAC|NAO BATE|NAO ENCAIXA|DESENCAIXAD|ENTORT|CILINDRO NAO|NAO SOBE/.test(
        T,
      ),
  },
  {
    id: "defeito",
    cat: "Produto",
    nome: "Defeito de produto (outros)",
    setor: "Qualidade / Engenharia",
    acao: "Analisar caso a caso e registrar a causa raiz dos que se repetem.",
    t: (L) => /DEFEITO/.test(L),
  },
  {
    id: "outros",
    cat: "Outros",
    nome: "Outros / a classificar",
    setor: "SAC / Pós-venda",
    acao: "Classificar manualmente.",
    t: () => true,
  },
];

/**
 * Origem de cada causa. Só entram as que o catálogo já deixa claras: as demais
 * ficam sem origem até o cliente decidir (prazo, manípulo, ferrugem, pintura,
 * elétrico, furação, defeito e outros).
 */
export const ORIGEM_POR_CAUSA: Record<string, Origem> = {
  entrega: "transporte",
  avaria: "transporte",
  erro_envio: "embalagem",
  kit: "embalagem",
  unidade: "embalagem",
  item: "embalagem",
  voltagem: "montagem",
  cubas: "montagem",
  solda: "montagem",
  cuba_furada: "montagem",
  anuncio: "venda",
  lancamento: "venda",
  arrepend: "venda",
  pecas: "venda",
};

export const CAUSA_POR_ID: Record<string, CausaDef> = Object.fromEntries(
  CAUSAS.map(({ t: _t, ...c }) => [
    c.id,
    { ...c, origem: ORIGEM_POR_CAUSA[c.id] ?? null },
  ]),
);

export function classificar(r: ReclamacaoLike): string {
  return classificarTodas(r, 1)[0] || "outros";
}

/**
 * Causas genéricas/catch-all: se alguma específica da família já entrou, omitir a genérica.
 * Ex.: kit + item → só kit; voltagem + erro_envio → só voltagem.
 * Não suprime pares legítimos (avaria + eletrico = amassado e falha elétrica).
 */
const GENERICA_SUPRIMIDA_POR: Record<string, readonly string[]> = {
  item: ["kit", "unidade"],
  erro_envio: ["voltagem", "cubas"],
  defeito: [
    "manipulo",
    "eletrico",
    "furacao",
    "cuba_furada",
    "solda",
    "ferrugem",
    "pintura",
    "avaria",
  ],
  // "quebrado" no texto do manípulo também dispara avaria; manípulo é o motivo certo
  avaria: ["manipulo"],
};

/** Todas as causas que batem no texto (máx. 5), sem genéricas redundantes. */
export function classificarTodas(r: ReclamacaoLike, max = 5): string[] {
  const L = stripAcc(U(r.laudo));
  const T = stripAcc(U(`${r.reclamacao || ""} ${r.solucao || ""}`));
  const brutos: string[] = [];
  for (const c of CAUSAS) {
    if (c.id === "outros") continue;
    if (c.t(L, T)) brutos.push(c.id);
  }
  const ids = brutos.filter((id) => {
    const especificas = GENERICA_SUPRIMIDA_POR[id];
    if (!especificas) return true;
    return !especificas.some((esp) => brutos.includes(esp));
  });
  const cortados = ids.slice(0, max);
  return cortados.length ? cortados : ["outros"];
}

const PECAS: [string, RegExp][] = [
  ["Placa de gelo", /PLACAS? DE GELO|BOLSA DE GELO/],
  ["Kit de parafusos", /PARAFUSO/],
  ["Mão francesa", /MAOS? FRANCESA/],
  ["Fusível / porta-fusível", /FUSIVEL|FUSIVEIS/],
  ["Lâmpada", /LAMPADA/],
  ["Termostato", /TERMOSTATO/],
  ["Resistência", /RESISTENCIA|\bRESIS\b/],
  ["Manípulo", /MANIPULO|MANOPLA/],
  ["Manivela", /MANIVELA/],
  ["Rolo / eixo / rolamento", /ROLO|EIXO|ROLAMENTO|CILINDRO/],
  ["Cubas", /CUBA/],
  ["Tampa / tampo", /TAMPA|TAMPINHA|TAMPO/],
  ["Paneleiro", /PANEL(EI|IE)RO/],
  ["Pés / apoios", /\bPES?\b|PEZINHO|APOIO/],
  ["Adesivo", /ADESIVO/],
  ["Tensor / anilha / mola", /TENSOR|ANILHA|\bMOLA\b/],
  ["Molde", /MOLDE/],
  ["Espátulas", /ESPATULA/],
  ["Máquina de fuxico", /FUXICO/],
  ["Golfrador", /GOLFRADOR/],
  ["Laterais / base", /LATERA(L|IS)|\bBASE\b/],
  ["Placa / controlador", /PLACA|CONTROLADOR|SISTEMA ELETRICO/],
  ["Cabo / plugue", /\bCABO\b|\bFIO\b|PLUGUE/],
];

export function detectarPeca(r: ReclamacaoLike): string {
  const T = stripAcc(U(`${r.reclamacao || ""} ${r.solucao || ""}`));
  const m = PECAS.find((p) => p[1].test(T));
  return m ? m[0] : "";
}

export function causaDe(
  r: ReclamacaoLike,
  overrides: Record<string, Partial<CausaDef>> = {},
): CausaDef {
  const id =
    r.causaManual && r.causaId && CAUSA_POR_ID[r.causaId]
      ? r.causaId
      : classificar(r);
  const base = CAUSA_POR_ID[id] || CAUSA_POR_ID.outros;
  const o = overrides[base.id] || {};
  return { ...base, setor: o.setor || base.setor, acao: o.acao || base.acao };
}

export const setorResp = (
  r: ReclamacaoLike,
  overrides: Record<string, Partial<CausaDef>> = {},
) => clean(r.setorRespManual) || causaDe(r, overrides).setor;

export const pecaDe = (r: ReclamacaoLike) => clean(r.peca) || detectarPeca(r);
