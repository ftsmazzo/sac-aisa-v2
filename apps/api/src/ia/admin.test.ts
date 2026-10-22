import { describe, expect, it } from "vitest";
import { type RepositorioIaAdmin, ServicoIaAdmin } from "./admin";
import {
  CAUSAS_TESTE,
  PERFIL_TESTE,
  PERGUNTAS_TESTE,
  usuario,
} from "./fixtures";
import type { AuditoriaIa } from "./ia";

function admin() {
  const auditorias: AuditoriaIa[] = [];
  const gravados: unknown[] = [];
  const repo: RepositorioIaAdmin = {
    async perfil() {
      return PERFIL_TESTE;
    },
    async versoes() {
      return [];
    },
    async publicarPerfil(e, _q, aud) {
      gravados.push(e);
      auditorias.push(aud(2));
      return 2;
    },
    async perguntas() {
      return PERGUNTAS_TESTE;
    },
    async causas() {
      return CAUSAS_TESTE;
    },
    async salvarPergunta(e, aud) {
      gravados.push(e);
      auditorias.push(aud(true));
      return { criada: true };
    },
  };
  return { s: new ServicoIaAdmin(repo), auditorias, gravados };
}

const GESTOR = usuario("gestor");
const perfilOk = {
  tomDeVoz: "Cordial.",
  assinatura: "Equipe SAC {marca}",
  exemplos: [
    {
      situacao: "Faltou item",
      resposta: "Ola, {{nome_cliente}}! Pode enviar a foto?",
    },
  ],
};
const perguntaOk = {
  chave: "nova_pergunta",
  texto: "Qual o modelo?",
  tipo: "texto",
  regras: [{ causaIds: ["eletrico"] }],
};

describe("administração do padrão da IA", () => {
  it("só administrador e gestor; operação e responsável de setor não", async () => {
    const { s } = admin();
    for (const p of [usuario("operacao"), usuario("responsavel_setor")]) {
      await expect(s.perfil(p)).rejects.toMatchObject({ status: 403 });
      await expect(s.publicarPerfil(p, perfilOk)).rejects.toMatchObject({
        status: 403,
      });
      await expect(s.salvarPergunta(p, perguntaOk)).rejects.toMatchObject({
        status: 403,
      });
    }
    await expect(s.perfil(usuario("administrador"))).resolves.toBeTruthy();
    await expect(s.perfil(GESTOR)).resolves.toBeTruthy();
  });

  it("gestor sem a permissão ia.gerir também é barrado", async () => {
    const { s } = admin();
    const sem = usuario("gestor", {
      permissoes: usuario("gestor").permissoes.filter((p) => p !== "ia.gerir"),
    });
    await expect(s.perfil(sem)).rejects.toMatchObject({ status: 403 });
  });

  it("publicar o perfil gera versão e auditoria", async () => {
    const { s, auditorias } = admin();
    expect(await s.publicarPerfil(GESTOR, perfilOk)).toEqual({ versao: 2 });
    expect(auditorias[0]).toMatchObject({
      acao: "ia.perfil",
      usuarioId: GESTOR.id,
    });
  });

  it("exemplo com telefone, e-mail ou marcador estranho é recusado", async () => {
    const { s, gravados } = admin();
    for (const resposta of [
      "Ligue (11) 91234-5678",
      "Escreva a a@b.com",
      "Ola {{outro}}",
    ]) {
      await expect(
        s.publicarPerfil(GESTOR, {
          ...perfilOk,
          exemplos: [{ situacao: "x", resposta }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(gravados).toEqual([]);
  });

  it("campo desconhecido no corpo é recusado", async () => {
    const { s } = admin();
    await expect(
      s.publicarPerfil(GESTOR, { ...perfilOk, admin: true }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("pergunta: causa inexistente, escolha sem opções e regra vazia são recusadas", async () => {
    const { s } = admin();
    await expect(
      s.salvarPergunta(GESTOR, {
        ...perguntaOk,
        regras: [{ causaIds: ["nao_existe"] }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.salvarPergunta(GESTOR, {
        ...perguntaOk,
        tipo: "escolha",
        opcoes: ["so uma"],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.salvarPergunta(GESTOR, { ...perguntaOk, regras: [{}] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      s.salvarPergunta(GESTOR, { ...perguntaOk, chave: "Chave Ruim" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("pergunta válida é gravada e auditada", async () => {
    const { s, auditorias } = admin();
    await expect(s.salvarPergunta(GESTOR, perguntaOk)).resolves.toEqual({
      criada: true,
    });
    expect(auditorias[0]).toMatchObject({
      acao: "ia.pergunta.criar",
      alvo: "Pergunta nova_pergunta",
    });
  });

  it("o simulador mostra as perguntas que valem para produto e causa, em ordem", async () => {
    const { s } = admin();
    const r = await s.simular(GESTOR, {
      causaId: "eletrico",
      familia: "FRITADEIRA",
    });
    expect(r.perguntas.map((p) => p.chave)).toEqual([
      "voltagem_tomada",
      "extensao",
    ]);
    expect(
      (await s.simular(GESTOR, { causaId: "avaria" })).perguntas.map(
        (p) => p.chave,
      ),
    ).toEqual(["local_dano"]);
    expect((await s.simular(GESTOR, {})).perguntas).toEqual([]);
  });
});
