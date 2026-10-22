import {
  CAUSAS,
  classificarTodas,
  type Devolucao,
  ORIGEM_POR_CAUSA,
  type ReclamacaoLike,
  SETORES_RESP,
  setorResp,
  situacao,
} from "@sac-aisa/domain";

export type Valor = string | number | boolean | null;
export type Linha = Record<string, Valor>;

export interface Tabelas {
  marcas: Linha[];
  canais: Linha[];
  bancadas: Linha[];
  setores: Linha[];
  produtos: Linha[];
  causas: Linha[];
  reclamacoes: Linha[];
  custos: Linha[];
  reclamacao_causas: Linha[];
  usuarios: Linha[];
  vendas_dia: Linha[];
}

export interface Relatorio {
  lidas: number;
  importadas: number;
  semData: number[];
  causaDefinidaNoBackup: number;
  causaInferida: number;
  semCanal: number;
  semSku: number;
  produtosCriadosDasReclamacoes: number;
  contagens: Record<string, number>;
  usuariosInativos: number;
  vendasLidas: number;
  ignorados: { fotos: number; auditoria: number };
  avisos: string[];
}

/** Causa gravada para uma reclamação (tabela reclamacao_causas do sac-renato). */
export interface CausaExtraLegada {
  reclamacaoId: string;
  causaId: string;
  primaria: boolean;
  ordem: number;
}

export interface VendaLegada {
  sku: string;
  descricao?: string;
  data: string;
  quantidade: number;
}

export interface UsuarioLegado {
  login: string;
  nome: string;
  perfil: string;
  ativo?: boolean;
  telefone?: string | null;
}

/**
 * Backup do sac-renato. Vem do JSON exportado pelo sistema ou da extração do dump
 * (`scripts/extrair-dump.py`), que acrescenta causas gravadas, vendas e usuários.
 */
export interface BackupLegado {
  regs: RegistroLegado[];
  causasExtras?: CausaExtraLegada[];
  vendas?: VendaLegada[];
  usuarios?: UsuarioLegado[];
  /** Contagem de fotos, quando a extração só informa o total. */
  fotos?: number;
  auditoria?: unknown[];
}

export interface RegistroLegado extends ReclamacaoLike {
  reg: number;
  data: string;
  fotos?: unknown[];
  garantia?: string | null;
  transp?: string | null;
  criadoEm?: string;
  alteradoEm?: string;
}

const CANAIS: Record<
  string,
  { nome: string; tipo: "interno" | "marketplace" }
> = {
  SITE: { nome: "Site", tipo: "interno" },
  WHATSAPP: { nome: "WhatsApp", tipo: "interno" },
  "MERCADO LIVRE": { nome: "Mercado Livre", tipo: "marketplace" },
  SHOPEE: { nome: "Shopee", tipo: "marketplace" },
  MAGALU: { nome: "Magalu", tipo: "marketplace" },
};
const CANAL_NAO_INFORMADO = { nome: "Não informado", tipo: "interno" } as const;
/** Erros de digitação vistos no sistema antigo. */
const CANAL_ALIAS: Record<string, string> = { SHOPPE: "SHOPEE" };

const PERFIL_NOVO: Record<string, string> = {
  master: "administrador",
  gestor: "gestor",
  operador: "operacao",
};
/** Hash que nunca confere com senha nenhuma: o usuário só entra depois de ter senha nova. */
const SENHA_NAO_DEFINIDA = "!sem-senha-importado";

const MARCAS_ALIAS: Record<string, string> = { ARTAMQ: "ARTMAQ" };

const CATEGORIA_PRODUTO: Record<string, string> = {
  P: "PRODUTO AISA",
  R: "PRODUTO ARAUCA",
  T: "PRODUTO ARTMAQ",
  C: "COMPONENTE",
  X: "PRODUTO INATIVO",
};

