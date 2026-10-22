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
  ignorados: { usuarios: number; fotos: number; auditoria: number };
  avisos: string[];
}

/** Formato do backup JSON exportado pelo sac-renato. */
export interface BackupLegado {
  regs: RegistroLegado[];
  usuarios?: unknown[];
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
    ignorados: {
      usuarios: backup.usuarios?.length ?? 0,
      fotos: backup.regs.reduce((n, r) => n + (r.fotos?.length ?? 0), 0),
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

    const canalDef = CANAIS[maiuscula(r.canal)];
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

    const definida = !!(r.causaManual && r.causaId);
    const ids = definida
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
  if (relatorio.ignorados.usuarios || relatorio.ignorados.fotos) {
    relatorio.avisos.push(
      `Não importados: ${relatorio.ignorados.usuarios} usuário(s) (recriar na v2, o hash de senha é incompatível), ${relatorio.ignorados.fotos} foto(s) (só metadados, sem arquivo) e ${relatorio.ignorados.auditoria} registro(s) de auditoria.`,
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
  };
  for (const [nome, linhas] of Object.entries(tabelas)) {
    relatorio.contagens[nome] = linhas.length;
  }
  return { tabelas, relatorio };
}
