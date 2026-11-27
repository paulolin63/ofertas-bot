/**
 * Chave e similaridade de deduplicação por título normalizado.
 *
 * O mesmo produto genérico vendido por lojas diferentes tem
 * shopId/itemId diferentes na Shopee (ou ASIN/MLB distintos entre lojas),
 * então a chave por item não segura a repetição: o mesmo item voltava
 * todo dia (reclamação do usuário em 2026-11-22, forma de silicone para
 * air fryer).
 *
 * Além da chave exata das 8 primeiras palavras (`titleDedupKey`),
 * `isSimilarTitle` compara conjuntos de tokens relevantes (sem acentos,
 * stopwords nem termos genéricos de anúncio como "kit", "promoção",
 * "original") por Jaccard + contenção exata — preservando números de
 * modelo (ex.: Vivoactive 5 vs Vivoactive 6, Forerunner 55 vs 165) para
 * não confundir versões distintas da mesma linha de produtos.
 */

const STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "ate",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "envio",
  "frete",
  "gratis",
  "imediato",
  "kit",
  "mais",
  "na",
  "nas",
  "no",
  "nos",
  "nova",
  "novo",
  "o",
  "oferta",
  "original",
  "os",
  "ou",
  "para",
  "pc",
  "pcs",
  "peca",
  "pecas",
  "por",
  "pra",
  "promocao",
  "sem",
  "um",
  "uma",
  "un",
  "und",
  "unidade",
  "unidades",
]);

// Unidades/medidas (42mm, 220ml, 128gb) não identificam modelos distintos sozinhas.
const UNIT_TOKEN_RE = /^\d+(?:mm|cm|m|ml|l|g|kg|gb|tb|mb|w|v|mah|hz|pol)$/;

function normalizeWords(title: string): string[] {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function titleDedupKey(title: string): string {
  const normalized = normalizeWords(title).slice(0, 8).join(" ");
  return `title:${normalized}`;
}

/**
 * Tokens significativos do título (sem stopwords nem quantidades do tipo
 * "1/2/3", mas mantendo números de modelo como "5", "6", "55", "165", "520bt").
 */
export function titleTokens(title: string): Set<string> {
  const cleaned = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d+(?:\/\d+)+\b/g, " ") // remove prefixos de quantidade tipo 1/2/3
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const tokens = new Set<string>();
  for (const word of cleaned) {
    if (STOPWORDS.has(word)) continue;
    if (word.length < 2 && !/^\d$/.test(word)) continue;
    tokens.add(word);
  }
  return tokens;
}

function modelNumberTokens(tokens: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const token of tokens) {
    if (/\d/.test(token) && !UNIT_TOKEN_RE.test(token)) out.add(token);
  }
  return out;
}

/** Similaridade de Jaccard entre dois títulos (0..1). */
export function titleSimilarity(
  a: string | Set<string>,
  b: string | Set<string>,
): number {
  const setA = typeof a === "string" ? titleTokens(a) : a;
  const setB = typeof b === "string" ? titleTokens(b) : b;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Verdadeiro quando dois títulos descrevem o mesmo produto (mesma chave
 * exata, Jaccard >= threshold, ou todos os tokens do título curto contidos
 * no longo). Se ambos os títulos citam números de modelo (ex.: Vivoactive 5
 * vs 6, Forerunner 55 vs 165) e não compartilham nenhum, não são considerados
 * iguais.
 */
export function isSimilarTitle(
  a: string,
  b: string,
  threshold = 0.7,
): boolean {
  if (titleDedupKey(a) === titleDedupKey(b)) return true;
  const setA = titleTokens(a);
  const setB = titleTokens(b);
  if (setA.size === 0 || setB.size === 0) return false;

  const modA = modelNumberTokens(setA);
  const modB = modelNumberTokens(setB);
  if (modA.size > 0 && modB.size > 0) {
    let sharedModel = 0;
    for (const m of modA) {
      if (modB.has(m)) sharedModel += 1;
    }
    if (sharedModel === 0) return false;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;
  if (jaccard >= threshold) return true;
  const minSize = Math.min(setA.size, setB.size);
  return minSize >= 4 && intersection === minSize;
}
