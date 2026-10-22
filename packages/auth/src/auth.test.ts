import { beforeAll, describe, expect, it } from "vitest";
import {
  decidirAcesso,
  ErroAuth,
  hashSenha,
  hashToken,
  LimiteTentativas,
  lerCookie,
  type RepositorioAuth,
  ServicoAuth,
  type SessaoRegistro,
  type UsuarioLogado,
  type UsuarioRegistro,
  validarSenhaNova,
  verificarSenha,
} from "./index";

const SENHA = "uma-senha-bem-longa-42";

let usuarios: UsuarioRegistro[];

class RepoFalso implements RepositorioAuth {
  sessoes = new Map<string, SessaoRegistro>();
  async buscarUsuarioPorLogin(login: string) {
    return usuarios.find((u) => u.login === login) ?? null;
  }
  async buscarUsuarioPorId(id: string) {
    return usuarios.find((u) => u.id === id) ?? null;
  }
  async criarSessao(s: SessaoRegistro) {
    this.sessoes.set(s.id, s);
  }
  async buscarSessao(id: string) {
    return this.sessoes.get(id) ?? null;
  }
  async apagarSessao(id: string) {
    this.sessoes.delete(id);
  }
}

beforeAll(async () => {
  const senhaHash = await hashSenha(SENHA);
  usuarios = [
    {
      id: "u-adm",
      login: "adm",
      nome: "Admin",
      perfil: "administrador",
      senhaHash,
      ativo: true,
      setores: [],
      permissoes: [],
    },
    {
      id: "u-solda",
      login: "solda",
      nome: "Resp. Solda",
      perfil: "responsavel_setor",
      senhaHash,
      ativo: true,
      setores: ["Solda"],
      permissoes: [],
    },
    {
      id: "u-off",
      login: "inativo",
      nome: "Inativo",
      perfil: "operacao",
      senhaHash,
      ativo: false,
      setores: [],
      permissoes: [],
    },
  ];
});

describe("senha com Argon2id", () => {
  it("gera hash argon2id com sal diferente a cada vez e confere a senha", async () => {
    const a = await hashSenha("outra-senha-comprida");
    const b = await hashSenha("outra-senha-comprida");
    expect(a.startsWith("$argon2id$")).toBe(true);
    expect(a).not.toBe(b);
    expect(await verificarSenha("outra-senha-comprida", a)).toBe(true);
    expect(await verificarSenha("errada", a)).toBe(false);
  });

  it("hash inválido não confere e não derruba", async () => {
    expect(await verificarSenha("x", "isso-nao-e-hash")).toBe(false);
  });

  it("recusa senha fraca", () => {
    expect(validarSenhaNova("curta", "ana")).not.toBeNull();
    expect(validarSenhaNova("1234567890123", "ana")).not.toBeNull();
    expect(validarSenhaNova("minhaanasenha99", "ana")).not.toBeNull();
    expect(validarSenhaNova(SENHA, "ana")).toBeNull();
  });
});

