import { describe, expect, it } from "vitest";
import {
  acoesDaEtapa,
  ALERT_CONFIG_PADRAO,
  avaliarAlertasReclamacao,
  calcularRelogios,
  ESTADOS,
  type Estado,
  estadoDaSituacaoLegada,
  marcasVisiveis,
  type Perfil,
  quemPodeTransicionar,
  transicoesPermitidas,
  validarTransicao,
} from "./index";

const PERFIS: Perfil[] = [
  "administrador",
  "gestor",
  "operacao",
  "responsavel_setor",
];

const tenta = (
  perfil: Perfil,
  de: Estado,
  para: Estado,
  extra: {
    motivo?: string;
    devolucao?: string;
    temSetor?: boolean;
    temSolucao?: boolean;
    respostaEnviada?: boolean;
  } = {},
) =>
  validarTransicao({
    perfil,
    de,
    para,
    devolucao: extra.devolucao ?? "NA",
    temSetor: extra.temSetor ?? true,
    motivo: extra.motivo,
    temSolucao: extra.temSolucao,
    respostaEnviada: extra.respostaEnviada,
  });

describe("matriz de transições", () => {
  const SAC: [Estado, Estado][] = [
    ["triagem", "aguardando_cliente"],
    ["aguardando_cliente", "triagem"],
    ["triagem", "encaminhada"],
    ["aguardando_cliente", "encaminhada"],
    ["triagem", "recebida"],
    ["aguardando_cliente", "recebida"],
    ["resolvida_setor", "finalizada"],
  ];
  const SETOR: [Estado, Estado][] = [
    ["encaminhada", "recebida"],
    ["encaminhada", "resolvida_setor"],
    ["recebida", "em_tratativa"],
    ["recebida", "resolvida_setor"],
    ["em_tratativa", "resolvida_setor"],
  ];

  it("o SAC faz Triagem, Aguardando cliente, Encaminhar e Finalizar", () => {
    for (const [de, para] of SAC) {
      expect(tenta("operacao", de, para).ok, `${de}→${para}`).toBe(true);
    }
  });

  it("o setor faz Receber, Em tratativa e Resolvida no setor técnico", () => {
    for (const [de, para] of SETOR) {
      expect(tenta("responsavel_setor", de, para).ok, `${de}→${para}`).toBe(
        true,
      );
    }
    expect(
      tenta("responsavel_setor", "em_tratativa", "recebida", {
        motivo: "Vai para a pintura.",
      }).ok,
    ).toBe(true);
    expect(tenta("responsavel_setor", "em_tratativa", "recebida").ok).toBe(
      false,
    );
  });

  it("o SAC não faz o que é do setor, e o setor não faz o que é do SAC", () => {
    for (const [de, para] of SETOR) {
      expect(tenta("operacao", de, para)).toMatchObject({
        ok: false,
        codigo: "sem_permissao",
      });
    }
    for (const [de, para] of SAC) {
      expect(tenta("responsavel_setor", de, para)).toMatchObject({
        ok: false,
        codigo: "sem_permissao",
      });
    }
  });

  it("transição que não existe no fluxo é recusada para SAC e setor", () => {
    expect(tenta("operacao", "triagem", "finalizada")).toMatchObject({
      ok: false,
      codigo: "invalida",
    });
    expect(tenta("responsavel_setor", "triagem", "recebida")).toMatchObject({
      ok: false,
      codigo: "sem_permissao",
    });
    expect(tenta("responsavel_setor", "recebida", "encaminhada")).toMatchObject(
      { ok: false, codigo: "invalida" },
    );
  });

  it("ficar no mesmo estado não é transição", () => {
    for (const p of PERFIS) {
      expect(tenta(p, "recebida", "recebida")).toMatchObject({
        ok: false,
        codigo: "igual",
      });
    }
  });

  it("gestor e administrador podem qualquer uma, com motivo fora do fluxo", () => {
    for (const perfil of ["gestor", "administrador"] as const) {
      for (const de of ESTADOS) {
        for (const para of ESTADOS) {
          if (de === para) continue;
          const sem = tenta(perfil, de, para);
          const com = tenta(perfil, de, para, { motivo: "Ajuste do gestor." });
          expect(com.ok, `${perfil} ${de}→${para}`).toBe(true);
          if (!sem.ok) expect(sem.codigo).toBe("motivo");
        }
      }
    }
  });

  it("no fluxo normal o gestor não precisa de motivo", () => {
    expect(tenta("gestor", "encaminhada", "recebida").ok).toBe(true);
    expect(tenta("gestor", "triagem", "recebida").ok).toBe(true);
    expect(tenta("gestor", "triagem", "em_tratativa")).toMatchObject({
      ok: false,
      codigo: "motivo",
    });
  });

  it("a matriz lista quem pode cada transição", () => {
    expect(quemPodeTransicionar("triagem", "encaminhada")).toEqual([
      "sac",
      "total",
    ]);
    expect(quemPodeTransicionar("recebida", "em_tratativa")).toEqual([
      "setor",
      "total",
    ]);
    expect(quemPodeTransicionar("triagem", "recebida")).toEqual([
      "sac",
      "total",
    ]);
    expect(quemPodeTransicionar("triagem", "triagem")).toEqual([]);
  });

  it("reabertura volta a Encaminhada ao setor, com motivo, e é do SAC", () => {
    for (const de of ["resolvida_setor", "finalizada"] as const) {
      expect(tenta("operacao", de, "encaminhada")).toMatchObject({
        ok: false,
        codigo: "motivo",
      });
      expect(
        tenta("operacao", de, "encaminhada", { motivo: "Não resolveu." }),
      ).toMatchObject({ ok: true, reabertura: true });
      expect(
        tenta("responsavel_setor", de, "encaminhada", { motivo: "x" }),
      ).toMatchObject({ ok: false, codigo: "sem_permissao" });
      expect(
        tenta("gestor", de, "encaminhada", { motivo: "Voltou." }),
      ).toMatchObject({ ok: true, reabertura: true });
    }
    // Reabertura não é um estado: não existe "reaberta" na lista.
    expect(ESTADOS as readonly string[]).not.toContain("reaberta");
  });

  it("motivo longo demais é recusado", () => {
    expect(
      tenta("operacao", "finalizada", "encaminhada", {
        motivo: "x".repeat(201),
      }),
    ).toMatchObject({ ok: false, codigo: "motivo" });
  });

  it("encaminhar exige setor responsável", () => {
    expect(
      tenta("operacao", "triagem", "encaminhada", { temSetor: false }),
    ).toMatchObject({ ok: false, codigo: "sem_setor" });
  });

  it("tratativa só depois do produto recebido, ou sem devolução", () => {
    for (const [de, para] of [
      ["recebida", "em_tratativa"],
      ["em_tratativa", "resolvida_setor"],
    ] as const) {
      expect(
        tenta("responsavel_setor", de, para, { devolucao: "AGUARDANDO" }),
      ).toMatchObject({ ok: false, codigo: "produto_nao_recebido" });
      expect(
        tenta("responsavel_setor", de, para, { devolucao: "RECEBIDO" }).ok,
      ).toBe(true);
    }
    // Nem o gestor pula essa regra.
    expect(
      tenta("gestor", "recebida", "finalizada", {
        motivo: "x",
        devolucao: "AGUARDANDO",
      }),
    ).toMatchObject({ ok: false, codigo: "produto_nao_recebido" });
  });

  it("as opções da tela são as que o perfil pode fazer", () => {
    const para = (p: Perfil, de: Estado) =>
      transicoesPermitidas(p, de).map((o) => o.para);
    expect(para("operacao", "triagem")).toEqual([
      "aguardando_cliente",
      "encaminhada",
      "recebida",
    ]);
    expect(para("responsavel_setor", "triagem")).toEqual([]);
    expect(para("responsavel_setor", "encaminhada")).toEqual([
      "recebida",
      "resolvida_setor",
    ]);
    expect(para("operacao", "resolvida_setor")).toEqual([
      "encaminhada",
      "finalizada",
    ]);
    expect(para("gestor", "triagem")).toHaveLength(6);
    expect(transicoesPermitidas("operacao", "finalizada")).toEqual([
      expect.objectContaining({
        para: "encaminhada",
        reabertura: true,
        exigeMotivo: true,
      }),
    ]);
  });

  it("a ficha mostra só o passo da etapa, com o nome da ação", () => {
    const rotulos = (p: Perfil, de: Estado) =>
      acoesDaEtapa(p, de)
        .filter((o) => !o.excepcional)
        .map((o) => o.rotulo);
    expect(rotulos("operacao", "triagem")).toEqual([
      "Pedir informação ao cliente",
      "Encaminhar ao setor",
    ]);
    expect(rotulos("operacao", "aguardando_cliente")).toEqual([
      "O cliente respondeu",
      "Encaminhar ao setor",
    ]);
    expect(rotulos("responsavel_setor", "recebida")).toEqual([
      "Devolver ao SAC",
    ]);
    expect(rotulos("responsavel_setor", "em_tratativa")).toEqual([
      "Devolver ao SAC",
      "Encaminhar a outro setor",
    ]);
    expect(rotulos("operacao", "resolvida_setor")).toEqual([
      "Fechar a reclamação",
      "Reabrir com o setor",
    ]);
    expect(rotulos("responsavel_setor", "triagem")).toEqual([]);
    expect(acoesDaEtapa("gestor", "triagem").some((o) => o.excepcional)).toBe(
      true,
    );
    expect(acoesDaEtapa("operacao", "triagem").some((o) => o.excepcional)).toBe(
      false,
    );
  });

  it("encaminhar já deixa recebida pelo setor e exige setor", () => {
    expect(tenta("operacao", "triagem", "recebida").ok).toBe(true);
    expect(
      tenta("operacao", "triagem", "recebida", { temSetor: false }),
    ).toMatchObject({ ok: false, codigo: "sem_setor" });
    expect(tenta("responsavel_setor", "triagem", "recebida").ok).toBe(false);
  });

  it("fechar exige solução e resposta enviada quando a regra é consultada", () => {
    expect(
      tenta("operacao", "resolvida_setor", "finalizada", {
        temSolucao: false,
        respostaEnviada: false,
      }),
    ).toMatchObject({ ok: false, codigo: "sem_fechamento" });
    expect(
      tenta("operacao", "resolvida_setor", "finalizada", {
        temSolucao: true,
        respostaEnviada: true,
      }).ok,
    ).toBe(true);
  });
});

