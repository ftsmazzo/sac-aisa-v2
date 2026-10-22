import { buscarNaApi, type OpcoesFiltro } from "@/lib/reclamacoes";
import { data } from "@/lib/reclamacoes-formato";
import {
  consultaRelatorio,
  lerFiltrosUrl,
  type RelatorioApi,
  relatorioParaCsv,
} from "@/lib/relatorios-formato";
import { obterUsuario } from "@/lib/sessao";

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Baixa o relatório em CSV. A API confere a permissão e o escopo; aqui só repassa. */
export async function GET(req: Request) {
  const usuario = await obterUsuario();
  if (!usuario) return new Response("Faça login.", { status: 401 });
  if (!usuario.permissoes.includes("relatorios.ver")) {
    return new Response("Sem acesso aos relatórios.", { status: 403 });
  }

  const filtros = lerFiltrosUrl(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const [relatorio, opcoes] = await Promise.all([
    buscarNaApi<RelatorioApi>(`/relatorios?${consultaRelatorio(filtros)}`),
    buscarNaApi<OpcoesFiltro>("/reclamacoes/filtros"),
  ]);
  if (!relatorio.ok) {
    return new Response(relatorio.mensagem ?? "Relatório indisponível.", {
      status: relatorio.status === 400 ? 400 : 502,
    });
  }

  const nome = (l: { id: string; nome: string }[] | undefined, id?: string) =>
    id ? (l?.find((x) => x.id === id)?.nome ?? id) : "Todos";
  const o = opcoes.ok ? opcoes.dados : undefined;
  const periodo =
    filtros.de || filtros.ate
      ? `${filtros.de ? data(filtros.de) : "início"} a ${filtros.ate ? data(filtros.ate) : "hoje"}`
      : "Todo o período";
  const csv = relatorioParaCsv(relatorio.dados, [
    ["Período", periodo],
    ["Marca", nome(o?.marcas, filtros.marca)],
    ["Setor", nome(o?.setores, filtros.setor)],
    ["Causa", nome(o?.causas, filtros.causa)],
    ["Gerado em", data(hojeEmBrasilia())],
  ]);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="relatorio-reclamacoes-${hojeEmBrasilia()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
