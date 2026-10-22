import { describe, expect, it } from "vitest";
import {
  ALERT_CONFIG_PADRAO,
  atribuivelABancada,
  avaliarAlertasReclamacao,
  CAUSA_POR_ID,
  CAUSAS,
  causaDe,
  classificar,
  classificarTodas,
  custoTotal,
  detectarPeca,
  mesclarPermissoes,
  podeVerSetor,
  rascunhoAtrasado,
  setorResp,
  situacao,
  temPermissao,
  tempoDe,
} from "./index";

describe("situação da reclamação", () => {
  it("é resolvida quando há data de ação", () => {
    expect(situacao({ dataAcao: "2026-01-10", devolucao: "AGUARDANDO" })).toBe(
      "resolvida",
    );
  });

  it("fica aguardando enquanto o produto não voltou", () => {
    expect(situacao({ devolucao: "AGUARDANDO" })).toBe("aguardando");
  });

  it("fica em tratativa sem devolução ou com o produto recebido", () => {
    expect(situacao({ devolucao: "NA" })).toBe("tratativa");
    expect(situacao({ devolucao: "RECEBIDO" })).toBe("tratativa");
    expect(situacao({})).toBe("tratativa");
  });
});

describe("custo e tempo", () => {
  it("soma os componentes do custo", () => {
    expect(
      custoTotal({
        freteEnvio: 10,
        freteRetorno: 5,
        valorPeca: 20,
        estorno: 0,
        desconto: 3,
        guia: 2,
      }),
    ).toBe(40);
  });

  it("conta os dias até a ação", () => {
    expect(tempoDe({ data: "2026-01-01", dataAcao: "2026-01-04" })).toBe(3);
  });
});

describe("classificação por causa", () => {
  it("detecta kit faltando", () => {
    expect(
      classificar({
        laudo: "FALTANDO PEÇAS/ACESSÓRIOS",
        reclamacao: "FALTOU OS PARAFUSOS",
      }),
    ).toBe("kit");
  });

  it("não repete o item genérico quando o kit já entrou", () => {
    const ids = classificarTodas({
      laudo: "FALTANDO PEÇAS/ACESSÓRIOS",
      reclamacao: "FALTOU OS PARAFUSOS",
    });
    expect(ids).toContain("kit");
    expect(ids).not.toContain("item");
  });

  it("mantém avaria e falha elétrica quando as duas aparecem", () => {
    const ids = classificarTodas({
      reclamacao: "Produto chegou amassado e não liga",
    });
    expect(ids).toContain("avaria");
    expect(ids).toContain("eletrico");
  });

  it("manípulo quebrado não duplica avaria", () => {
    const ids = classificarTodas({
      reclamacao: "Manípulo quebrado na máquina de corte",
    });
    expect(ids).toContain("manipulo");
    expect(ids).not.toContain("avaria");
  });

  it("encontra a peça citada", () => {
    expect(detectarPeca({ reclamacao: "faltou kit de parafuso" })).toBe(
      "Kit de parafusos",
    );
  });

  it("a causa define o setor, e a troca manual vence", () => {
    expect(setorResp({ causaManual: true, causaId: "solda" })).toBe("Solda");
    expect(
      setorResp({
        causaManual: true,
        causaId: "solda",
        setorRespManual: "Qualidade / Engenharia",
      }),
    ).toBe("Qualidade / Engenharia");
  });
});

describe("origem da causa", () => {
  it("existe para as causas que o catálogo deixa claras", () => {
    expect(CAUSA_POR_ID.avaria.origem).toBe("transporte");
    expect(CAUSA_POR_ID.kit.origem).toBe("embalagem");
    expect(CAUSA_POR_ID.solda.origem).toBe("montagem");
    expect(CAUSA_POR_ID.anuncio.origem).toBe("venda");
  });

  it("fica nula onde o cliente ainda não decidiu", () => {
    for (const id of [
      "prazo",
      "manipulo",
      "ferrugem",
      "pintura",
      "eletrico",
      "furacao",
      "defeito",
      "outros",
    ]) {
      expect(CAUSA_POR_ID[id].origem).toBeNull();
    }
  });

  it("chega junto na causa resolvida de uma reclamação", () => {
    expect(causaDe({ causaManual: true, causaId: "voltagem" }).origem).toBe(
      "montagem",
    );
  });

  it("todas as 22 causas do catálogo têm setor responsável", () => {
    expect(CAUSAS).toHaveLength(22);
    for (const c of CAUSAS) expect(c.setor).not.toBe("");
  });
});

