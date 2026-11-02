import { describe, expect, it } from "vitest";
import {
  agregarFilaSetor,
  agregarPendenteSac,
  ehEstadoFilaSetor,
  ehPendenteSac,
} from "./fila-metricas";

const HOJE = "2026-11-02";

describe("fila-metricas", () => {
  it("distingue fila do setor de pendente SAC", () => {
    expect(ehEstadoFilaSetor("encaminhada")).toBe(true);
    expect(ehEstadoFilaSetor("triagem")).toBe(false);
    expect(ehPendenteSac("triagem")).toBe(true);
    expect(ehPendenteSac("em_tratativa")).toBe(false);
  });

  it("ranking da fila ignora sem setor e triagem", () => {
    const fila = agregarFilaSetor(
      [
        {
          estado: "encaminhada",
          dataAbertura: "2026-10-28",
          estadoDesde: "2026-10-28",
          setorNome: "Solda",
        },
        {
          estado: "em_tratativa",
          dataAbertura: "2026-10-20",
          estadoDesde: "2026-10-25",
          setorNome: "Solda",
        },
        {
          estado: "recebida",
          dataAbertura: "2026-10-30",
          estadoDesde: "2026-10-30",
          setorNome: "Montagem",
        },
        {
          estado: "triagem",
          dataAbertura: "2026-10-01",
          estadoDesde: "2026-10-01",
          setorNome: null,
        },
        {
          estado: "em_tratativa",
          dataAbertura: "2026-10-01",
          estadoDesde: "2026-10-01",
          setorNome: null,
        },
      ],
      HOJE,
    );
    expect(fila.map((x) => x.setor)).toEqual(["Solda", "Montagem"]);
    expect(fila[0]).toMatchObject({
      setor: "Solda",
      encaminhada: 1,
      em_tratativa: 1,
      total: 2,
    });
  });

  it("pendente SAC mede tempo parado desde estadoDesde", () => {
    const p = agregarPendenteSac(
      [
        {
          estado: "triagem",
          dataAbertura: "2026-10-01",
          estadoDesde: "2026-10-28",
          setorNome: null,
        },
        {
          estado: "aguardando_cliente",
          dataAbertura: "2026-10-01",
          estadoDesde: "2026-10-30",
          setorNome: null,
        },
        {
          estado: "encaminhada",
          dataAbertura: "2026-10-01",
          estadoDesde: "2026-10-01",
          setorNome: "Solda",
        },
      ],
      HOJE,
    );
    expect(p.total).toBe(2);
    expect(p.triagem).toBe(1);
    expect(p.aguardando_cliente).toBe(1);
    expect(p.dias_max_parado).toBe(5); // 28→02
    expect(p.significado).toMatch(/Backlog do SAC/);
  });
});