const limpar = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
const maiuscula = (s: unknown) => limpar(s).toUpperCase();

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Aceita AAAA-MM-DD (com ou sem hora) e confere se o dia existe. */
export function paraData(s: unknown): string | null {
  const m = limpar(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const ok =
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d;
  return ok ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "SETOR 04.2" vira "04.2"; ADMIN e USINAGEM ficam como estão. */
export function codigoBancada(setor: unknown): string | null {
  const s = maiuscula(setor);
  if (!s) return null;
  return s.replace(/^SETOR\s+/, "");
}

export function parseCatalogoProdutos(texto: string) {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [cod, , nome, st, cat, fam] = l.split("|");
      return {
        codigo: limpar(cod),
        nome: limpar(nome),
        ativo: st !== "I",
        categoria: CATEGORIA_PRODUTO[limpar(cat)] ?? "",
        familia: limpar(fam),
      };
    })
    .filter((p) => p.codigo);
}

function dinheiro(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function instante(v: unknown, reserva: string): string {
  const s = limpar(v);
  return s && !Number.isNaN(Date.parse(s))
    ? new Date(s).toISOString()
    : `${reserva}T00:00:00.000Z`;
}

export function converterBackup(
  backup: BackupLegado,
  opcoes: { catalogoProdutos?: string } = {},
): { tabelas: Tabelas; relatorio: Relatorio } {
  const relatorio: Relatorio = {
    lidas: backup.regs.length,
    importadas: 0,
    semData: [],
    causaDefinidaNoBackup: 0,
    causaInferida: 0,
    semCanal: 0,
    semSku: 0,
    produtosCriadosDasReclamacoes: 0,
    contagens: {},
    usuariosInativos: 0,
    vendasLidas: backup.vendas?.length ?? 0,
    ignorados: {
      fotos:
        backup.fotos ??
        backup.regs.reduce((n, r) => n + (r.fotos?.length ?? 0), 0),
      auditoria: backup.auditoria?.length ?? 0,
    },
    avisos: [],
  };

  const marcas = new Map<string, Linha>();
  const canais = new Map<string, Linha>();
  const bancadas = new Map<string, Linha>();
  const produtos = new Map<string, Linha>();
  const reclamacoes: Linha[] = [];
  const custos: Linha[] = [];
  const extras: Linha[] = [];
  const causasValidas = new Set(CAUSAS.map((c) => c.id));
  const gravadasPorReclamacao = new Map<string, CausaExtraLegada[]>();
  for (const e of backup.causasExtras ?? []) {
    const lista = gravadasPorReclamacao.get(e.reclamacaoId) ?? [];
    lista.push(e);
    gravadasPorReclamacao.set(e.reclamacaoId, lista);
  }

  const setores: Linha[] = SETORES_RESP.map((nome) => ({
    id: `setor-${slug(nome)}`,
    nome,
    ativo: true,
  }));
  const setorId = (nome: string) => `setor-${slug(nome)}`;

  const causas: Linha[] = CAUSAS.map((c, i) => ({
    id: c.id,
    categoria: c.cat,
    nome: c.nome,
    origem: ORIGEM_POR_CAUSA[c.id] ?? null,
    acao: c.acao,
    ordem: i,
    setorId: setorId(c.setor),
  }));

  for (const p of parseCatalogoProdutos(opcoes.catalogoProdutos ?? "")) {
    produtos.set(p.codigo, {
      id: `produto-${slug(p.codigo)}`,
      codigo: p.codigo,
      nome: p.nome,
      familia: p.familia,
      categoria: p.categoria,
      ativo: p.ativo,
    });
  }

  const garantirMarca = (nome: string) => {
    if (!marcas.has(nome)) {
      marcas.set(nome, { id: `marca-${slug(nome)}`, nome, ativa: true });
    }
    return `marca-${slug(nome)}`;
  };
  const garantirCanal = (def: { nome: string; tipo: string }) => {
    if (!canais.has(def.nome)) {
      canais.set(def.nome, {
        id: `canal-${slug(def.nome)}`,
        nome: def.nome,
        tipo: def.tipo,
        ativo: true,
      });
    }
    return `canal-${slug(def.nome)}`;
  };
  const garantirBancada = (codigo: string) => {
    if (!bancadas.has(codigo)) {
      bancadas.set(codigo, {
        id: `bancada-${slug(codigo)}`,
        codigo,
        nome: /^\d/.test(codigo) ? `Bancada ${codigo}` : codigo,
        ativa: true,
      });
    }
    return `bancada-${slug(codigo)}`;
  };

  for (const r of backup.regs) {
    const abertura = paraData(r.data);
    if (!abertura) {
      relatorio.semData.push(r.reg);
      continue;
    }

    const empresa = maiuscula(r.empresa);
    const marcaNome = MARCAS_ALIAS[empresa] ?? empresa;
    const marcaId = marcaNome ? garantirMarca(marcaNome) : null;

    const canalBruto = maiuscula(r.canal);
    const canalDef = CANAIS[CANAL_ALIAS[canalBruto] ?? canalBruto];
    if (!canalDef) relatorio.semCanal++;
    const canalId = garantirCanal(canalDef ?? CANAL_NAO_INFORMADO);

    const codigoBanc = codigoBancada(r.setor);
    const bancadaId = codigoBanc ? garantirBancada(codigoBanc) : null;

    const sku = maiuscula(r.sku);
    let produtoId: string | null = null;
    if (sku) {
      if (!produtos.has(sku)) {
        produtos.set(sku, {
          id: `produto-${slug(sku)}`,
          codigo: sku,
          nome: limpar(r.produto) || sku,
          familia: limpar(r.familia),
          categoria: "",
          ativo: true,
        });
        relatorio.produtosCriadosDasReclamacoes++;
      }
      produtoId = `produto-${slug(sku)}`;
    } else {
      relatorio.semSku++;
    }

    // Causas gravadas no sistema antigo valem mais que a regra: primeiro a primária.
    const gravadas = [
      ...new Set(
        (gravadasPorReclamacao.get(String(r.id)) ?? [])
          .filter((e) => causasValidas.has(e.causaId))
          .sort(
            (a, b) =>
              Number(b.primaria) - Number(a.primaria) || a.ordem - b.ordem,
          )
          .map((e) => e.causaId),
      ),
    ];
    const manualNoBackup = !!(r.causaManual && r.causaId);
    const definida = gravadas.length > 0 || manualNoBackup;
    const ids = gravadas.length
      ? gravadas
      : manualNoBackup
        ? [String(r.causaId)]
        : classificarTodas(r as ReclamacaoLike);
    if (definida) relatorio.causaDefinidaNoBackup++;
    else relatorio.causaInferida++;
    const causaId = ids[0];

    const devolucao = (
      ["AGUARDANDO", "RECEBIDO"].includes(String(r.devolucao))
        ? r.devolucao
        : "NA"
    ) as Devolucao;
    const dataAcao = paraData(r.dataAcao);
    const dataRecebimento = paraData(r.dataRecebimento);
    const situ = situacao({ dataAcao, devolucao });

    const manual = limpar(r.setorRespManual);
    const manualValido = (SETORES_RESP as readonly string[]).includes(manual);
    const setorNome = setorResp({
      ...r,
      causaManual: definida,
      causaId,
      devolucao,
    } as ReclamacaoLike);

    const id = `imp-${r.reg}`;
    reclamacoes.push({
      id,
      numero: r.reg,
      protocoloExterno: limpar(r.protocolo) || null,
      marcaId,
      canalId,
      produtoId,
      bancadaId,
      causaId,
      setorRespId: setorId(manualValido ? manual : setorNome),
      setorRespManual: manualValido,
      causaManual: definida,
      situacao: situ,
      devolucao,
      dataAbertura: abertura,
      dataAcao,
      dataRecebimento,
      descricao: limpar(r.reclamacao),
      laudo: limpar(r.laudo),
      procedencia: limpar(r.procedencia),
      solucao: limpar(r.solucao),
      observacao: limpar(r.obs),
      garantia: limpar(r.garantia),
      clienteNome: limpar(r.cliente),
      cidade: limpar(r.cidade),
      uf: limpar(r.uf),
      transportadora: limpar(r.transp),
      peca: limpar(r.peca),
      rascunho: false,
      origemRegistro: "importado",
      criadoEm: instante(r.criadoEm, abertura),
      alteradoEm: instante(r.alteradoEm, abertura),
    });

    custos.push({
      reclamacaoId: id,
      freteEnvio: dinheiro(r.freteEnvio),
      freteRetorno: dinheiro(r.freteRetorno),
      valorPeca: dinheiro(r.valorPeca),
      estorno: dinheiro(r.estorno),
      desconto: dinheiro(r.desconto),
      guia: dinheiro(r.guia),
    });

    ids.forEach((cid, i) => {
      extras.push({
        id: `${id}-${cid}`,
        reclamacaoId: id,
        causaId: cid,
        primaria: i === 0,
        ordem: i,
      });
    });
  }

  relatorio.importadas = reclamacoes.length;
  if (relatorio.semData.length) {
    relatorio.avisos.push(
      `${relatorio.semData.length} registro(s) sem data válida foram pulados: ${relatorio.semData.join(", ")}.`,
    );
  }
  if (relatorio.semCanal) {
    relatorio.avisos.push(
      `${relatorio.semCanal} registro(s) sem canal reconhecido ficaram em "Não informado".`,
    );
  }
  if (relatorio.semSku) {
    relatorio.avisos.push(
      `${relatorio.semSku} registro(s) sem SKU ficaram sem produto.`,
    );
  }
  const vendas: Linha[] = [];
  for (const v of backup.vendas ?? []) {
    const sku = maiuscula(v.sku);
    const data = paraData(v.data);
    if (!sku || !data) continue;
    vendas.push({
      id: `venda-${slug(sku)}-${data}`,
      sku,
      descricao: limpar(v.descricao),
      data,
      quantidade: Math.max(0, Math.trunc(Number(v.quantidade) || 0)),
    });
  }

  // Usuários entram inativos e sem senha utilizável: o hash antigo é incompatível.
  // Quem deve voltar a usar o sistema ganha senha nova e é ativado depois.
  const usuarios: Linha[] = [];
  const agora = new Date().toISOString();
  for (const u of backup.usuarios ?? []) {
    const login = limpar(u.login).toLowerCase();
    if (!login) continue;
    usuarios.push({
      id: `usuario-${slug(login)}`,
      login,
      nome: limpar(u.nome) || login,
      perfil: PERFIL_NOVO[limpar(u.perfil).toLowerCase()] ?? "operacao",
      senhaHash: SENHA_NAO_DEFINIDA,
      ativo: false,
      telefone: limpar(u.telefone) || null,
      criadoEm: agora,
      alteradoEm: agora,
    });
  }
  relatorio.usuariosInativos = usuarios.length;

  if (usuarios.length) {
    relatorio.avisos.push(
      `${usuarios.length} usuário(s) entram inativos e sem senha utilizável (o hash antigo é incompatível); quem for usar a v2 recebe senha nova e é ativado depois. Usuário com login já existente na v2 não é alterado.`,
    );
  }
  if (relatorio.ignorados.fotos || relatorio.ignorados.auditoria) {
    relatorio.avisos.push(
      `Não importados: ${relatorio.ignorados.fotos} foto(s) (só metadados, os arquivos estão no servidor antigo) e ${relatorio.ignorados.auditoria} registro(s) de auditoria.`,
    );
  }

  const tabelas: Tabelas = {
    marcas: [...marcas.values()],
    canais: [...canais.values()],
    bancadas: [...bancadas.values()],
    setores,
    produtos: [...produtos.values()],
    causas,
    reclamacoes,
    custos,
    reclamacao_causas: extras,
    usuarios,
    vendas_dia: vendas,
  };
  for (const [nome, linhas] of Object.entries(tabelas)) {
    relatorio.contagens[nome] = linhas.length;
  }
  return { tabelas, relatorio };
}
