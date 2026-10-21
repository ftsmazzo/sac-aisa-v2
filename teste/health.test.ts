import { describe, expect, it } from "vitest";
import { GET } from "../app/health/route";

describe("GET /health", () => {
  it("responde ok sem consultar banco", async () => {
    const resposta = GET();
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ status: "ok" });
  });
});
