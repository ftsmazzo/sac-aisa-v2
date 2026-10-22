import { Cartao } from "@/components/ui";
import { obterUsuario } from "@/lib/sessao";

export default async function Inicio() {
  const usuario = await obterUsuario();

  return (
    <>
      <div>
        <h1>Olá, {usuario?.nome}</h1>
        <p style={{ color: "var(--cor-suave)", marginTop: 4 }}>
          Base da v2 no ar. As telas entram conforme o plano de implementação.
        </p>
      </div>
      <Cartao>
        <div style={{ padding: 20, display: "grid", gap: 6 }}>
          <strong>Seu acesso</strong>
          <span>
            {usuario?.permissoes.length} permissões
            {usuario && usuario.setores.length > 0
              ? ` · setor: ${usuario.setores.join(", ")}`
              : " · todos os setores"}
          </span>
        </div>
      </Cartao>
    </>
  );
}
