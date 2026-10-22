import "reflect-metadata";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import { CHAVE_REQUER } from "./auth.guard";
import { ControladorReclamacoes } from "./reclamacoes.controller";
import {
  type AuditoriaNova,
  compararEstados,
  ErroEscrita,
  type EstadoReclamacao,
  estadoVazio,
  lerEntrada,
  type Referencias,
  type RegistroAtual,
  type RepositorioEscrita,
  ServicoEscrita,
} from "./reclamacoes-escrita";

const AGORA = () => new Date("2026-10-22T15:00:00Z");

const REF: Referencias = {
  canais: new Set(["c1"]),
  marcas: new Set(["m1"]),
  bancadas: new Set(["b1"]),
  setores: new Set(["s-log", "s-solda", "s-sac"]),
  causaSetor: new Map([
    ["avaria", "s-log"],
    ["solda", "s-solda"],
    ["outros", "s-sac"],
  ]),
};

function usuario(
  perfil: Perfil,
  setores: string[] = [],
  sobrescrever: Partial<UsuarioLogado> = {},
): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: `Pessoa ${perfil}`,
    perfil,
    setores,
    permissoes: mesclarPermissoes(perfil, []),
    ...sobrescrever,
  };
}

/** Repositório em memória: guarda o que o serviço manda gravar e a auditoria que acompanha. */
function repoFalso(atual?: { setorNome: string; estado: EstadoReclamacao }) {
  const gravado = {
    criados: [] as { estado: EstadoReclamacao; situacao: string }[],
    atualizados: [] as { estado: EstadoReclamacao; situacao: string }[],
    auditorias: [] as AuditoriaNova[],
    buscas: [] as unknown[],
  };
  const repo: RepositorioEscrita = {
    async referencias() {
      return REF;
    },
    async produtoPorCodigo(codigo) {
      return codigo === "P1" ? "prod-1" : null;
    },
    async obterAtual(where): Promise<RegistroAtual | null> {
      gravado.buscas.push(where);
      if (!atual) return null;
      // Reproduz o filtro de escopo: com restrição, o setor da reclamação precisa estar na lista.
      const e = (where as { AND?: unknown[] }).AND?.[1] as
        | { setorResp: { nome: { in: string[] } } }
        | undefined;
      if (e && !e.setorResp.nome.in.includes(atual.setorNome)) return null;
      return { id: "r1", numero: 7, estado: atual.estado };
    },
    async criar(args) {
      const r = { id: "novo", numero: 99 };
      gravado.criados.push({ estado: args.estado, situacao: args.situacao });
      gravado.auditorias.push(args.auditar(r));
      return r;
    },
    async atualizar(args) {
      gravado.atualizados.push({
        estado: args.estado,
        situacao: args.situacao,
      });
      gravado.auditorias.push(args.auditoria);
    },
  };
  return { repo, gravado };
}

function existente(
  sobrescrever: Partial<EstadoReclamacao> = {},
): EstadoReclamacao {
  return {
    ...estadoVazio("c1", "2026-10-01"),
    descricao: "Peça chegou amassada na entrega.",
    causaId: "avaria",
    setorRespId: "s-log",
    ...sobrescrever,
  };
}

async function recusa(p: Promise<unknown>): Promise<ErroEscrita> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroEscrita) return e;
    throw e;
  }
  throw new Error("Era esperado um ErroEscrita.");
}

describe("lerEntrada", () => {
  it("aceita um cadastro mínimo", () => {
    const r = lerEntrada({ canalId: "c1", descricao: " Quebrou. " }, "criar");
    expect(r).toEqual({
      ok: true,
      entrada: { canalId: "c1", descricao: "Quebrou." },
    });
  });

  it("cadastro exige canal e descrição", () => {
    expect(lerEntrada({ descricao: "x" }, "criar").ok).toBe(false);
    expect(lerEntrada({ canalId: "c1" }, "criar").ok).toBe(false);
  });

  it("recusa campo que o cliente não pode mandar", () => {
    for (const campo of ["situacao", "setorRespManual", "causaManual", "id"]) {
      const r = lerEntrada(
        { canalId: "c1", descricao: "x", [campo]: true },
        "criar",
      );
      expect(r.ok).toBe(false);
    }
  });

  it("recusa tipo, data, devolução e custo inválidos", () => {
    const base = { canalId: "c1", descricao: "x" };
    const invalido = (extra: Record<string, unknown>) =>
      lerEntrada({ ...base, ...extra }, "criar").ok;
    expect(invalido({ descricao: 5 })).toBe(false);
    expect(invalido({ dataAbertura: "2026-02-31" })).toBe(false);
    expect(invalido({ devolucao: "TALVEZ" })).toBe(false);
    expect(invalido({ custos: { guia: -1 } })).toBe(false);
    expect(invalido({ custos: { guia: "9" } })).toBe(false);
    expect(invalido({ custos: { outro: 1 } })).toBe(false);
    expect(invalido({ uf: "SPX" })).toBe(false);
    expect(invalido({ descricao: "a".repeat(5001) })).toBe(false);
  });

  it("edição vazia é recusada e corpo que não é objeto também", () => {
    expect(lerEntrada({}, "editar").ok).toBe(false);
    expect(lerEntrada([], "editar").ok).toBe(false);
    expect(lerEntrada(null, "criar").ok).toBe(false);
  });

  it("custo é arredondado em centavos e uf vai em maiúsculas", () => {
    const r = lerEntrada({ uf: "sp", custos: { guia: 10.456 } }, "editar");
    expect(r).toEqual({
      ok: true,
      entrada: { uf: "SP", custos: { guia: 10.46 } },
    });
  });
});

