import { z } from "zod";

export const esquemaSintesePlano = z
  .object({
    padroes: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
    hipoteses: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
    evidencias: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
    lacunas: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
    resumo: z.string().trim().min(20).max(1200),
  })
  .strict();

export type SintesePlano = z.infer<typeof esquemaSintesePlano>;

export const esquemaRedacaoPlano = z
  .object({
    titulo: z.string().trim().min(3).max(160),
    descricao: z.string().trim().min(20).max(4000),
    prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
    avisos: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  })
  .strict();

export type RedacaoPlano = z.infer<typeof esquemaRedacaoPlano>;
