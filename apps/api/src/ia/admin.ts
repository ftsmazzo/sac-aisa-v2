import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  CAUSA_POR_ID,
  perguntasAplicaveis,
  TIPOS_PERGUNTA,
  temPermissao,
} from "@sac-aisa/domain";
import { z } from "zod";
import {
  type AuditoriaIa,
  type CausaIa,
  ErroIa,
  type PerfilIa,
  type PerguntaIa,
} from "./ia";
import { redigir, temMarcadorDesconhecido } from "./redacao";

/** Só administrador e gestor mexem no padrão da IA. A permissão é conferida junto do perfil. */
function exigirGestao(u: UsuarioLogado) {
  if (
    (u.perfil !== "administrador" && u.perfil !== "gestor") ||
    !temPermissao(u.permissoes, "ia.gerir")
  ) {
    throw new ErroIa(403, "Sem permissão para esta ação.");
  }
}

/** Texto com e-mail, telefone, documento, endereço ou número longo é recusado. */
export function temDadoPessoal(texto: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(redigir(texto)) !== norm(texto);
}

const texto = (max: number) => z.string().trim().max(max);

const exemploSchema = z
  .object({ situacao: texto(300).min(1), resposta: texto(700).min(1) })
  .strict();

export const perfilSchema = z
  .object({
    descricao: texto(2000).default(""),
    missao: texto(1000).default(""),
    valores: texto(1000).default(""),
    metas: texto(1000).default(""),
    tomDeVoz: texto(1000).default(""),
    dizer: texto(1000).default(""),
    evitar: texto(1000).default(""),
    assinatura: texto(300).default(""),
    exemplos: z.array(exemploSchema).max(15).default([]),
    nota: texto(300).default(""),
  })
  .strict();
export type EntradaPerfil = z.infer<typeof perfilSchema>;

const lista = z.array(texto(60).min(1)).max(30).default([]);
const regraSchema = z
  .object({
    familias: lista.optional(),
    causaIds: lista.optional(),
    causaCategorias: lista.optional(),
  })
  .strict()
  .refine(
    (r) =>
      (r.familias?.length ?? 0) +
        (r.causaIds?.length ?? 0) +
        (r.causaCategorias?.length ?? 0) >
      0,
    "A regra precisa de pelo menos um filtro.",
  );

export const perguntaSchema = z
  .object({
    chave: z
      .string()
      .regex(/^[a-z][a-z0-9_]{2,59}$/, "Letras minúsculas, números e _."),
    categoria: texto(40).default(""),
    texto: texto(300).min(3),
    tipo: z.enum(TIPOS_PERGUNTA as [string, ...string[]]),
    opcoes: z.array(texto(60).min(1)).max(12).default([]),
    obrigatoria: z.boolean().default(true),
    exemplo: texto(200).default(""),
    ordem: z.number().int().min(0).max(999).default(0),
    ativa: z.boolean().default(true),
    regras: z.array(regraSchema).max(10).default([]),
  })
  .strict();
export type EntradaPergunta = z.infer<typeof perguntaSchema>;

export interface VersaoPerfil {
  versao: number;
  publicadaEm: string;
  publicadaPorNome: string;
  padrao: boolean;
}

export interface RepositorioIaAdmin {
  perfil(): Promise<PerfilIa | null>;
  versoes(): Promise<VersaoPerfil[]>;
  publicarPerfil(
    entrada: EntradaPerfil,
    quem: { id: string; nome: string },
    auditoria: (versao: number) => AuditoriaIa,
  ): Promise<number>;
  perguntas(): Promise<PerguntaIa[]>;
  causas(): Promise<CausaIa[]>;
  salvarPergunta(
    entrada: EntradaPergunta,
    auditoria: (criada: boolean) => AuditoriaIa,
  ): Promise<{ criada: boolean }>;
}

function lerEntrada<S extends z.ZodTypeAny>(
  esquema: S,
  corpo: unknown,
): z.output<S> {
  const r = esquema.safeParse(corpo);
  if (!r.success) {
    const m = r.error.issues[0];
    throw new ErroIa(
      400,
      m ? `${m.path.join(".") || "Corpo"}: ${m.message}` : "Corpo inválido.",
    );
  }
  return r.data;
}

export class ServicoIaAdmin {
  constructor(private readonly repo: RepositorioIaAdmin) {}

