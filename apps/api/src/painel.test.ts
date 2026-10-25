import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes, type Perfil } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import {
  type AbertaBruta,
  JANELA_DIAS,
  LIMITE_ABERTOS,
  LIMITE_MOVIMENTOS,
  type RepositorioPainel,
  ServicoPainel,
  whereBase,
} from "./painel";
import { ErroEscrita } from "./reclamacoes-escrita";

function usuario(
  perfil: Perfil,
  extras: Partial<UsuarioLogado> = {},
): UsuarioLogado {
  return {
    id: `u-${perfil}`,
    login: perfil,
    nome: `Pessoa ${perfil}`,
    perfil,
    setores: [],
    permissoes: mesclarPermissoes(perfil, []),
    ...extras,
  };
}

function aberta(sobrescrever: Partial<AbertaBruta> = {}): AbertaBruta {
  return {
    id: "r1",
    numero: 10,
    dataAbertura: new Date("2026-10-20T00:00:00.000Z"),
    dataAcao: null,
    estado: "em_tratativa",
    estadoDesde: new Date("2026-10-22T12:00:00.000Z"),
    devolucao: "NA",
    prazoMarketplace: null,
    setor: "Montagem",
    historico: [
      { para: "encaminhada", quando: new Date("2026-10-20T12:00:00.000Z") },
      { para: "recebida", quando: new Date("2026-10-21T12:00:00.000Z") },
    ],
    ...sobrescrever,
  };
}

function repo(parcial: Partial<RepositorioPainel> = {}): RepositorioPainel {
  return {
    abertas: async () => [],
    movimentos: async () => [],
    entradas: async () => [],
    ...parcial,
  };
}

const AGORA = new Date("2026-10-25T15:00:00.000Z");

describe("painel", () => {
  it("recusa quem não vê reclamações", async () => {
    const s = new ServicoPainel(repo());
    const u = usuario("operacao", { permissoes: [] });
    await expect(s.gerar(u, undefined, AGORA)).rejects.toBeInstanceOf(
      ErroEscrita,
    );
  });

  it("modo treino só pede dado de treino", () => {
    const where = whereBase(
      {
        perfil: "gestor",
        setores: [],
        treino: true,
      },
      undefined,
    );
    expect(where).toEqual({
      AND: [{ treino: true }, { rascunho: false }],
    });
  });

  it("responsável de setor fica no próprio setor", () => {
    const where = whereBase(
      {
        perfil: "responsavel_setor",
        setores: ["Solda"],
        treino: false,
      },
      "marca-1",
    );
    expect(JSON.stringify(where)).toContain("Solda");
    expect(JSON.stringify(where)).toContain("marca-1");
  });

  it("marca prazo, andamento e não manda nome de cliente", async () => {
    const visto: { take?: number } = {};
    const s = new ServicoPainel(
      repo({
        abertas: async (args) => {
          visto.take = args.take;
          return [aberta()];
        },
        movimentos: async () => [
          {
            id: "h1",
            reclamacaoId: "r1",
            numero: 10,
            quando: new Date("2026-10-24T18:00:00.000Z"),
            de: "recebida",
            para: "em_tratativa",
            setor: "Montagem",
            reabertura: false,
          },
        ],
        entradas: async () => [
          {
            id: "r1",
            quando: new Date("2026-10-20T00:00:00.000Z"),
            setor: "Montagem",
          },
        ],
      }),
    );
    const r = await s.gerar(usuario("gestor"), undefined, AGORA);
    expect(r.abertos[0]).toMatchObject({
      numero: 10,
      setor: "Montagem",
      horasAteAndamento: 24,
      dias: 5,
      faixa: "ate7",
    });
    expect(r.abertos[0]?.motivos).toContain("TRATATIVA_META");
    expect(r.movimentos).toHaveLength(1);
    expect(r.entradas).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("cliente");
    expect(visto.take).toBe(LIMITE_ABERTOS + 1);
  });

  it("corta acima do limite e avisa", async () => {
    const s = new ServicoPainel(
      repo({
        movimentos: async () =>
          Array.from({ length: LIMITE_MOVIMENTOS + 1 }, (_, i) => ({
            id: `h${i}`,
            reclamacaoId: "r1",
            numero: 1,
            quando: AGORA,
            de: null,
            para: "triagem",
            setor: "Solda",
            reabertura: false,
          })),
      }),
    );
    const r = await s.gerar(usuario("gestor"), undefined, AGORA);
    expect(r.cortado).toBe(true);
    expect(r.movimentos).toHaveLength(LIMITE_MOVIMENTOS);
  });

  it("a janela da linha do tempo é de 90 dias", () => {
    expect(JANELA_DIAS).toBe(90);
  });
});
