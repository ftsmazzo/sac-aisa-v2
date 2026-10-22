import { performance } from "node:perf_hooks";

/**
 * Registro de chamadas dos canais (Mercado Livre e Shopee): cada etapa da captura, com o tempo
 * que levou, na ordem em que aconteceu. Fica só em memória (os últimos 300 passos) e nunca guarda
 * token, assinatura nem dado do comprador: só o nome da etapa e um resumo sem dado pessoal.
 */

export type CanalDoRegistro = "mercadolivre" | "shopee" | "sistema";

export interface PassoRegistrado {
  seq: number;
  quando: string;
  canal: CanalDoRegistro;
  etapa: string;
  detalhe: string;
  ok: boolean;
  /** Milissegundos que a etapa levou; nulo quando é só um marco. */
  ms: number | null;
}

export class RegistroChamadas {
  private itens: PassoRegistrado[] = [];
  private seq = 0;

  constructor(
    private readonly max = 300,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  registrar(
    p: Omit<PassoRegistrado, "seq" | "quando" | "ms"> & { ms?: number | null },
  ): void {
    this.seq += 1;
    this.itens.push({
      seq: this.seq,
      quando: this.agora().toISOString(),
      canal: p.canal,
      etapa: p.etapa,
      detalhe: p.detalhe,
      ok: p.ok,
      ms: p.ms === undefined || p.ms === null ? null : Math.round(p.ms),
    });
    if (this.itens.length > this.max) {
      this.itens.splice(0, this.itens.length - this.max);
    }
  }

  /** Executa a etapa, mede o tempo e registra o resultado. A falha é registrada e relançada. */
  async medir<T>(
    canal: CanalDoRegistro,
    etapa: string,
    detalhe: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const inicio = performance.now();
    try {
      const r = await fn();
      this.registrar({
        canal,
        etapa,
        detalhe,
        ok: true,
        ms: performance.now() - inicio,
      });
      return r;
    } catch (e) {
      this.registrar({
        canal,
        etapa,
        detalhe: `${detalhe}: ${e instanceof Error ? e.message : "falhou"}`,
        ok: false,
        ms: performance.now() - inicio,
      });
      throw e;
    }
  }

  listar(): PassoRegistrado[] {
    return [...this.itens];
  }

  limpar(): void {
    this.itens = [];
  }
}

// ---------- O que falta para funcionar de verdade ----------

export interface SituacaoDoCanal {
  /** App ID e Secret Key (ML) ou Partner ID e Partner Key (Shopee) preenchidos. */
  credenciais: boolean;
  /** A conta vendedora (ML) ou a loja (Shopee) já autorizou: há token gravado. */
  autorizado: boolean;
  /** A URL pública do sistema está definida em HTTPS, para o canal enviar os avisos. */
  urlPublica: boolean;
  /** A URL base aponta para a API real, não para o marketplace simulado. */
  apiReal: boolean;
}

export interface ItemFalta {
  item: string;
  /** Verdadeiro, falso, ou nulo quando não dá para conferir daqui (só no painel do canal). */
  feito: boolean | null;
  como: string;
}

export function faltaParaFuncionar(
  canal: "mercadolivre" | "shopee",
  s: SituacaoDoCanal,
): ItemFalta[] {
  if (canal === "mercadolivre") {
    return [
      {
        item: "Aplicativo criado em Minhas aplicações, com a conta da empresa",
        feito: s.credenciais,
        como: "Cadastre o App ID e a Secret Key em Integrações › Mercado Livre. Guarde os dois fora do Git.",
      },
      {
        item: "Tópico Post Purchase com claims e claims_actions marcado",
        feito: null,
        como: "Marque no aplicativo, em Minhas aplicações. Leitura basta para trazer a reclamação.",
      },
      {
        item: "Conta administradora autorizou o aplicativo",
        feito: s.autorizado,
        como: "Quem autoriza precisa ser o administrador da conta vendedora; operador recebe invalid_operator_user_id. O sistema troca o code por token e renova sozinho (o token dura 6 horas).",
      },
      {
        item: "URL pública de notificações em HTTPS cadastrada",
        feito: s.urlPublica,
        como: "Cadastre https://SEU-DOMINIO/api/webhooks/mercadolivre no aplicativo. O Mercado Livre exige resposta 200 em até 500 ms.",
      },
      {
        item: "URL base apontando para api.mercadolibre.com",
        feito: s.apiReal,
        como: "Hoje o sistema consome o marketplace simulado. Para ir ao real, deixe a URL base vazia (ou https://api.mercadolibre.com) e desligue o marketplace simulado.",
      },
    ];
  }
  return [
    {
      item: "Empresa aprovada pela Shopee e app criado",
      feito: null,
      como: "Em open.shopee.com, cadastre a empresa e espere a aprovação. É o portão para o app ir ao ar.",
    },
    {
      item: "Partner ID e Partner Key de produção",
      feito: s.credenciais,
      como: "Cadastre em Integrações › Shopee. Teste e produção são credenciais separadas. Inclua as permissões de Return/Refund e de Order.",
    },
    {
      item: "Loja autorizou o app (code e shop_id)",
      feito: s.autorizado,
      como: "Só o dono da loja autoriza (subconta não). O code é de uso único e dura cerca de 10 minutos; o access token dura 4 horas e o refresh token 30 dias, e o sistema renova.",
    },
    {
      item: "Push 29 (return_updates_push) ativado e verificado em Set Push",
      feito: null,
      como: "Informe a URL https://SEU-DOMINIO/api/webhooks/shopee e clique em Verify. O sistema confere o header Authorization e responde em até 3 segundos.",
    },
    {
      item: "URL pública do sistema em HTTPS",
      feito: s.urlPublica,
      como: "Defina WEB_BASE_URL com o endereço público em HTTPS.",
    },
    {
      item: "URL base apontando para openplatform.shopee.com.br",
      feito: s.apiReal,
      como: "Hoje o sistema consome o marketplace simulado. Para ir ao real, deixe a URL base vazia e desligue o marketplace simulado.",
    },
  ];
}
