import Link from "next/link";
import { obterUsuario } from "@/lib/sessao";

const PERFIL: Record<string, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  operacao: "Operação",
  responsavel_setor: "Responsável de setor",
};

export default async function Inicio() {
  const usuario = await obterUsuario();
  const podeImportar = usuario?.permissoes.includes("dados.importar");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Olá, {usuario?.nome}</h1>
        <p className="pagina__apoio">
          Aqui vai ficar o painel e a lista de reclamações. Por enquanto, o
          sistema já reconhece você e o que você pode fazer.
        </p>
      </div>

      <dl className="cartao acesso">
        <div className="acesso__item">
          <dt className="acesso__rotulo">Perfil</dt>
          <dd className="acesso__valor">
            {usuario ? (PERFIL[usuario.perfil] ?? usuario.perfil) : "—"}
          </dd>
        </div>
        <div className="acesso__item">
          <dt className="acesso__rotulo">Setores</dt>
          <dd className="acesso__valor">
            {usuario && usuario.setores.length > 0
              ? usuario.setores.join(", ")
              : "Todos os setores"}
          </dd>
        </div>
        <div className="acesso__item">
          <dt className="acesso__rotulo">Permissões</dt>
          <dd className="acesso__valor">{usuario?.permissoes.length ?? 0}</dd>
        </div>
      </dl>

      <section className="vazio">
        <h2 className="vazio__titulo">
          As reclamações ainda não aparecem aqui
        </h2>
        <p className="vazio__texto">
          A lista de reclamações, com a ficha aberta na frente, é a próxima
          etapa. Os dados do sistema antigo já podem ser trazidos pela
          importação.
        </p>
        {podeImportar && (
          <Link href="/admin/importacao" className="botao botao--primario">
            Importar backup
          </Link>
        )}
      </section>
    </>
  );
}
