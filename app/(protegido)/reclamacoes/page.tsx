import Link from "next/link";
import { redirect } from "next/navigation";
import { MarcaDoCadastro } from "@/components/marca-do-cadastro";
import { MarcarTodas } from "@/components/marcar-todas";
import { Selo } from "@/components/ui";
import { comMarcaPadrao, TODAS } from "@/lib/marca-escolhida";
import { marcaAtiva } from "@/lib/marca-servidor";
import {
  buscarNaApi,
  type Ficha,
  type OpcoesFiltro,
  type Pagina,
} from "@/lib/reclamacoes";
import { valoresDaFicha, valoresVazios } from "@/lib/reclamacoes-form";
import {
  CAMPOS_FILTRO,
  type CampoFiltro,
  consultaParaApi,
  data,
  ESTADOS,
  type EstadoLista,
  ehEstado,
  lerEstado,
  moeda,
  montarHref,
  type ParamsUrl,
  ROTULO_ESTADO,
  ROTULO_SITUACAO,
  tomDaSituacao,
  tomDoEstado,
} from "@/lib/reclamacoes-formato";
import { obterUsuario } from "@/lib/sessao";
import { ConteudoFicha } from "./ficha";
import { FormularioReclamacao } from "./formulario";
import { PainelAnalise } from "./painel-analise";
import { PainelFicha } from "./painel-ficha";

/** Hoje no fuso de Brasília, que é o dia que a API usa para recusar data futura. */
function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

const SITUACOES = ["aguardando", "tratativa", "resolvida"] as const;

const ROTULO_CAMPO: Record<CampoFiltro, string> = {
  de: "De",
  ate: "Até",
  marca: "Marca",
  canal: "Canal",
  setor: "Setor",
  causa: "Causa",
  situacao: "Situação",
  estado: "Estado",
  busca: "Busca",
};

/** Texto do chip de um filtro ativo: nome do cadastro, não o id. */
function textoDoFiltro(
  campo: CampoFiltro,
  valor: string,
  o: OpcoesFiltro | null,
): string {
  const achar = (l?: { id: string; nome: string }[]) =>
    l?.find((x) => x.id === valor)?.nome ?? valor;
  switch (campo) {
    case "marca":
      return achar(o?.marcas);
    case "canal":
      return achar(o?.canais);
    case "setor":
      return achar(o?.setores);
    case "causa":
      return achar(o?.causas);
    case "situacao":
      return ROTULO_SITUACAO[valor as keyof typeof ROTULO_SITUACAO] ?? valor;
    case "estado":
      return ehEstado(valor) ? ROTULO_ESTADO[valor] : valor;
    case "de":
    case "ate":
      return data(valor);
    default:
      return valor;
  }
}

