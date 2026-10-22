import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { buscarNaApi, type Ficha } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import { FolhaReclamacao, impressoEm } from "../../folha";

/** Folha de impressão da reclamação, em A4. O menu e os botões somem na impressão. */
export default async function ImprimirReclamacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  const { id } = await params;
  const resp = await buscarNaApi<Ficha>(
    `/reclamacoes/${encodeURIComponent(id)}`,
  );
  if (!resp.ok && resp.status === 401) redirect("/login");

  if (!resp.ok) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">
          {resp.status === 404
            ? "Reclamação não encontrada"
            : "Não foi possível abrir a folha"}
        </h1>
        <p className="vazio__texto">
          {resp.status === 404
            ? "Ela não existe ou não é do seu setor."
            : "Tente de novo em instantes."}
        </p>
        <Link href="/reclamacoes" className="botao botao--secundario">
          Voltar para a lista
        </Link>
      </section>
    );
  }

  const f = resp.dados;
  const agora = new Date();

  return (
    <>
      <div className="pagina__cab pagina__cab--acao sem-impressao">
        <div className="pagina__cab-texto">
          <h1 className="pagina__titulo">Folha da reclamação {f.numero}</h1>
          <p className="pagina__apoio">
            Confira e use Imprimir. A folha sai em A4.
          </p>
        </div>
        <div className="ficha__acoes">
          <BotaoImprimir />
          <Link
            href={`/reclamacoes?ficha=${encodeURIComponent(f.id)}`}
            className="botao botao--secundario"
          >
            Voltar à ficha
          </Link>
        </div>
      </div>

      <FolhaReclamacao
        f={f}
        agora={agora}
        impresso={impressoEm(agora)}
        usuarioNome={usuario.nome}
      />
    </>
  );
}