describe("criar", () => {
  it("operação registra: causa e setor saem das regras, situação do domínio", async () => {
    const { repo, gravado } = repoFalso();
    const r = await new ServicoEscrita(repo, AGORA).criar(
      {
        canalId: "c1",
        descricao: "A solda do suporte soltou.",
        produtoCodigo: "P1",
        custos: { freteEnvio: 30 },
      },
      usuario("operacao"),
    );
    expect(r).toEqual({ id: "novo", numero: 99 });
    const g = gravado.criados[0];
    expect(g.estado.causaId).toBe("solda");
    expect(g.estado.setorRespId).toBe("s-solda");
    expect(g.estado.setorRespManual).toBe(false);
    expect(g.estado.causaManual).toBe(false);
    expect(g.estado.produtoId).toBe("prod-1");
    expect(g.estado.dataAbertura).toBe("2026-10-22");
    expect(g.situacao).toBe("tratativa");
  });

  it("devolução aguardando grava situação aguardando", async () => {
    const { repo, gravado } = repoFalso();
    await new ServicoEscrita(repo, AGORA).criar(
      { canalId: "c1", descricao: "Defeito.", devolucao: "AGUARDANDO" },
      usuario("gestor"),
    );
    expect(gravado.criados[0].situacao).toBe("aguardando");
  });

  it("sem permissão de criar, nada é gravado", async () => {
    const { repo, gravado } = repoFalso();
    const e = await recusa(
      new ServicoEscrita(repo, AGORA).criar(
        { canalId: "c1", descricao: "x" },
        usuario("responsavel_setor", ["Solda"]),
      ),
    );
    expect(e.status).toBe(403);
    expect(gravado.criados).toHaveLength(0);
    expect(gravado.auditorias).toHaveLength(0);
  });

  it("vale a permissão da pessoa, não só a do perfil", async () => {
    const { repo } = repoFalso();
    const sem = usuario("operacao", [], {
      permissoes: ["reclamacoes.ver", "reclamacoes.editar"],
    });
    const e = await recusa(
      new ServicoEscrita(repo, AGORA).criar(
        { canalId: "c1", descricao: "x" },
        sem,
      ),
    );
    expect(e.status).toBe(403);
  });

  it("operação não troca o setor à mão", async () => {
    const { repo, gravado } = repoFalso();
    const e = await recusa(
      new ServicoEscrita(repo, AGORA).criar(
        { canalId: "c1", descricao: "x", setorRespId: "s-sac" },
        usuario("operacao"),
      ),
    );
    expect(e.status).toBe(403);
    expect(gravado.criados).toHaveLength(0);
  });

  it("gestor troca o setor e a troca fica marcada como manual", async () => {
    const { repo, gravado } = repoFalso();
    await new ServicoEscrita(repo, AGORA).criar(
      { canalId: "c1", descricao: "Amassado.", setorRespId: "s-sac" },
      usuario("gestor"),
    );
    expect(gravado.criados[0].estado.setorRespId).toBe("s-sac");
    expect(gravado.criados[0].estado.setorRespManual).toBe(true);
    expect(gravado.criados[0].estado.causaId).toBe("avaria");
  });

  it("causa escolhida à mão trava a causa e define o setor dela", async () => {
    const { repo, gravado } = repoFalso();
    await new ServicoEscrita(repo, AGORA).criar(
      { canalId: "c1", descricao: "Amassado.", causaId: "solda" },
      usuario("operacao"),
    );
    const e = gravado.criados[0].estado;
    expect(e.causaId).toBe("solda");
    expect(e.causaManual).toBe(true);
    expect(e.setorRespId).toBe("s-solda");
  });

  it("recusa referência que não existe", async () => {
    const { repo } = repoFalso();
    const s = new ServicoEscrita(repo, AGORA);
    const op = usuario("operacao");
    for (const entrada of [
      { canalId: "x", descricao: "a" },
      { canalId: "c1", descricao: "a", marcaId: "x" },
      { canalId: "c1", descricao: "a", bancadaId: "x" },
      { canalId: "c1", descricao: "a", causaId: "x" },
      { canalId: "c1", descricao: "a", produtoCodigo: "NAO-EXISTE" },
    ]) {
      expect((await recusa(s.criar(entrada, op))).status).toBe(400);
    }
  });

  it("regra de tratativa: ação só depois do recebimento, e não no futuro", async () => {
    const { repo } = repoFalso();
    const s = new ServicoEscrita(repo, AGORA);
    const op = usuario("operacao");
    const base = { canalId: "c1", descricao: "a" };
    const aguardando = s.criar(
      { ...base, devolucao: "AGUARDANDO", dataAcao: "2026-10-22" },
      op,
    );
    expect((await recusa(aguardando)).status).toBe(400);
    const futuro = s.criar({ ...base, dataAbertura: "2026-10-30" }, op);
    expect((await recusa(futuro)).status).toBe(400);
    const antes = s.criar(
      { ...base, dataAbertura: "2026-10-10", dataAcao: "2026-10-01" },
      op,
    );
    expect((await recusa(antes)).status).toBe(400);
  });

  it("grava na auditoria quem criou, o quê e o número, sem copiar texto livre", async () => {
    const { repo, gravado } = repoFalso();
    await new ServicoEscrita(repo, AGORA).criar(
      {
        canalId: "c1",
        descricao: "Texto com dado de cliente.",
        clienteNome: "Maria",
        custos: { guia: 12 },
      },
      usuario("operacao"),
    );
    expect(gravado.auditorias).toHaveLength(1);
    const a = gravado.auditorias[0];
    expect(a).toMatchObject({
      usuarioId: "u-operacao",
      usuarioNome: "Pessoa operacao",
      acao: "reclamacao.criar",
      alvo: "Reclamação #99",
      reclamacaoId: "novo",
    });
    const campos = a.extra.mudancas.map((m) => m.campo);
    expect(campos).toContain("descricao");
    expect(campos).toContain("custos.guia");
    expect(JSON.stringify(a)).not.toContain("Maria");
    expect(JSON.stringify(a)).not.toContain("dado de cliente");
  });
});

