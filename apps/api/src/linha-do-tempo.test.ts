import { describe, expect, it } from "vitest";
import {
  type AuditoriaDaLinha,
  type DadosDaLinha,
  etapasEProximo,
  montarLinhaDoTempo,
  type RepositorioLinha,
  ServicoLinhaDoTempo,
} from "./linha-do-tempo";

const SETORES = { "s-log": "Logística", "s-solda": "Solda" };
const CAUSAS = { avaria: "Avaria no transporte", solda: "Solda soltou" };

function dados(sobrescrever: Partial<DadosDaLinha> = {}): DadosDaLinha {
  return {
    id: "r1",
    dataAbertura: "2026-10-01",
    canalNome: "Mercado Livre",
    devolucao: "NA",
    dataRecebimento: null,
    dataAcao: null,
    setorRespId: "s-log",
    setorRespNome: "Logística",
    analiseDoSetor: false,
    auditorias: [],
    setores: SETORES,
    causas: CAUSAS,
    ...sobrescrever,
  };
}

function audit(
  id: string,
  quando: string,
  acao: string,
  usuarioNome: string,
  extra: unknown,
): AuditoriaDaLinha {
  return { id, quando: new Date(quando), usuarioNome, acao, extra };
}

describe("montarLinhaDoTempo", () => {
  it("conta a história do registro à resolução, em ordem, com quem fez", () => {
    const l = montarLinhaDoTempo(
      dados({
        devolucao: "RECEBIDO",
        dataRecebimento: "2026-10-08",
        dataAcao: "2026-10-12",
        analiseDoSetor: true,
        auditorias: [
          audit(
            "a3",
            "2026-10-12T14:00:00Z",
            "reclamacao.editar",
            "Rita Setor",
            {
              mudancas: [
                { campo: "solucao", alterado: true },
                { campo: "dataAcao", de: null, para: "2026-10-12" },
              ],
            },
          ),
          audit(
            "a1",
            "2026-10-01T12:00:00Z",
            "reclamacao.criar",
            "Ana Operação",
            {
              mudancas: [
                { campo: "descricao", de: null, para: "x" },
                { campo: "causaId", de: null, para: "avaria" },
                { campo: "setorRespId", de: null, para: "s-log" },
              ],
            },
          ),
          audit("a2", "2026-10-08T10:00:00Z", "analise.criar", "Rita Setor", {
            mudancas: [
              { campo: "produtoPrecisaVoltar", de: null, para: true },
              { campo: "reclamacao.devolucao", de: "NA", para: "RECEBIDO" },
              {
                campo: "reclamacao.dataRecebimento",
                de: null,
                para: "2026-10-08",
              },
            ],
          }),
        ],
      }),
    );
    expect(l.eventos.map((e) => e.tipo)).toEqual([
      "entrada",
      "triagem",
      "encaminhamento",
      "analise",
      "recebimento",
      "solucao",
      "resolucao",
    ]);
    const enc = l.eventos.find((e) => e.tipo === "encaminhamento");
    expect(enc).toMatchObject({
      titulo: "Encaminhada ao setor Logística",
      detalhe: "Sugerido pela causa: Avaria no transporte.",
      autor: "Ana Operação",
    });
    expect(l.eventos.find((e) => e.tipo === "analise")?.detalhe).toBe(
      "O produto precisa voltar.",
    );
    expect(l.eventos.find((e) => e.tipo === "resolucao")).toMatchObject({
      data: "2026-10-12",
      autor: "Rita Setor",
    });
    expect(l.proximo).toBeNull();
    expect(l.etapas.every((e) => e.estado === "feita")).toBe(true);
  });

  it("troca manual de setor mostra de → para, quem trocou e o motivo", () => {
    const l = montarLinhaDoTempo(
      dados({
        auditorias: [
          audit(
            "a1",
            "2026-10-02T09:00:00Z",
            "reclamacao.editar",
            "Gil Gestor",
            {
              mudancas: [
                { campo: "setorRespId", de: "s-log", para: "s-solda" },
                { campo: "setorRespManual", de: false, para: true },
              ],
              motivo: "Era defeito de solda.",
            },
          ),
        ],
      }),
    );
    expect(l.eventos[1]).toMatchObject({
      tipo: "encaminhamento",
      titulo: "Setor trocado: Logística → Solda",
      detalhe: "Motivo: Era defeito de solda.",
      autor: "Gil Gestor",
    });
  });

  it("voltar ao automático e reclassificação pelo texto têm títulos próprios", () => {
    const l = montarLinhaDoTempo(
      dados({
        auditorias: [
          audit("a1", "2026-10-02T09:00:00Z", "reclamacao.editar", "Ana", {
            mudancas: [
              { campo: "causaId", de: "avaria", para: "solda" },
              { campo: "setorRespId", de: "s-log", para: "s-solda" },
              { campo: "descricao", alterado: true },
            ],
          }),
          audit("a2", "2026-10-03T09:00:00Z", "reclamacao.editar", "Gil", {
            mudancas: [
              { campo: "setorRespId", de: "s-solda", para: "s-log" },
              { campo: "setorRespManual", de: true, para: false },
            ],
          }),
        ],
      }),
    );
    const titulos = l.eventos.map((e) => e.titulo);
    expect(titulos).toContain("Reencaminhada: Logística → Solda");
    expect(titulos).toContain("Setor voltou ao automático: Logística");
    expect(titulos).toContain("Triagem ajustada");
  });

  it("causa final só aparece quando uma pessoa a definiu", () => {
    const l = montarLinhaDoTempo(
      dados({
        auditorias: [
          audit("a1", "2026-10-05T09:00:00Z", "reclamacao.editar", "Rita", {
            mudancas: [
              { campo: "causaId", de: "avaria", para: "solda" },
              { campo: "causaManual", de: false, para: true },
            ],
          }),
        ],
      }),
    );
    const causa = l.eventos.find((e) => e.tipo === "causa");
    expect(causa).toMatchObject({
      titulo: "Causa final definida",
      detalhe: "Solda soltou",
      autor: "Rita",
    });
  });

  it("reclamação importada, sem auditoria, ainda mostra entrada, recebimento e resolução", () => {
    const l = montarLinhaDoTempo(
      dados({
        devolucao: "RECEBIDO",
        dataRecebimento: "2026-10-05",
        dataAcao: "2026-10-09",
      }),
    );
    expect(l.eventos.map((e) => e.tipo)).toEqual([
      "entrada",
      "recebimento",
      "resolucao",
    ]);
    expect(l.eventos[2].autor).toBeNull();
  });

  it("ignora auditoria de outra natureza e extra malformado", () => {
    const l = montarLinhaDoTempo(
      dados({
        auditorias: [
          audit("a1", "2026-10-02T09:00:00Z", "outra.acao", "X", {}),
          audit("a2", "2026-10-02T10:00:00Z", "reclamacao.editar", "Y", null),
          audit("a3", "2026-10-02T11:00:00Z", "reclamacao.editar", "Z", {
            mudancas: [1, "x", { semCampo: true }],
          }),
        ],
      }),
    );
    expect(l.eventos).toHaveLength(1);
  });

  it("não vaza texto livre: só nomes de setor e causa entram na linha", () => {
    const l = montarLinhaDoTempo(
      dados({
        auditorias: [
          audit("a1", "2026-10-01T12:00:00Z", "reclamacao.criar", "Ana", {
            mudancas: [
              { campo: "descricao", alterado: true },
              { campo: "clienteNome", alterado: true },
            ],
          }),
        ],
      }),
    );
    expect(JSON.stringify(l)).not.toMatch(/clienteNome/);
  });
});

