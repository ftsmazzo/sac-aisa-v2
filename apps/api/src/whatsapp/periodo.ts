const TZ = "America/Sao_Paulo";

function isoHojeBr(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Normaliza texto p/ match de setor (sem acento, minúsculo). */
export function normTxt(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** g-156 / G 156 / g156 → G156 (comparação). */
export function normSku(s: string): string {
  return String(s || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function stemPt(t: string): string {
  const x = normTxt(t);
  if (x.endsWith("agens")) return `${x.slice(0, -5)}agem`;
  if (x.endsWith("acoes")) return `${x.slice(0, -5)}acao`;
  if (x.endsWith("coes")) return `${x.slice(0, -4)}cao`;
  if (x.endsWith("oes")) return `${x.slice(0, -3)}ao`;
  if (x.endsWith("ais")) return `${x.slice(0, -3)}al`;
  if (x.endsWith("ns") && x.length > 4) return x.slice(0, -1);
  if (x.endsWith("s") && x.length > 4) return x.slice(0, -1);
  return x;
}

/** “Embalagens” casa com “Embalagem / Expedição”. */
export function setorFuzzyMatch(nomeSetor: string, query: string): boolean {
  const a = normTxt(nomeSetor);
  const b = normTxt(query);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokensA = a
    .split(/[\s/]+/)
    .map(stemPt)
    .filter((t) => t.length >= 3);
  const tokensB = b
    .split(/[\s/]+/)
    .map(stemPt)
    .filter((t) => t.length >= 3);
  if (!tokensB.length) return false;
  const stop = new Set(["setor", "de", "da", "do", "dos", "das", "e", "ou"]);
  const q = tokensB.filter((t) => !stop.has(t));
  if (!q.length) return false;
  return q.every((tb) =>
    tokensA.some((ta) => {
      if (ta === tb) return true;
      if (ta.includes(tb) || tb.includes(ta)) return true;
      const n = Math.min(6, ta.length, tb.length);
      return n >= 5 && ta.slice(0, n) === tb.slice(0, n);
    }),
  );
}

/**
 * Converte preset / N dias / de-até em datas YYYY-MM-DD (fuso BR).
 */
export function resolverPeriodo(
  preset?: string,
  de?: string,
  ate?: string,
  dias?: number,
): { de: string; ate: string; label: string } {
  const hoje = isoHojeBr();
  if (de || ate) {
    const d0 = de || ate || hoje;
    const d1 = ate || de || hoje;
    return { de: d0, ate: d1, label: `${d0} → ${d1}` };
  }

  const clampDias = (n: number) => Math.min(Math.max(Math.floor(n), 1), 365);

  if (Number.isFinite(dias) && (dias as number) > 0) {
    const n = clampDias(dias as number);
    return {
      de: addDaysIso(hoje, -(n - 1)),
      ate: hoje,
      label: `últimos ${n} dias`,
    };
  }

  const p = (preset || "hoje").toLowerCase().trim();

  const m =
    p.match(/^(\d+)\s*d(?:ias)?$/) ||
    p.match(/^(?:ultimos|últimos)\s+(\d+)\s*d(?:ias)?$/) ||
    p.match(/^(\d+)\s*dias?$/);
  if (m) {
    const n = clampDias(Number(m[1]));
    return {
      de: addDaysIso(hoje, -(n - 1)),
      ate: hoje,
      label: `últimos ${n} dias`,
    };
  }

  if (p === "hoje" || p === "today")
    return { de: hoje, ate: hoje, label: "hoje" };
  if (p === "ontem" || p === "yesterday") {
    const o = addDaysIso(hoje, -1);
    return { de: o, ate: o, label: "ontem" };
  }
  if (p === "semana" || p === "7d" || p === "7dias" || p.includes("7 dia")) {
    return { de: addDaysIso(hoje, -6), ate: hoje, label: "últimos 7 dias" };
  }
  if (p === "15d" || p === "15dias" || p.includes("15 dia")) {
    return { de: addDaysIso(hoje, -14), ate: hoje, label: "últimos 15 dias" };
  }
  if (
    p === "30d" ||
    p === "30dias" ||
    p === "mes" ||
    p === "mês" ||
    p.includes("30 dia") ||
    p.includes("esse mes") ||
    p.includes("este mes") ||
    p.includes("esse mês") ||
    p.includes("este mês")
  ) {
    return { de: addDaysIso(hoje, -29), ate: hoje, label: "últimos 30 dias" };
  }
  if (
    p === "ano" ||
    p === "este ano" ||
    p === "esse ano" ||
    p === "ytd" ||
    p === "ano atual" ||
    p.includes("este ano") ||
    p.includes("esse ano")
  ) {
    const year = hoje.slice(0, 4);
    return { de: `${year}-01-01`, ate: hoje, label: `ano ${year} (até hoje)` };
  }
  return {
    de: addDaysIso(hoje, -29),
    ate: hoje,
    label: "últimos 30 dias (padrão)",
  };
}

export function phoneMatch(a: string, b: string) {
  if (a === b) return true;
  const sa = a.slice(-11);
  const sb = b.slice(-11);
  return (
    sa.length >= 10 && sb.length >= 10 && (sa.endsWith(sb) || sb.endsWith(sa))
  );
}

/** Limpa markdown de site e padroniza bullets WhatsApp. */
export function formatWhatsapp(s: string): string {
  let t = (s || "").trim();
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\*\*(.+?)\*\*/g, "*$1*");
  t = t.replace(/__(.+?)__/g, "*$1*");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^(\s*)[-*]\s+/gm, "$1• ");
  t = t.replace(/\n{3,}/g, "\n\n");
  if (t.length <= 3500) return t;
  return `${t.slice(0, 3400)}\n…`;
}
