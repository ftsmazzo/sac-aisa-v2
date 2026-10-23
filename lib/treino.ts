import type { Estado } from "./reclamacoes-formato";

/** Formato que a API devolve em GET /admin/treino. */
export interface SituacaoTreino {
  modoTreino: boolean;
  resumo: { reclamacoes: number; porEstado: Record<Estado, number> };
  criarCardsTreino: boolean;
}

export const TEXTO_FAIXA_TREINO = "MODO TREINO: dados fictícios";

export function mensagemTreino(status: number, mensagem?: string): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Só o administrador pode fazer isto.";
  if (status === 502) return "Serviço indisponível no momento.";
  return mensagem || "Não foi possível concluir. Tente de novo.";
}

export interface PassoRoteiro {
  titulo: string;
  minutos: number;
  /** O que fazer na tela. */
  fazer: string;
  /** O que dizer ao dono. */
  dizer: string;
  href: string;
  rotulo: string;
}

/** Apresentação de 10 minutos para o dono: cada passo leva à tela certa. */
export const ROTEIRO: readonly PassoRoteiro[] = [
  {
    titulo: "Preparar o treino",
    minutos: 1,
    fazer:
      "Ligue o “Modo treino” no topo e carregue os dados de demonstração. A faixa laranja confirma que tudo é fictício.",
    dizer:
      "Isto é uma cópia de ensaio. Nada aqui toca nas reclamações reais, nos indicadores nem no ClickUp.",
    href: "/admin/treino",
    rotulo: "Abrir a tela de treino",
  },
  {
    titulo: "Visão geral",
    minutos: 1,
    fazer: "Mostre o início: o que está aberto, o que está atrasado.",
    dizer: "O gestor abre o sistema e já sabe onde olhar primeiro.",
    href: "/",
    rotulo: "Abrir o início",
  },
  {
    titulo: "A jornada em sete estados",
    minutos: 1,
    fazer:
      "Na lista, filtre por estado: Triagem, Aguardando cliente, Encaminhada, Recebida, Em tratativa, Resolvida no setor técnico e Finalizada.",
    dizer:
      "Toda reclamação está em um estado só, e cada mudança fica registrada com data e autor.",
    href: "/reclamacoes",
    rotulo: "Abrir a lista",
  },
  {
    titulo: "Os canais consumidos de ponta a ponta",
    minutos: 2,
    fazer:
      "Em Simulação de canais, ligue o marketplace simulado e clique em “Novo caso do Mercado Livre”. Acompanhe o registro: aviso, busca do caso, do detalhe e do pedido, mapeamento e a reclamação em Triagem. Abra essa reclamação e clique em Analisar: a IA sugere causa, setor e a pergunta, com o botão Copiar. Repita um caso da Shopee e mostre o aviso duplicado e o aviso perdido. Ao lado, leia “O que falta para funcionar de verdade”.",
    dizer:
      "É o mesmo código que vai ler as contas reais. Para isso, desligue o simulado, deixe a URL base vazia e autorize a conta. A IA só propõe; quem grava é a regra do sistema. O tom inicial ainda é exemplo de teste, para o dono validar.",
    href: "/admin/simulacao-canais",
    rotulo: "Abrir a simulação de canais",
  },
  {
    titulo: "Ficha e jornada",
    minutos: 1,
    fazer:
      "Abra uma reclamação encaminhada e mostre os relógios por etapa, o prazo do marketplace e o histórico de estados.",
    dizer:
      "O relógio pausa quando esperamos o cliente. O prazo do marketplace corre à parte.",
    href: "/reclamacoes?estado=encaminhada",
    rotulo: "Ver encaminhadas",
  },
  {
    titulo: "Fila do setor",
    minutos: 1,
    fazer:
      "Mostre a fila: as mais urgentes primeiro e o botão “Assumir” para o setor receber.",
    dizer: "Cada setor vê só o que é dele e sabe o que está atrasado.",
    href: "/fila",
    rotulo: "Abrir a fila",
  },
  {
    titulo: "Alertas",
    minutos: 1,
    fazer:
      "Mostre os alertas: setor que não recebeu, solução sem finalização, prazo do marketplace e custo alto.",
    dizer: "Ninguém precisa lembrar de olhar: o que está parado aparece aqui.",
    href: "/alertas",
    rotulo: "Abrir os alertas",
  },
  {
    titulo: "Relatórios e custo",
    minutos: 1,
    fazer:
      "Abra os relatórios por causa, produto e setor. Mostre o custo, soma de frete, peça, estorno, desconto e guia.",
    dizer: "Aqui o dono vê onde o problema se repete e quanto ele custa.",
    href: "/relatorios",
    rotulo: "Abrir os relatórios",
  },
  {
    titulo: "Encerrar o treino",
    minutos: 1,
    fazer:
      "Desligue o “Modo treino”. Se quiser limpar, use “Apagar dados de treino”: só as linhas de treino saem.",
    dizer:
      "Ao desligar, o sistema volta aos dados reais, do jeito que estavam.",
    href: "/admin/treino",
    rotulo: "Voltar à tela de treino",
  },
];

export const MINUTOS_DO_ROTEIRO = ROTEIRO.reduce((s, p) => s + p.minutos, 0);
