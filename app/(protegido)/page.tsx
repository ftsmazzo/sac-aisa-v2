import Link from "next/link";
import { consultaDeMarca } from "@/lib/marca-escolhida";
import { marcaAtiva } from "@/lib/marca-servidor";
import type { PainelBruto } from "@/lib/painel-vista";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import { PainelInicio } from "./painel-inicio";

const PERFIL: Record<string, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  operacao: "Operação",
  responsavel_setor: "Responsável de setor",
};

export default async function Inicio() {
  const usuario = await obterUsuario();
  const podeVer = usuario?.permissoes.includes("reclamacoes.ver") ?? false;
  const podeImportar = usuario?.permissoes.includes("dados.importar") ?? false;

  if (!usuario || !podeVer) {
    return (
      <>
        <div className="pagina__cab">
          <h1 className="pagina__titulo">Olá, {usuario?.nome}</h1>
          <p className="pagina__apoio">
            O painel de reclamações fica disponível para quem pode ver a lista.
          </p>
        </div>
        <dl className="cartao acesso">
          <div className="acesso__item">
            <dt className="acesso__rotulo">Perfil</dt>
            <dd className="acesso__valor">
              {usuario ? (PERFIL[usuario.perfil] ?? usuario.perfil) : "—"}
            </dd>
          </div>
        </dl>
      </>
    );
  }

  const marca = await marcaAtiva();
  const painel = await buscarNaApi<PainelBruto>(
    `/painel${consultaDeMarca(marca.idNoCadastro)}`,
  );

  if (!painel.ok) {
    return (
      <div className="pagina__cab">
        <h1 className="pagina__titulo">O que está em movimento</h1>
        <p className="pagina__apoio">
          O painel não respondeu agora. A lista de reclamações continua
          disponível.
        </p>
        <p>
          <Link href="/reclamacoes" className="botao botao--primario">
            Abrir reclamações
          </Link>
        </p>
        {podeImportar && (
          <p>
            <Link href="/admin/importacao">Importar backup</Link>
          </p>
        )}
      </div>
    );
  }

  return <PainelInicio dados={painel.dados} />;
}
