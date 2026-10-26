import { cookies } from "next/headers";
import { urlDaApi } from "@/lib/sessao";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A foto fica na API. Esta rota só repassa para quem já tem sessão. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; fotoId: string }> },
) {
  const { id, fotoId } = await ctx.params;
  if (!ID.test(id) || !ID.test(fotoId)) {
    return new Response("Não encontrado.", { status: 404 });
  }
  const token = (await cookies()).get("sac_sessao")?.value;
  if (!token) return new Response("Entre para continuar.", { status: 401 });
  const r = await fetch(`${urlDaApi()}/reclamacoes/${id}/fotos/${fotoId}`, {
    headers: { cookie: `sac_sessao=${encodeURIComponent(token)}` },
    redirect: "manual",
    cache: "no-store",
  });
  if (r.status >= 300 && r.status < 400) {
    const para = r.headers.get("location");
    if (para?.startsWith("https://")) return Response.redirect(para, 302);
    return new Response("Foto não encontrada.", { status: 404 });
  }
  if (!r.ok) return new Response("Foto não encontrada.", { status: r.status });
  return new Response(r.body, {
    headers: {
      "content-type":
        r.headers.get("content-type") ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
