/** Liga o GlitchTip (SDK do Sentry) só quando há DSN. Sem DSN, não envia nada. */
export function deveVigiar(dsn: string | undefined): boolean {
  return Boolean(dsn?.trim());
}

export async function vigiarErros(dsn: string | undefined): Promise<void> {
  if (!deveVigiar(dsn)) return;
  const sentry = (await import("@sentry/node")) as {
    init: (opcoes: {
      dsn: string;
      tracesSampleRate: number;
      sendDefaultPii: boolean;
    }) => void;
  };
  sentry.init({
    dsn: dsn as string,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}