describe("estado dos dados antigos", () => {
  it("com data de ação, finalizada; aguardando produto, recebida; o resto em tratativa", () => {
    expect(
      estadoDaSituacaoLegada({ dataAcao: "2026-01-02", devolucao: "NA" }),
    ).toBe("finalizada");
    expect(
      estadoDaSituacaoLegada({ dataAcao: null, devolucao: "AGUARDANDO" }),
    ).toBe("recebida");
    expect(
      estadoDaSituacaoLegada({ dataAcao: null, devolucao: "RECEBIDO" }),
    ).toBe("em_tratativa");
    expect(estadoDaSituacaoLegada({ dataAcao: null, devolucao: "NA" })).toBe(
      "em_tratativa",
    );
    expect(
      estadoDaSituacaoLegada({
        dataAcao: null,
        devolucao: "NA",
        rascunho: true,
      }),
    ).toBe("triagem");
  });
});

describe("relógios por etapa", () => {
  const H = 3600e3;
  const t0 = Date.parse("2026-10-20T12:00:00Z");
  const em = (horas: number) => new Date(t0 + horas * H);
  const passo = (estado: Estado, horas: number) => ({
    estado,
    quando: em(horas),
  });

  it("mede o tempo em cada estado, o recebimento, a tratativa e a finalização", () => {
    const r = calcularRelogios({
      historico: [
        passo("triagem", 0),
        passo("encaminhada", 2),
        passo("recebida", 5),
        passo("em_tratativa", 6),
        passo("resolvida_setor", 30),
        passo("finalizada", 33),
      ],
      agora: em(40),
      hoje: "2026-10-22",
    });
    expect(r.porEstadoMs.triagem).toBe(2 * H);
    expect(r.porEstadoMs.encaminhada).toBe(3 * H);
    expect(r.ateRecebimentoMs).toBe(3 * H);
    expect(r.ateRecebimentoEmCurso).toBe(false);
    expect(r.tratativaMs).toBe(24 * H);
    expect(r.ateFinalizacaoMs).toBe(3 * H);
    expect(r.ateFinalizacaoEmCurso).toBe(false);
    // Depois de finalizada nada mais corre.
    expect(r.porEstadoMs.finalizada).toBe(0);
    expect(r.internoMs).toBe(33 * H);
    expect(r.pausado).toBe(false);
  });

  it("o relógio interno pausa em Aguardando cliente e o prazo do marketplace continua", () => {
    const r = calcularRelogios({
      historico: [
        passo("triagem", 0),
        passo("aguardando_cliente", 1),
        passo("triagem", 49),
      ],
      agora: em(51),
      hoje: "2026-10-22",
      prazoMarketplace: "2026-10-23",
    });
    expect(r.porEstadoMs.aguardando_cliente).toBe(48 * H);
    expect(r.internoMs).toBe(3 * H);
    // O prazo do canal contou os dias corridos, inclusive os de espera.
    expect(r.marketplace).toEqual({
      prazo: "2026-10-23",
      diasRestantes: 1,
      vencido: false,
      encerrado: false,
    });
  });

  it("esperando o cliente agora: o relógio está pausado e não anda", () => {
    const hist = [passo("triagem", 0), passo("aguardando_cliente", 2)];
    const a = calcularRelogios({
      historico: hist,
      agora: em(10),
      hoje: "2026-10-20",
    });
    const b = calcularRelogios({
      historico: hist,
      agora: em(100),
      hoje: "2026-10-24",
    });
    expect(a.pausado).toBe(true);
    expect(a.internoMs).toBe(2 * H);
    expect(b.internoMs).toBe(2 * H);
    expect(b.porEstadoMs.aguardando_cliente).toBe(98 * H);
  });

  it("recebimento e finalização em curso contam até agora", () => {
    const a = calcularRelogios({
      historico: [passo("triagem", 0), passo("encaminhada", 1)],
      agora: em(5),
      hoje: "2026-10-20",
    });
    expect(a.ateRecebimentoMs).toBe(4 * H);
    expect(a.ateRecebimentoEmCurso).toBe(true);
    const b = calcularRelogios({
      historico: [
        passo("encaminhada", 0),
        passo("recebida", 1),
        passo("em_tratativa", 2),
        passo("resolvida_setor", 4),
      ],
      agora: em(10),
      hoje: "2026-10-20",
    });
    expect(b.ateFinalizacaoMs).toBe(6 * H);
    expect(b.ateFinalizacaoEmCurso).toBe(true);
  });

  it("reabrir soma as passagens e o recebimento vale para o último encaminhamento", () => {
    const r = calcularRelogios({
      historico: [
        passo("encaminhada", 0),
        passo("recebida", 1),
        passo("em_tratativa", 2),
        passo("resolvida_setor", 4),
        passo("finalizada", 5),
        passo("encaminhada", 10),
        passo("recebida", 12),
        passo("em_tratativa", 12.5),
      ],
      agora: em(20),
      hoje: "2026-10-20",
    });
    expect(r.ateRecebimentoMs).toBe(2 * H);
    expect(r.porEstadoMs.em_tratativa).toBe(2 * H + 7.5 * H);
  });

  it("prazo estourado e prazo parado depois de finalizada", () => {
    const aberto = calcularRelogios({
      historico: [passo("em_tratativa", 0)],
      agora: em(1),
      hoje: "2026-10-22",
      prazoMarketplace: "2026-10-20",
    });
    expect(aberto.marketplace).toMatchObject({
      diasRestantes: -2,
      vencido: true,
      encerrado: false,
    });
    const fechado = calcularRelogios({
      historico: [passo("em_tratativa", 0), passo("finalizada", 24)],
      agora: new Date("2026-11-30T00:00:00Z"),
      hoje: "2026-11-30",
      prazoMarketplace: "2026-10-25",
    });
    expect(fechado.marketplace).toMatchObject({
      diasRestantes: 4,
      vencido: false,
      encerrado: true,
    });
  });

  it("sem histórico nada quebra", () => {
    const r = calcularRelogios({
      historico: [],
      agora: em(1),
      hoje: "2026-10-20",
    });
    expect(r.internoMs).toBe(0);
    expect(r.ateRecebimentoMs).toBeNull();
    expect(r.marketplace).toBeNull();
  });
});