function Seletor({
  nome,
  rotulo,
  valor,
  opcoes,
}: {
  nome: string;
  rotulo: string;
  valor?: string;
  opcoes: { id: string; nome: string }[];
}) {
  return (
    <label className="filtro">
      <span className="filtro__rotulo">{rotulo}</span>
      <select name={nome} defaultValue={valor ?? ""} className="filtro__campo">
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

function Filtros({
  estado,
  efetivos,
  opcoes,
}: {
  estado: EstadoLista;
  /** Filtros que valem de fato: os da URL mais a marca escolhida no cabeçalho. */
  efetivos: EstadoLista["filtros"];
  opcoes: OpcoesFiltro | null;
}) {
  const f = efetivos;
  const ativos = CAMPOS_FILTRO.filter((c) => f[c]);
  return (
    <section className="cartao filtros" aria-label="Filtros">
      <nav className="chips" aria-label="Estado da jornada">
        <Link
          href={montarHref(estado, { estado: null, ficha: null })}
          scroll={false}
          className="chip"
          aria-current={!f.estado ? "true" : undefined}
        >
          Todos os estados
        </Link>
        {ESTADOS.map((e) => (
          <Link
            key={e}
            href={montarHref(estado, { estado: e, ficha: null })}
            scroll={false}
            className="chip"
            aria-current={f.estado === e ? "true" : undefined}
          >
            {ROTULO_ESTADO[e]}
          </Link>
        ))}
      </nav>

      <nav className="chips" aria-label="Situação e marca">
        <Link
          href={montarHref(estado, { situacao: null, ficha: null })}
          scroll={false}
          className="chip"
          aria-current={!f.situacao ? "true" : undefined}
        >
          Todas
        </Link>
        {SITUACOES.map((s) => (
          <Link
            key={s}
            href={montarHref(estado, { situacao: s, ficha: null })}
            scroll={false}
            className="chip"
            aria-current={f.situacao === s ? "true" : undefined}
          >
            {ROTULO_SITUACAO[s]}
          </Link>
        ))}
        {opcoes && opcoes.marcas.length > 0 && (
          <span className="chips__sep" aria-hidden="true" />
        )}
        {opcoes?.marcas.map((m) => (
          <Link
            key={m.id}
            href={montarHref(estado, {
              marca: f.marca === m.id ? TODAS : m.id,
              ficha: null,
            })}
            scroll={false}
            className="chip"
            aria-current={f.marca === m.id ? "true" : undefined}
          >
            {m.nome}
          </Link>
        ))}
      </nav>

      <form method="get" action="/reclamacoes" className="filtros__form">
        <label className="filtro filtro--busca">
          <span className="filtro__rotulo">Buscar</span>
          <input
            type="search"
            name="busca"
            defaultValue={f.busca ?? ""}
            maxLength={100}
            placeholder="Número, pedido, cliente, produto ou texto"
            className="filtro__campo"
          />
        </label>
        <label className="filtro">
          <span className="filtro__rotulo">De</span>
          <input
            type="date"
            name="de"
            defaultValue={f.de ?? ""}
            className="filtro__campo"
          />
        </label>
        <label className="filtro">
          <span className="filtro__rotulo">Até</span>
          <input
            type="date"
            name="ate"
            defaultValue={f.ate ?? ""}
            className="filtro__campo"
          />
        </label>
        <Seletor
          nome="canal"
          rotulo="Canal"
          valor={f.canal}
          opcoes={opcoes?.canais ?? []}
        />
        <Seletor
          nome="setor"
          rotulo="Setor"
          valor={f.setor}
          opcoes={opcoes?.setores ?? []}
        />
        <Seletor
          nome="causa"
          rotulo="Causa"
          valor={f.causa}
          opcoes={opcoes?.causas ?? []}
        />
        {f.marca && <input type="hidden" name="marca" value={f.marca} />}
        {f.situacao && (
          <input type="hidden" name="situacao" value={f.situacao} />
        )}
        {f.estado && <input type="hidden" name="estado" value={f.estado} />}
        <button type="submit" className="botao botao--primario">
          Filtrar
        </button>
      </form>

      {ativos.length > 0 && (
        <nav className="chips" aria-label="Filtros ativos">
          {ativos.map((c) => (
            <Link
              key={c}
              href={montarHref(estado, {
                [c]: c === "marca" ? TODAS : null,
                ficha: null,
              })}
              scroll={false}
              className="chip chip--ativo"
              aria-label={`Remover filtro ${ROTULO_CAMPO[c]}: ${textoDoFiltro(c, f[c] as string, opcoes)}`}
            >
              <span>
                {ROTULO_CAMPO[c]}: {textoDoFiltro(c, f[c] as string, opcoes)}
              </span>
              <span aria-hidden="true">×</span>
            </Link>
          ))}
          <Link href="/reclamacoes" scroll={false} className="chips__limpar">
            Limpar tudo
          </Link>
        </nav>
      )}
    </section>
  );
}

function Paginacao({
  estado,
  pagina,
}: {
  estado: EstadoLista;
  pagina: Pagina;
}) {
  if (pagina.totalPaginas <= 1) return null;
  const p = pagina.pagina;
  return (
    <nav className="paginacao" aria-label="Páginas">
      {p > 1 ? (
        <Link
          href={montarHref(estado, { pagina: String(p - 1), ficha: null })}
          className="botao botao--secundario"
          scroll={false}
        >
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="paginacao__atual">
        Página {p} de {pagina.totalPaginas}
      </span>
      {p < pagina.totalPaginas ? (
        <Link
          href={montarHref(estado, { pagina: String(p + 1), ficha: null })}
          className="botao botao--secundario"
          scroll={false}
        >
          Próxima
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default async function Reclamacoes({
  searchParams,
}: {
  searchParams: Promise<ParamsUrl>;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  if (!usuario.permissoes.includes("reclamacoes.ver")) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Sem acesso às reclamações</h1>
        <p className="vazio__texto">
          Seu perfil não tem permissão para ver esta tela. Fale com o
          administrador se precisar dela.
        </p>
      </section>
    );
  }

  const estado = lerEstado(await searchParams);
  const marca = await marcaAtiva();
  const efetivos = comMarcaPadrao(estado.filtros, marca.idNoCadastro);
  const [lista, opcoes, ficha] = await Promise.all([
    buscarNaApi<Pagina>(
      `/reclamacoes?${consultaParaApi({ ...estado, filtros: efetivos })}`,
    ),
    buscarNaApi<OpcoesFiltro>("/reclamacoes/filtros"),
    estado.ficha
      ? buscarNaApi<Ficha>(`/reclamacoes/${encodeURIComponent(estado.ficha)}`)
      : Promise.resolve(null),
  ]);

  if (!lista.ok && lista.status === 401) redirect("/login");

  const fechar = montarHref(estado, { ficha: null });
  const opcoesOk = opcoes.ok ? opcoes.dados : null;

  const podeImprimir = usuario.permissoes.includes("reclamacoes.ver");
  const podeCriar = usuario.permissoes.includes("reclamacoes.criar");
  const podeEditar = usuario.permissoes.includes("reclamacoes.editar");
  const podeTrocarSetor = usuario.permissoes.includes(
    "reclamacoes.trocar_setor",
  );
  const podeAnalisar = usuario.permissoes.includes("reclamacoes.analisar");
  const ia = usuario.permissoes.includes("ia.usar")
    ? { podeEditar, podeAplicar: podeAnalisar }
    : undefined;
  const analisando = estado.acao === "analise" && podeAnalisar;
  const cadastrando = estado.acao === "nova" && podeCriar;
  const editando = estado.acao === "editar" && podeEditar;
  const painelAberto = cadastrando || !!estado.ficha;

  return (
    <>
      <div className="pagina__cab pagina__cab--acao">
        <div className="pagina__cab-texto">
          <h1 className="pagina__titulo">Reclamações</h1>
          <p className="pagina__apoio">
            {lista.ok
              ? `${lista.dados.total} ${lista.dados.total === 1 ? "reclamação" : "reclamações"}`
              : "Não foi possível carregar a lista."}
            {usuario.perfil === "responsavel_setor" &&
              usuario.setores.length > 0 &&
              ` · só do seu setor (${usuario.setores.join(", ")})`}
          </p>
        </div>
        {podeCriar && (
          <Link
            href={montarHref(estado, { ficha: null, acao: "nova" })}
            scroll={false}
            className="botao botao--primario"
          >
            Nova reclamação
          </Link>
        )}
      </div>

      <Filtros estado={estado} efetivos={efetivos} opcoes={opcoesOk} />

      {!lista.ok ? (
        <div className="aviso aviso--erro" role="alert">
          {lista.status === 400 && lista.mensagem
            ? lista.mensagem
            : "Não foi possível carregar as reclamações agora. Tente de novo em instantes."}
        </div>
      ) : lista.dados.itens.length === 0 ? (
        <section className="vazio">
          <h2 className="vazio__titulo">Nenhuma reclamação encontrada</h2>
          <p className="vazio__texto">
            Nenhum registro bate com os filtros escolhidos.
          </p>
          {Object.keys(estado.filtros).length > 0 && (
            <Link href="/reclamacoes" className="botao botao--secundario">
              Limpar filtros
            </Link>
          )}
        </section>
      ) : (
        <>
          {podeImprimir && (
            <form
              id="selecao"
              method="get"
              action="/reclamacoes/imprimir"
              className="selecao-barra sem-impressao"
            >
              <button type="submit" className="botao botao--secundario">
                Imprimir selecionadas
              </button>
              <Link
                href={`/reclamacoes/imprimir?${new URLSearchParams({ ...efetivos, todas: "1" } as Record<string, string>).toString()}`}
                className="botao botao--secundario"
              >
                Imprimir todas do filtro ({lista.dados.total})
              </Link>
            </form>
          )}
          <div className="cartao tabela-caixa">
            <table className="tabela">
              <caption className="sr-only">Lista de reclamações</caption>
              <thead>
                <tr>
                  {podeImprimir && (
                    <th scope="col" className="tabela__marcar">
                      <MarcarTodas form="selecao" nome="id" />
                    </th>
                  )}
                  <th scope="col">Nº</th>
                  <th scope="col">Abertura</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="tabela__oculta">
                    Situação
                  </th>
                  <th scope="col">Produto</th>
                  <th scope="col" className="tabela__oculta">
                    Causa
                  </th>
                  <th scope="col" className="tabela__oculta">
                    Setor
                  </th>
                  <th scope="col" className="tabela__oculta">
                    Canal
                  </th>
                  <th scope="col" className="tabela__num">
                    Custo
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.itens.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      estado.ficha === r.id
                        ? "tabela__linha--aberta"
                        : undefined
                    }
                  >
                    {podeImprimir && (
                      <td className="tabela__marcar">
                        <input
                          type="checkbox"
                          form="selecao"
                          name="id"
                          value={r.id}
                          aria-label={`Selecionar a reclamação ${r.numero}`}
                        />
                      </td>
                    )}
                    <td>
                      <Link
                        href={montarHref(estado, { ficha: r.id })}
                        scroll={false}
                        className="tabela__abrir"
                        aria-label={`Abrir a reclamação ${r.numero}`}
                      >
                        #{r.numero}
                      </Link>
                    </td>
                    <td>{data(r.dataAbertura)}</td>
                    <td>
                      <Selo tom={tomDoEstado(r.estado)}>
                        {ROTULO_ESTADO[r.estado]}
                      </Selo>
                      {r.prazoMarketplace && r.estado !== "finalizada" && (
                        <span className="tabela__apoio">
                          Prazo do canal: {data(r.prazoMarketplace)}
                        </span>
                      )}
                    </td>
                    <td className="tabela__oculta">
                      <Selo tom={tomDaSituacao(r.situacao)}>
                        {ROTULO_SITUACAO[r.situacao]}
                      </Selo>
                    </td>
                    <td className="tabela__produto">
                      <span className="tabela__principal">
                        {r.produto?.nome ?? "—"}
                      </span>
                      {r.marca && (
                        <span className="tabela__apoio tabela__marca">
                          <MarcaDoCadastro nome={r.marca.nome} />
                        </span>
                      )}
                    </td>
                    <td className="tabela__oculta">{r.causa?.nome ?? "—"}</td>
                    <td className="tabela__oculta">
                      {r.setorResp?.nome ?? "—"}
                    </td>
                    <td className="tabela__oculta">{r.canal.nome}</td>
                    <td className="tabela__num">{moeda(r.custoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao estado={estado} pagina={lista.dados} />
        </>
      )}

      {painelAberto && (
        <PainelFicha
          fechar={fechar}
          titulo={
            cadastrando
              ? "Nova reclamação"
              : ficha?.ok
                ? `Reclamação ${ficha.dados.numero}`
                : "Reclamação"
          }
        >
          {cadastrando && opcoesOk ? (
            <FormularioReclamacao
              modo="criar"
              inicial={valoresVazios(hojeEmBrasilia())}
              opcoes={opcoesOk}
              podeTrocarSetor={podeTrocarSetor}
              cancelar={fechar}
              depois={montarHref(estado, { ficha: "__ID__", acao: null })}
            />
          ) : cadastrando ? (
            <div className="ficha__vazio">
              <h2 className="ficha__titulo">
                Não foi possível abrir o cadastro
              </h2>
              <p className="pagina__apoio">Tente de novo em instantes.</p>
              <Link
                href={fechar}
                scroll={false}
                className="botao botao--secundario"
              >
                Voltar para a lista
              </Link>
            </div>
          ) : ficha?.ok && editando && opcoesOk ? (
            <FormularioReclamacao
              modo="editar"
              id={ficha.dados.id}
              numero={ficha.dados.numero}
              inicial={valoresDaFicha(ficha.dados)}
              opcoes={opcoesOk}
              podeTrocarSetor={podeTrocarSetor}
              cancelar={montarHref(estado, { acao: null })}
              depois={montarHref(estado, { acao: null })}
            />
          ) : ficha?.ok && analisando ? (
            <PainelAnalise
              ficha={ficha.dados}
              fechar={fechar}
              hrefFicha={montarHref(estado, { acao: null })}
              hrefAnalise={montarHref(estado, { acao: "analise" })}
              podeAnalisar={podeAnalisar}
            />
          ) : ficha?.ok ? (
            <ConteudoFicha
              ficha={ficha.dados}
              fechar={fechar}
              hrefEditar={
                podeEditar ? montarHref(estado, { acao: "editar" }) : undefined
              }
              hrefFicha={montarHref(estado, { acao: null })}
              hrefAnalise={
                podeAnalisar
                  ? montarHref(estado, { acao: "analise" })
                  : undefined
              }
              ia={ia}
            />
          ) : (
            <div className="ficha__vazio">
              <h2 className="ficha__titulo">
                {ficha?.status === 404
                  ? "Reclamação não encontrada"
                  : "Não foi possível abrir a ficha"}
              </h2>
              <p className="pagina__apoio">
                {ficha?.status === 404
                  ? "Ela não existe ou não é do seu setor."
                  : "Tente de novo em instantes."}
              </p>
              <Link
                href={fechar}
                scroll={false}
                className="botao botao--secundario"
              >
                Voltar para a lista
              </Link>
            </div>
          )}
        </PainelFicha>
      )}
    </>
  );
}