describe("editar", () => {
  it("só grava o que mudou e audita de → para", async () => {
    const custos = { ...estadoVazio("c1", "").custos, guia: 5 };
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente({ custos }),
    });
    const r = await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { devolucao: "RECEBIDO", custos: { guia: 8 } },
      usuario("operacao"),
    );
    expect(r).toEqual({
      id: "r1",
      numero: 7,
      alterou: true,
      devolucaoRecebida: true,
    });
    const a = gravado.auditorias[0];
    expect(a).toMatchObject({
      usuarioId: "u-operacao",
      acao: "reclamacao.editar",
      alvo: "Reclamação #7",
      reclamacaoId: "r1",
    });
    expect(a.extra.mudancas).toEqual([
      { campo: "devolucao", de: "NA", para: "RECEBIDO" },
      { campo: "custos.guia", de: 5, para: 8 },
    ]);
    expect(a.detalhe).toContain("devolucao");
  });

  it("registrar a data de ação resolve a reclamação", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente(),
    });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { dataAcao: "2026-10-15" },
      usuario("gestor"),
    );
    expect(gravado.atualizados[0].situacao).toBe("resolvida");
  });

  it("sem mudança real não grava nem audita", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente(),
    });
    const r = await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { devolucao: "NA", dataAbertura: "2026-10-01" },
      usuario("gestor"),
    );
    expect(r.alterou).toBe(false);
    expect(gravado.atualizados).toHaveLength(0);
    expect(gravado.auditorias).toHaveLength(0);
  });

  it("mudar o texto reclassifica a causa e o setor, enquanto nada foi trocado à mão", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente(),
    });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { descricao: "A solda do suporte soltou." },
      usuario("operacao"),
    );
    const e = gravado.atualizados[0].estado;
    expect(e.causaId).toBe("solda");
    expect(e.setorRespId).toBe("s-solda");
    const campos = gravado.auditorias[0].extra.mudancas.map((m) => m.campo);
    expect(campos).toEqual(["causaId", "setorRespId", "descricao"]);
  });

  it("setor trocado à mão sobrevive à edição do texto; null devolve ao automático", async () => {
    const manual = existente({ setorRespId: "s-sac", setorRespManual: true });
    const a = repoFalso({ setorNome: "SAC / Pós-venda", estado: manual });
    await new ServicoEscrita(a.repo, AGORA).editar(
      "r1",
      { descricao: "A solda do suporte soltou." },
      usuario("gestor"),
    );
    expect(a.gravado.atualizados[0].estado.setorRespId).toBe("s-sac");
    expect(a.gravado.atualizados[0].estado.setorRespManual).toBe(true);

    const b = repoFalso({ setorNome: "SAC / Pós-venda", estado: manual });
    await new ServicoEscrita(b.repo, AGORA).editar(
      "r1",
      { setorRespId: null },
      usuario("gestor"),
    );
    expect(b.gravado.atualizados[0].estado.setorRespManual).toBe(false);
    expect(b.gravado.atualizados[0].estado.setorRespId).toBe("s-log");
  });

  it("permissão negada: sem editar nada passa, e trocar setor exige permissão própria", async () => {
    const a = repoFalso({ setorNome: "Logística", estado: existente() });
    const sem = usuario("operacao", [], { permissoes: ["reclamacoes.ver"] });
    const semEditar = new ServicoEscrita(a.repo, AGORA).editar(
      "r1",
      { peca: "x" },
      sem,
    );
    expect((await recusa(semEditar)).status).toBe(403);

    const b = repoFalso({ setorNome: "Logística", estado: existente() });
    const trocar = new ServicoEscrita(b.repo, AGORA).editar(
      "r1",
      { setorRespId: "s-sac" },
      usuario("responsavel_setor", ["Logística"]),
    );
    expect((await recusa(trocar)).status).toBe(403);
    for (const r of [a, b]) {
      expect(r.gravado.atualizados).toHaveLength(0);
      expect(r.gravado.auditorias).toHaveLength(0);
    }
  });

  it("escopo: responsável de outro setor recebe 404 e nada é gravado", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente(),
    });
    const e = await recusa(
      new ServicoEscrita(repo, AGORA).editar(
        "r1",
        { peca: "Fusível" },
        usuario("responsavel_setor", ["Solda"]),
      ),
    );
    expect(e.status).toBe(404);
    expect(gravado.atualizados).toHaveLength(0);
    expect(gravado.auditorias).toHaveLength(0);
  });

  it("escopo: a busca da reclamação já leva o filtro do setor do responsável", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente(),
    });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { peca: "Fusível" },
      usuario("responsavel_setor", ["Logística"]),
    );
    expect(gravado.buscas[0]).toEqual({
      AND: [{ id: "r1" }, { setorResp: { nome: { in: ["Logística"] } } }],
    });
    expect(gravado.atualizados).toHaveLength(1);
  });

  it("gestor, operação e administrador editam reclamação de qualquer setor", async () => {
    for (const perfil of ["gestor", "operacao", "administrador"] as const) {
      const { repo, gravado } = repoFalso({
        setorNome: "Logística",
        estado: existente(),
      });
      await new ServicoEscrita(repo, AGORA).editar(
        "r1",
        { peca: "Fusível" },
        usuario(perfil),
      );
      expect(gravado.buscas[0]).toEqual({ id: "r1" });
      expect(gravado.atualizados).toHaveLength(1);
    }
  });

  it("reclamação inexistente devolve 404", async () => {
    const { repo } = repoFalso();
    const e = await recusa(
      new ServicoEscrita(repo, AGORA).editar(
        "nada",
        { peca: "x" },
        usuario("gestor"),
      ),
    );
    expect(e.status).toBe(404);
  });

  it("não deixa registrar ação com o produto ainda a caminho", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente({ devolucao: "AGUARDANDO" }),
    });
    const e = await recusa(
      new ServicoEscrita(repo, AGORA).editar(
        "r1",
        { dataAcao: "2026-10-20" },
        usuario("gestor"),
      ),
    );
    expect(e.status).toBe(400);
    expect(gravado.atualizados).toHaveLength(0);
  });

  it("dado antigo fora da regra não trava a edição de outro campo", async () => {
    const { repo, gravado } = repoFalso({
      setorNome: "Logística",
      estado: existente({ devolucao: "AGUARDANDO", dataAcao: "2026-10-05" }),
    });
    await new ServicoEscrita(repo, AGORA).editar(
      "r1",
      { observacao: "Conferido." },
      usuario("gestor"),
    );
    expect(gravado.atualizados).toHaveLength(1);
  });
});

describe("compararEstados", () => {
  it("texto livre só marca alterado", () => {
    const antes = existente();
    const depois = { ...antes, clienteNome: "Fulano", cidade: "Bauru" };
    expect(compararEstados(antes, depois)).toEqual([
      { campo: "clienteNome", alterado: true },
      { campo: "cidade", alterado: true },
    ]);
  });
});

describe("rotas", () => {
  it("cada rota de escrita exige a permissão própria no guarda", () => {
    const exigida = (m: "criar" | "editar") =>
      Reflect.getMetadata(CHAVE_REQUER, ControladorReclamacoes.prototype[m]);
    expect(exigida("criar")).toEqual(["reclamacoes.criar"]);
    expect(exigida("editar")).toEqual(["reclamacoes.editar"]);
  });
});