describe("alertas da jornada", () => {
  const agora = new Date("2026-10-22T12:00:00Z");
  const hoje = "2026-10-22";
  const base = {
    data: "2026-10-22",
    devolucao: "NA",
    reclamacao: "Peça amassada.",
  };
  const avaliar = (r: Parameters<typeof avaliarAlertasReclamacao>[0]) =>
    avaliarAlertasReclamacao(r, ALERT_CONFIG_PADRAO, hoje, agora);

  it("sem recebimento do setor depois de 24 h encaminhada", () => {
    expect(
      avaliar({
        ...base,
        estado: "encaminhada",
        estadoDesde: "2026-10-21T11:00:00Z",
      }),
    ).toContain("SEM_RECEBIMENTO_SETOR");
    expect(
      avaliar({
        ...base,
        estado: "encaminhada",
        estadoDesde: "2026-10-21T13:00:00Z",
      }),
    ).not.toContain("SEM_RECEBIMENTO_SETOR");
    expect(
      avaliar({
        ...base,
        estado: "recebida",
        estadoDesde: "2026-10-01T00:00:00Z",
      }),
    ).not.toContain("SEM_RECEBIMENTO_SETOR");
  });

  it("solução devolvida sem finalização depois de 24 h", () => {
    const r = {
      ...base,
      dataAcao: "2026-10-21",
      estado: "resolvida_setor",
      estadoDesde: "2026-10-21T10:00:00Z",
    };
    expect(avaliar(r)).toContain("SOLUCAO_SEM_FINALIZACAO");
    expect(
      avaliar({ ...r, estadoDesde: "2026-10-22T10:00:00Z" }),
    ).not.toContain("SOLUCAO_SEM_FINALIZACAO");
    expect(avaliar({ ...r, estado: "finalizada" })).not.toContain(
      "SOLUCAO_SEM_FINALIZACAO",
    );
  });

  it("prazo do marketplace avisa perto de vencer e some depois de finalizada", () => {
    const r = {
      ...base,
      estado: "em_tratativa",
      estadoDesde: "2026-10-22T00:00:00Z",
      prazoMarketplace: "2026-10-23",
    };
    expect(avaliar(r)).toContain("PRAZO_MARKETPLACE");
    expect(avaliar({ ...r, prazoMarketplace: "2026-10-25" })).not.toContain(
      "PRAZO_MARKETPLACE",
    );
    expect(avaliar({ ...r, estado: "finalizada" })).not.toContain(
      "PRAZO_MARKETPLACE",
    );
  });

  it("esperar o cliente não conta como tratativa parada", () => {
    expect(
      avaliar({
        ...base,
        data: "2026-10-01",
        estado: "aguardando_cliente",
        estadoDesde: "2026-10-01T00:00:00Z",
      }),
    ).not.toContain("TRATATIVA_META");
  });
});

describe("marcas do usuário", () => {
  it("só o responsável de setor é limitado, e lista vazia vale como todas", () => {
    expect(marcasVisiveis("responsavel_setor", ["AISA"])).toEqual(["AISA"]);
    expect(marcasVisiveis("responsavel_setor", [])).toBeNull();
    for (const p of ["operacao", "gestor", "administrador"] as const) {
      expect(marcasVisiveis(p, ["AISA"])).toBeNull();
    }
  });
});
