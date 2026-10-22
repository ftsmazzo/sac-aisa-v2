import { urlDaApi } from "@/lib/sessao";

/**
 * Repassa /api/auth/* para a API. Assim o cookie de sessão fica no domínio da web.
 * Só rotas listadas passam, e o IP real da pessoa segue no cabeçalho para o
 * limite de tentativas contar por pessoa, e não pelo IP deste servidor.
 */
const PREFIXOS_PERMITIDOS = ["auth", "admin"];
const CABECALHOS_DE_ENTRADA = [
  "cookie",
  "content-type",
  "origin",
  "user-agent",
];

type Contexto = { params: Promise<{ caminho: string[] }> };

async function repassar(req: Request, ctx: Contexto): Promise<Response> {
  const { caminho } = await ctx.params;
  const invalido =
    !PREFIXOS_PERMITIDOS.includes(caminho[0]) ||
    caminho.some((s) => s === "." || s === ".." || s.includes("\\"));
  if (invalido) return new Response("Não encontrado.", { status: 404 });

  const busca = new URL(req.url).search;
  const destino = `${urlDaApi()}/${caminho.map(encodeURIComponent).join("/")}${busca}`;

  const cabecalhos = new Headers();
  for (const nome of CABECALHOS_DE_ENTRADA) {
    const valor = req.headers.get(nome);
    if (valor) cabecalhos.set(nome, valor);
  }
  const ip = req.headers.get("x-forwarded-for");
  if (ip) cabecalhos.set("x-forwarded-for", ip);

  try {
    const resposta = await fetch(destino, {
      method: req.method,
      headers: cabecalhos,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
      redirect: "manual",
      cache: "no-store",
    });

    const saida = new Headers({ "cache-control": "no-store" });
    for (const nome of ["content-type", "retry-after"]) {
      const valor = resposta.headers.get(nome);
      if (valor) saida.set(nome, valor);
    }
    for (const cookie of resposta.headers.getSetCookie()) {
      saida.append("set-cookie", cookie);
    }
    return new Response(resposta.status === 204 ? null : resposta.body, {
      status: resposta.status,
      headers: saida,
    });
  } catch {
    return Response.json(
      { message: "Serviço indisponível no momento." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export { repassar as GET, repassar as POST };
