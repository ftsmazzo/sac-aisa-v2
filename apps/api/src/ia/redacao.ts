/**
 * Dado pessoal fora do prompt e de volta só no servidor.
 * Regra não pega todo nome ou endereço escrito à mão; por isso o nome, o e-mail, o telefone,
 * o endereço e o pedido do comprador também ficam fora da lista branca de entrada (ver `ia.ts`).
 */

const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "DI", "DU"]);

/** Letra sem acento, do mesmo tamanho do original, para achar nomes sem se prender a acento. */
function semAcento(s: string): string {
  let r = "";
  for (const ch of s) r += ch.normalize("NFD")[0] ?? ch;
  return r;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function trocarPalavra(texto: string, palavra: string, marcador: string) {
  const base = semAcento(texto).toUpperCase();
  const alvo = semAcento(palavra).toUpperCase();
  const re = new RegExp(`(?<![A-Z0-9])${escapar(alvo)}(?![A-Z0-9])`, "g");
  let saida = "";
  let ultimo = 0;
  for (const m of base.matchAll(re)) {
    saida += texto.slice(ultimo, m.index) + marcador;
    ultimo = (m.index ?? 0) + m[0].length;
  }
  return saida + texto.slice(ultimo);
}

/** Nome completo e cada parte com 3 letras ou mais (menos "de", "da", "dos"…). */
export function partesDoNome(nome: string): string[] {
  const partes = nome
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter(
      (p) => p.length >= 3 && !PARTICULAS.has(semAcento(p).toUpperCase()),
    );
  return [...new Set(partes)];
}

export interface DadosPessoais {
  nomes?: string[];
  /** Valores exatos (pedido, protocolo) que não podem aparecer. */
  literais?: string[];
}

/** Troca dado pessoal por marcadores. Também desarma as marcas que delimitam o texto no prompt. */
export function redigir(texto: string, dados: DadosPessoais = {}): string {
  let t = texto.replace(/[<>]/g, " ");
  // E-mail antes de tudo: o endereço tem pontos e números que outras regras comeriam.
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[EMAIL]");
  t = t.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[DOCUMENTO]");
  t = t.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[DOCUMENTO]");
  t = t.replace(/\b\d{5}-\d{3}\b/g, "[CEP]");
  t = t.replace(
    /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g,
    "[TELEFONE]",
  );
  t = t.replace(/\b9\d{4}[\s.-]?\d{4}\b/g, "[TELEFONE]");
  t = t.replace(
    /\b(?:rua|r\.|avenida|av\.?|travessa|alameda|rodovia|estrada|praça|praca)\s+[^,\n;.]{2,60}(?:,?\s*(?:n[º°o.]*\s*)?\d+)?/gi,
    "[ENDEREÇO]",
  );
  t = t.replace(/\b\d{9,}\b/g, "[NUMERO]");
  for (const literal of dados.literais ?? []) {
    const l = literal.trim();
    if (l.length >= 4) t = trocarPalavra(t, l, "[NUMERO]");
  }
  for (const nome of dados.nomes ?? []) {
    for (const parte of [nome.trim(), ...partesDoNome(nome)]) {
      if (parte.length >= 3) t = trocarPalavra(t, parte, "[NOME]");
    }
  }
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

export const MARCADOR_NOME = "{{nome_cliente}}";

/** Marcador de redação que sobrou numa saída do modelo: ela não pode vazar para o cliente. */
export function temMarcadorDeRedacao(texto: string): boolean {
  return /\[(?:NOME|EMAIL|TELEFONE|DOCUMENTO|CEP|ENDEREÇO|NUMERO)\]/.test(
    texto,
  );
}

/** Só `{{nome_cliente}}` é aceito. Qualquer outra chave dupla invalida a saída. */
export function temMarcadorDesconhecido(texto: string): boolean {
  return /\{\{(?!nome_cliente\}\})[^}]*\}\}/.test(texto);
}

const primeiroNome = (nome: string) => {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
};

/**
 * O nome entra aqui, no servidor, depois do modelo. Sem nome, a saudação perde o marcador
 * ("Olá, !" vira "Olá!").
 */
export function trocarMarcadores(
  texto: string,
  v: { nomeCliente?: string; marca?: string },
): string {
  const nome = primeiroNome(v.nomeCliente ?? "");
  let t = texto.split(MARCADOR_NOME).join(nome);
  if (!nome) t = t.replace(/\s+([,!.])/g, "$1").replace(/,\s*([!.])/g, "$1");
  t = t.replace(/\{marca\}/g, (v.marca ?? "").trim());
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +$/gm, "")
    .trim();
}

/** O que a IA escreveu e que a pessoa deve conferir antes de colar no chat. */
export function avisosDaMensagem(mensagem: string, entrada: string): string[] {
  const avisos: string[] = [];
  const nova = (re: RegExp) =>
    [...mensagem.matchAll(re)].some((m) => !entrada.includes(m[0]));
  if (/https?:\/\/|www\./i.test(mensagem))
    avisos.push("A mensagem cita um link.");
  if (/@\w/.test(mensagem))
    avisos.push("A mensagem cita um e-mail ou usuário.");
  if (/\d{4,5}[\s.-]?\d{4}/.test(mensagem))
    avisos.push("A mensagem cita um telefone.");
  if (nova(/R\$\s?\d[\d.,]*/g))
    avisos.push("A mensagem cita um valor em reais.");
  if (nova(/\b\d+\s*(?:dias?|horas?|semanas?)(?:\s+úteis)?\b/gi)) {
    avisos.push("A mensagem cita um prazo que não está na política.");
  }
  if (/\b(?:reembols|estorn|troca[rm]?|reposição|reenvi)/i.test(mensagem)) {
    avisos.push(
      "A mensagem fala de reembolso, troca ou reenvio. Confira se a empresa pode prometer.",
    );
  }
  return avisos;
}
