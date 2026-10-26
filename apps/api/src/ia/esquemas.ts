import { z } from "zod";
import { temMarcadorDeRedacao, temMarcadorDesconhecido } from "./redacao";

/** Texto do modelo vira JSON. Cerca de código e texto em volta são tirados; o resto é recusado, nunca "consertado". */
export function lerJson(texto: string): unknown {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(limpo);
}

export function esquemaTriagem(causaIds: string[], chaves: string[]) {
  if (causaIds.length === 0) throw new Error("Sem causas para a IA escolher.");
  return z
    .object({
      causaId: z.enum(causaIds as [string, ...string[]]),
      confianca: z.number().min(0).max(1),
      sintese: z.string().trim().min(1).max(300),
      respondidas: z
        .array(
          z
            .object({
              chave: z.string().refine((c) => chaves.includes(c)),
              valor: z.string().trim().min(1).max(200),
            })
            .strict(),
        )
        .max(30)
        .default([]),
    })
    .strict();
}
export type SaidaTriagem = z.infer<ReturnType<typeof esquemaTriagem>>;

export function esquemaPergunta(chavesFaltantes: string[]) {
  return z
    .object({
      mensagem: z
        .string()
        .trim()
        .min(10)
        .max(700)
        .refine((m) => !temMarcadorDesconhecido(m), "marcador desconhecido")
        .refine((m) => !temMarcadorDeRedacao(m), "marcador de redação"),
      perguntaChaves: z
        .array(z.string().refine((c) => chavesFaltantes.includes(c)))
        .min(1)
        .max(3),
    })
    .strict();
}
export type SaidaPergunta = z.infer<ReturnType<typeof esquemaPergunta>>;

export function esquemaResposta() {
  return z
    .object({
      mensagem: z
        .string()
        .trim()
        .min(10)
        .max(1500)
        .refine((m) => !temMarcadorDesconhecido(m), "marcador desconhecido")
        .refine((m) => !temMarcadorDeRedacao(m), "marcador de redação"),
    })
    .strict();
}
