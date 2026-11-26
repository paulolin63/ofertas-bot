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
 * "original") por Jaccard + contenção — pegando títulos reordenados ou
 * com prefixos/sufixos extras de keywords.
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

/** Tokens significativos do título (sem stopwords, 1-char ou dígitos isolados curtos). */
export function titleTokens(title: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of normalizeWords(title)) {
    if (word.length < 2) continue;
    if (/^\d{1,2}$/.test(word)) continue; // ignora quantidades soltas como 1/2/3
    if (STOPWORDS.has(word)) continue;
    tokens.add(word);
  }
  return tokens;
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
 * exata, Jaccard >= threshold, ou título curto quase todo contido no longo).
 */
export function isSimilarTitle(
  a: string,
  b: string,
  threshold = 0.6,
): boolean {
  if (titleDedupKey(a) === titleDedupKey(b)) return true;
  const setA = titleTokens(a);
  const setB = titleTokens(b);
  if (setA.size === 0 || setB.size === 0) return false;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;
  if (jaccard >= threshold) return true;
  const minSize = Math.min(setA.size, setB.size);
  const overlap = intersection / minSize;
  return minSize >= 4 && overlap >= 0.85;
}