describe("alertas", () => {
  it("aguardando produto passa de 7 dias", () => {
    const tipos = avaliarAlertasReclamacao(
      { data: "2026-01-01", devolucao: "AGUARDANDO" },
      ALERT_CONFIG_PADRAO,
      "2026-01-15",
    );
    expect(tipos).toContain("AGUARDANDO_DIAS");
  });

  it("tratativa passa da meta de 2 dias", () => {
    const tipos = avaliarAlertasReclamacao(
      { data: "2026-01-01" },
      ALERT_CONFIG_PADRAO,
      "2026-01-05",
    );
    expect(tipos).toContain("TRATATIVA_META");
  });

  it("custo alto avisa mesmo dentro do prazo", () => {
    const tipos = avaliarAlertasReclamacao(
      { data: "2026-01-01", valorPeca: 600 },
      ALERT_CONFIG_PADRAO,
      "2026-01-01",
    );
    expect(tipos).toContain("CUSTO_ALTO");
  });

  it("reclamação resolvida não gera alerta", () => {
    const tipos = avaliarAlertasReclamacao(
      { data: "2026-01-01", dataAcao: "2026-01-02", valorPeca: 900 },
      ALERT_CONFIG_PADRAO,
      "2026-03-01",
    );
    expect(tipos).toEqual([]);
  });

  it("rascunho parado além de 24 horas é atrasado", () => {
    const capturado = new Date("2026-01-01T00:00:00Z");
    expect(rascunhoAtrasado(capturado, new Date("2026-01-01T23:00:00Z"))).toBe(
      false,
    );
    expect(rascunhoAtrasado(capturado, new Date("2026-01-02T01:00:00Z"))).toBe(
      true,
    );
  });
});

describe("permissões e escopo de setor", () => {
  it("administrador sempre tem tudo", () => {
    const adm = mesclarPermissoes("administrador", [
      { chave: "painel.ver", permitido: false },
    ]);
    expect(temPermissao(adm, "painel.ver")).toBe(true);
  });

  it("override remove uma permissão do perfil", () => {
    const restrito = mesclarPermissoes("gestor", [
      { chave: "capturas.tratar", permitido: false },
    ]);
    expect(temPermissao(restrito, "capturas.tratar")).toBe(false);
    expect(temPermissao(restrito, "painel.ver")).toBe(true);
  });

  it("operação não troca setor nem vê o painel", () => {
    const op = mesclarPermissoes("operacao", []);
    expect(temPermissao(op, "reclamacoes.trocar_setor")).toBe(false);
    expect(temPermissao(op, "painel.ver")).toBe(false);
  });

  it("responsável de setor analisa, mas não cria", () => {
    const resp = mesclarPermissoes("responsavel_setor", []);
    expect(temPermissao(resp, "reclamacoes.analisar")).toBe(true);
    expect(temPermissao(resp, "reclamacoes.criar")).toBe(false);
  });

  it("relatórios: gestor e responsável de setor veem; operação não", () => {
    expect(
      temPermissao(mesclarPermissoes("gestor", []), "relatorios.ver"),
    ).toBe(true);
    expect(
      temPermissao(
        mesclarPermissoes("responsavel_setor", []),
        "relatorios.ver",
      ),
    ).toBe(true);
    expect(
      temPermissao(mesclarPermissoes("operacao", []), "relatorios.ver"),
    ).toBe(false);
  });

  it("só causa de origem montagem é atribuída à bancada", () => {
    expect(atribuivelABancada("montagem")).toBe(true);
    for (const o of [
      "componente_lote",
      "projeto",
      "embalagem",
      "transporte",
      "venda",
      null,
      undefined,
    ]) {
      expect(atribuivelABancada(o)).toBe(false);
    }
  });

  it("responsável de setor só vê o próprio setor", () => {
    expect(podeVerSetor("responsavel_setor", ["Solda"], "Solda")).toBe(true);
    expect(podeVerSetor("responsavel_setor", ["Solda"], "Logística")).toBe(
      false,
    );
    expect(podeVerSetor("gestor", [], "Logística")).toBe(true);
    expect(podeVerSetor("operacao", [], "Logística")).toBe(true);
  });
});