describe("etapasEProximo", () => {
  const base = {
    devolucao: "NA" as const,
    dataAcao: null,
    setorRespId: "s-log",
    setorRespNome: "Logística",
    analiseDoSetor: false,
  };
  const estado = (r: ReturnType<typeof etapasEProximo>, c: string) =>
    r.etapas.find((e) => e.chave === c)?.estado;

  it("sem setor, o passo seguinte é encaminhar", () => {
    const r = etapasEProximo({
      ...base,
      setorRespId: null,
      setorRespNome: null,
    });
    expect(estado(r, "encaminhamento")).toBe("atual");
    expect(r.proximo).toMatch(/Definir o setor/);
  });

  it("com setor e sem análise, espera o setor", () => {
    const r = etapasEProximo(base);
    expect(estado(r, "encaminhamento")).toBe("feita");
    expect(estado(r, "analise")).toBe("atual");
    expect(r.proximo).toBe("Aguardando a análise do setor Logística.");
  });

  it("produto a caminho segura a resolução", () => {
    const r = etapasEProximo({
      ...base,
      analiseDoSetor: true,
      devolucao: "AGUARDANDO",
    });
    expect(estado(r, "produto")).toBe("atual");
    expect(estado(r, "resolucao")).toBe("pendente");
    expect(r.proximo).toMatch(/produto chegar/);
  });

  it("analisada sem devolução: produto dispensado e falta resolver", () => {
    const r = etapasEProximo({ ...base, analiseDoSetor: true });
    expect(estado(r, "produto")).toBe("dispensada");
    expect(estado(r, "resolucao")).toBe("atual");
  });

  it("resolvida não tem próximo passo", () => {
    const r = etapasEProximo({
      ...base,
      analiseDoSetor: true,
      dataAcao: "2026-10-10",
    });
    expect(r.proximo).toBeNull();
    expect(estado(r, "resolucao")).toBe("feita");
  });
});

describe("ServicoLinhaDoTempo", () => {
  function repoFalso(setorNome: string) {
    const buscas: unknown[] = [];
    const repo: RepositorioLinha = {
      async obter(where) {
        buscas.push(where);
        const e = (where as { AND?: unknown[] }).AND?.[1] as
          | { setorResp: { nome: { in: string[] } } }
          | undefined;
        if (e && !e.setorResp.nome.in.includes(setorNome)) return null;
        return dados();
      },
    };
    return { repo, buscas };
  }

  it("quem vê todos os setores lê qualquer reclamação", async () => {
    const { repo, buscas } = repoFalso("Logística");
    const r = await new ServicoLinhaDoTempo(repo).obter("r1", {
      perfil: "gestor",
      setores: [],
    });
    expect(r?.eventos.length).toBeGreaterThan(0);
    expect(buscas[0]).toEqual({ id: "r1", treino: false });
  });

  it("responsável de outro setor recebe null, como se não existisse", async () => {
    const { repo } = repoFalso("Logística");
    const r = await new ServicoLinhaDoTempo(repo).obter("r1", {
      perfil: "responsavel_setor",
      setores: ["Solda"],
    });
    expect(r).toBeNull();
  });

  it("a busca leva o filtro do setor do responsável", async () => {
    const { repo, buscas } = repoFalso("Logística");
    await new ServicoLinhaDoTempo(repo).obter("r1", {
      perfil: "responsavel_setor",
      setores: ["Logística"],
    });
    expect(buscas[0]).toEqual({
      AND: [
        { id: "r1", treino: false },
        { setorResp: { nome: { in: ["Logística"] } } },
      ],
    });
  });
});