describe("login e sessão", () => {
  it("entra com a senha certa e guarda só o hash do token", async () => {
    const repo = new RepoFalso();
    const auth = new ServicoAuth(repo);
    const r = await auth.entrar("  ADM ", SENHA, "1.1.1.1");
    expect(r.usuario.perfil).toBe("administrador");
    expect(repo.sessoes.has(r.token)).toBe(false);
    expect(repo.sessoes.has(hashToken(r.token))).toBe(true);
    expect((await auth.validar(r.token))?.login).toBe("adm");
  });

  it("não revela se o usuário existe: mesma mensagem para senha errada, usuário inexistente e inativo", async () => {
    const auth = new ServicoAuth(new RepoFalso());
    const msgs: string[] = [];
    for (const [login, senha] of [
      ["adm", "senha-errada"],
      ["ninguem", SENHA],
      ["inativo", SENHA],
    ]) {
      try {
        await auth.entrar(login, senha, "2.2.2.2");
      } catch (e) {
        expect(e).toBeInstanceOf(ErroAuth);
        msgs.push((e as ErroAuth).message);
      }
    }
    expect(msgs).toEqual([
      "Usuário ou senha inválidos.",
      "Usuário ou senha inválidos.",
      "Usuário ou senha inválidos.",
    ]);
  });

  it("bloqueia depois de 5 falhas, mesmo com a senha certa, e libera com o tempo", async () => {
    let agora = 1_000_000;
    const limite = new LimiteTentativas(5, 15 * 60 * 1000, () => agora);
    const auth = new ServicoAuth(new RepoFalso(), limite);
    for (let i = 0; i < 5; i++) {
      await expect(auth.entrar("adm", "errada", "3.3.3.3")).rejects.toThrow();
    }
    const bloqueio = await auth.entrar("adm", SENHA, "3.3.3.3").catch((e) => e);
    expect(bloqueio).toBeInstanceOf(ErroAuth);
    expect((bloqueio as ErroAuth).codigo).toBe("bloqueado");
    expect((bloqueio as ErroAuth).esperarSegundos).toBeGreaterThan(0);
    agora += 16 * 60 * 1000;
    const r = await auth.entrar("adm", SENHA, "3.3.3.3");
    expect(r.usuario.login).toBe("adm");
  });

  it("falhas de outro IP no mesmo usuário também travam esse usuário", async () => {
    const auth = new ServicoAuth(new RepoFalso());
    for (let i = 0; i < 5; i++) {
      await auth.entrar("solda", "errada", `9.9.9.${i}`).catch(() => null);
    }
    const e = await auth.entrar("solda", SENHA, "8.8.8.8").catch((x) => x);
    expect((e as ErroAuth).codigo).toBe("bloqueado");
  });

  it("sessão expira e é apagada", async () => {
    let agora = new Date("2026-01-01T10:00:00Z");
    const repo = new RepoFalso();
    const auth = new ServicoAuth(repo, new LimiteTentativas(), () => agora);
    const r = await auth.entrar("adm", SENHA, "4.4.4.4");
    expect(await auth.validar(r.token)).not.toBeNull();
    agora = new Date("2026-01-01T23:00:00Z");
    expect(await auth.validar(r.token)).toBeNull();
    expect(repo.sessoes.size).toBe(0);
  });

  it("usuário desativado perde a sessão na hora", async () => {
    const repo = new RepoFalso();
    const auth = new ServicoAuth(repo);
    const r = await auth.entrar("solda", SENHA, "5.5.5.5");
    const u = usuarios.find((x) => x.id === "u-solda");
    if (!u) throw new Error("usuário de teste ausente");
    u.ativo = false;
    expect(await auth.validar(r.token)).toBeNull();
    u.ativo = true;
  });

  it("sair apaga a sessão", async () => {
    const repo = new RepoFalso();
    const auth = new ServicoAuth(repo);
    const r = await auth.entrar("adm", SENHA, "6.6.6.6");
    await auth.sair(r.token);
    expect(await auth.validar(r.token)).toBeNull();
  });

  it("token inventado ou vazio não vale", async () => {
    const auth = new ServicoAuth(new RepoFalso());
    expect(await auth.validar("token-inventado")).toBeNull();
    expect(await auth.validar(null)).toBeNull();
    expect(await auth.validar("")).toBeNull();
  });

  it("o perfil define as permissões do usuário logado", async () => {
    const auth = new ServicoAuth(new RepoFalso());
    const r = await auth.entrar("solda", SENHA, "7.7.7.7");
    expect(r.usuario.permissoes).toContain("reclamacoes.analisar");
    expect(r.usuario.permissoes).not.toContain("painel.ver");
    expect(r.usuario.setores).toEqual(["Solda"]);
  });
});

const logado = (permissoes: string[]): UsuarioLogado => ({
  id: "u",
  login: "u",
  nome: "U",
  perfil: "gestor",
  setores: [],
  permissoes,
});

const base = {
  publico: false,
  usuario: logado(["painel.ver"]) as UsuarioLogado | null,
  requeridas: [] as string[],
  metodo: "GET",
  origem: null as string | null,
  origensPermitidas: ["https://sac.exemplo.com"],
};

describe("decisão de acesso", () => {
  it("nega por padrão quando não há login", () => {
    expect(decidirAcesso({ ...base, usuario: null })).toEqual({
      ok: false,
      status: 401,
      motivo: "Entre para continuar.",
    });
  });

  it("rota pública passa sem login", () => {
    expect(decidirAcesso({ ...base, publico: true, usuario: null }).ok).toBe(
      true,
    );
  });

  it("exige a permissão da rota", () => {
    const sem = decidirAcesso({ ...base, requeridas: ["usuarios.gerir"] });
    expect(sem).toMatchObject({ ok: false, status: 403 });
    const com = decidirAcesso({ ...base, requeridas: ["painel.ver"] });
    expect(com.ok).toBe(true);
  });

  it("escrita vinda de outra origem é recusada, mesmo logado", () => {
    const r = decidirAcesso({
      ...base,
      metodo: "POST",
      origem: "https://site-malicioso.com",
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("escrita da origem permitida passa, e leitura não depende da origem", () => {
    expect(
      decidirAcesso({
        ...base,
        metodo: "POST",
        origem: "https://sac.exemplo.com",
      }).ok,
    ).toBe(true);
    expect(decidirAcesso({ ...base, origem: "https://qualquer.com" }).ok).toBe(
      true,
    );
  });

  it("login público também recusa origem estranha", () => {
    const r = decidirAcesso({
      ...base,
      publico: true,
      usuario: null,
      metodo: "POST",
      origem: "https://site-malicioso.com",
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("cookie", () => {
  it("lê o cookie certo entre vários", () => {
    expect(lerCookie("a=1; sac_sessao=abc123; b=2", "sac_sessao")).toBe(
      "abc123",
    );
  });
  it("devolve null quando não há", () => {
    expect(lerCookie(undefined, "sac_sessao")).toBeNull();
    expect(lerCookie("a=1", "sac_sessao")).toBeNull();
  });
  it("não quebra com valor malformado", () => {
    expect(lerCookie("sac_sessao=%E0%A4%A", "sac_sessao")).toBeNull();
  });
});
