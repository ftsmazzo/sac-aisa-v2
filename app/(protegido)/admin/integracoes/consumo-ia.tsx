import { Cartao, Selo } from "@/components/ui";
import { dolar } from "@/lib/ia";
import { buscarNaApi } from "@/lib/reclamacoes";

interface Consumo {
  configurada: boolean;
  modelo: string;
  chamadas: number;
  custoUsd: number;
  limiteChamadas: number;
  limiteCustoUsd: number;
  limiteAtingido: boolean;
}

/** Consumo de hoje da IA, ao lado do cartão do OpenRouter. Se a API falhar, a tela segue sem ele. */
export async function ConsumoIa() {
  const r = await buscarNaApi<Consumo>("/admin/ia/consumo");
  if (!r.ok) return null;
  const c = r.dados;
  return (
    <Cartao>
      <h2 className="ficha__subtitulo">
        Consumo da IA hoje{" "}
        {!c.configurada ? (
          <Selo tom="atencao">IA não configurada</Selo>
        ) : c.limiteAtingido ? (
          <Selo tom="perigo">Limite atingido</Selo>
        ) : (
          <Selo tom="ok">Dentro do limite</Selo>
        )}
      </h2>
      <p className="pagina__apoio">
        {c.chamadas} de {c.limiteChamadas} chamadas · {dolar(c.custoUsd)} de{" "}
        {dolar(c.limiteCustoUsd)} · modelo {c.modelo}. O custo é o informado
        pelo OpenRouter (ou uma estimativa pela tabela do modelo). Passou do
        limite, a ficha segue sem IA até amanhã.
      </p>
    </Cartao>
  );
}
