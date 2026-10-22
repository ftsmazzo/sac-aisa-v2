/** Mensagem que a pessoa vê quando o login não passa. Nunca revela se o usuário existe. */
export function mensagemLogin(
  status: number,
  retryAfter?: string | null,
): string {
  switch (status) {
    case 400:
      return "Informe usuário e senha.";
    case 401:
      return "Usuário ou senha inválidos.";
    case 403:
      return "Acesso não permitido a partir deste endereço.";
    case 429: {
      const segundos = Number(retryAfter);
      if (Number.isFinite(segundos) && segundos > 0) {
        const minutos = Math.ceil(segundos / 60);
        return `Muitas tentativas. Tente de novo em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
      }
      return "Muitas tentativas. Tente de novo em alguns minutos.";
    }
    default:
      return "Não foi possível entrar agora. Tente de novo em instantes.";
  }
}

export const MENSAGEM_SEM_CONEXAO =
  "Não foi possível conectar. Confira a internet e tente de novo.";