  async perfil(usuario: UsuarioLogado) {
    exigirGestao(usuario);
    return {
      perfil: await this.repo.perfil(),
      versoes: await this.repo.versoes(),
    };
  }

  /** Cada gravação publica uma versão nova; a IA usa sempre a última. */
  async publicarPerfil(usuario: UsuarioLogado, corpo: unknown) {
    exigirGestao(usuario);
    const e = lerEntrada(perfilSchema, corpo);
    const campos = [
      e.descricao,
      e.missao,
      e.valores,
      e.metas,
      e.tomDeVoz,
      e.dizer,
      e.evitar,
      e.nota,
    ];
    if (campos.some(temDadoPessoal)) {
      throw new ErroIa(
        400,
        "O perfil não pode ter e-mail, telefone, documento ou endereço.",
      );
    }
    for (const ex of e.exemplos) {
      if (temDadoPessoal(ex.situacao) || temDadoPessoal(ex.resposta)) {
        throw new ErroIa(
          400,
          "Exemplo com dado pessoal (e-mail, telefone, documento ou endereço). Troque por {{nome_cliente}} ou retire.",
        );
      }
      if (temMarcadorDesconhecido(ex.resposta)) {
        throw new ErroIa(
          400,
          "Exemplo com marcador desconhecido. Só {{nome_cliente}} é aceito.",
        );
      }
    }
    if (/\{\{/.test(e.assinatura) || temDadoPessoal(e.assinatura)) {
      throw new ErroIa(400, "Assinatura inválida. Use {marca} para a marca.");
    }
    const versao = await this.repo.publicarPerfil(
      e,
      { id: usuario.id, nome: usuario.nome },
      (v) => ({
        usuarioId: usuario.id,
        usuarioNome: usuario.nome,
        acao: "ia.perfil",
        alvo: `Perfil da empresa v${v}`,
        detalhe: "Nova versão do perfil da empresa publicada.",
        extra: { versao: v },
      }),
    );
    return { versao };
  }

  async perguntas(usuario: UsuarioLogado) {
    exigirGestao(usuario);
    const causas = await this.repo.causas();
    return {
      perguntas: await this.repo.perguntas(),
      causas: causas.map((c) => ({
        id: c.id,
        nome: c.nome,
        categoria: c.categoria,
      })),
    };
  }

  async salvarPergunta(usuario: UsuarioLogado, corpo: unknown) {
    exigirGestao(usuario);
    const e = lerEntrada(perguntaSchema, corpo);
    if (e.tipo === "escolha" && e.opcoes.length < 2) {
      throw new ErroIa(
        400,
        "Pergunta de escolha precisa de pelo menos 2 opções.",
      );
    }
    for (const r of e.regras) {
      for (const id of r.causaIds ?? []) {
        if (!CAUSA_POR_ID[id]) {
          throw new ErroIa(400, `Causa inexistente: "${id}".`);
        }
      }
    }
    if (temDadoPessoal(e.texto) || temDadoPessoal(e.exemplo)) {
      throw new ErroIa(400, "A pergunta não pode ter dado pessoal.");
    }
    return this.repo.salvarPergunta(e, (criada) => ({
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      acao: criada ? "ia.pergunta.criar" : "ia.pergunta.editar",
      alvo: `Pergunta ${e.chave}`,
      detalhe: criada ? "Pergunta criada." : "Pergunta alterada.",
      extra: { chave: e.chave, ativa: e.ativa },
    }));
  }

  /** O que apareceria para um produto e uma causa: conferir a lista sem esperar uma reclamação real. */
  async simular(usuario: UsuarioLogado, corpo: unknown) {
    exigirGestao(usuario);
    const e = lerEntrada(
      z
        .object({
          familia: texto(60).optional(),
          causaId: texto(40).optional(),
        })
        .strict(),
      corpo,
    );
    const causa = e.causaId ? CAUSA_POR_ID[e.causaId] : undefined;
    if (e.causaId && !causa) throw new ErroIa(400, "Causa inexistente.");
    const aplicaveis = perguntasAplicaveis(await this.repo.perguntas(), {
      familia: e.familia ?? null,
      causaId: causa?.id ?? null,
      causaCategoria: causa?.cat ?? null,
    });
    return {
      perguntas: aplicaveis.map((p) => ({
        chave: p.chave,
        texto: p.texto,
        obrigatoria: p.obrigatoria,
      })),
    };
  }
}
