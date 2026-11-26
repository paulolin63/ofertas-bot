/**
 * Amazon — plano C: busca via Firecrawl Cloud (API).
 *
 * Por que este plano existe:
 * - A busca pública da Amazon por fetch direto é bloqueada em datacenter
 *   ("DESCULPE algo deu errado" — testado 2026-11-17 e 2026-11-19).
 * - A Product Advertising API (plano A) exige conta aprovada + 10 vendas
 *   qualificadas em 30 dias (tentativa 2026-11-25: conta lin63-20 não
 *   elegível) — sem chaves por enquanto.
 * - A lista curada (plano B, data/amazon-deals.json) está vazia desde a
 *   criação: sem fonte de ofertas, a Amazon nunca postou nada.
 *
 * O Firecrawl Cloud resolve a busca: POST /v2/scrape na página de busca
 * da amazon.com.br devolve markdown com links /dp/<ASIN>, título, preço,
 * preço riscado (quando há), avaliação e nº de compras — testado
 * 2026-11-25 com o CLI keyless (ex.: capacete ciclismo → B0C4JX92HV,
 * R$72,67). O ML NÃO funciona por este caminho: a página de busca do
 * Mercado Livre devolve o muro de reCAPTCHA ao Firecrawl (testado no
 * mesmo dia) — ML continua dependendo da aprovação do app de developer.
 *
 * Custo: 1 crédito por página raspada; o plano gratuito dá 1.000
 * créditos/mês sem cartão. O bot raspa 1 página por keyword por execução
 * (4 execuções/dia × ~5 keywords ≈ 600/mês), dentro do gratuito.
 * Sem FIRECRAWL_API_KEY, o bot volta ao plano B (lista curada).
 *
 * Limite conhecido: a busca da Amazon nem sempre mostra preço riscado;
 * nesses casos o desconto é desconhecido (Deal.discountUnknown) e a
 * oferta fica isenta do filtro de desconto mínimo — ver pickDeals() em
 * src/ml/deals.ts. O preço postado é sempre o preço real visto na hora.
 */

import { amazonSeedToDeal } from "./deals.ts";
import type { Deal } from "../ml/deals.ts";
import { FIRECRAWL_FETCH_TIMEOUT_MS, withTimeout } from "../http.ts";

export const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2/scrape";
export const AMAZON_SEARCH_URL = "https://www.amazon.com.br/s";

// Início de um bloco de produto no markdown do Firecrawl:
// [![título](imagem m.media-amazon.com)](.../dp/<ASIN>...)
const BLOCK_START_RE =
  /\[!\[([^\]]*)\]\((https:\/\/m\.media-amazon\.com[^)]+)\)\]\(([^)]*?\/dp\/([A-Z0-9]{10})[^)]*)\)/g;
const BOLD_TITLE_RE = /\[\*\*([^*]+)\*\*\]/;
// Link do preço: "[R$ 72,67R$72,67R$ 76,50R$76,50](...)" — o preço atual
// aparece duplicado (com e sem espaço após R$) e, quando há, o preço
// riscado aparece depois, também duplicado. O primeiro valor distinto é
// o preço atual; o segundo, se maior, é o preço original.
const PRICE_LINK_RE = /\[((?:R\$\s*[\d.]+,\d{2})+)\]/;
const AMOUNT_RE = /R\$\s*([\d.]+,\d{2})/g;
const RATING_RE = /(\d),(\d)_\d,\d de 5 estrelas/;
const SOLD_RE = /Mais de ([\d.]+) compras no mês passado/;

function parseBrl(raw: string): number | null {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrai Deals do markdown de uma página de busca da amazon.com.br
 * devolvido pelo Firecrawl. Puro (sem I/O) — testável com fixture.
 */
export function parseFirecrawlAmazonMarkdown(
  markdown: string,
  tag: string,
  limit = 20,
): Deal[] {
  const starts = [...markdown.matchAll(BLOCK_START_RE)];
  const deals: Deal[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i];
    const asin = m[4];
    if (seen.has(asin)) continue;
    seen.add(asin);
    const blockStart = m.index ?? 0;
    const blockEnd = i + 1 < starts.length ? (starts[i + 1].index ?? markdown.length) : markdown.length;
    const block = markdown.slice(blockStart, blockEnd);

    const title = (BOLD_TITLE_RE.exec(block)?.[1] ?? m[1] ?? "").trim();
    if (!title) continue;
    const priceMatch = PRICE_LINK_RE.exec(block);
    if (!priceMatch) continue; // sem preço não dá para postar
    const amounts: number[] = [];
    for (const am of priceMatch[1].matchAll(AMOUNT_RE)) {
      const v = parseBrl(am[1]);
      if (v !== null && !amounts.includes(v)) amounts.push(v);
    }
    if (amounts.length === 0) continue;
    const price = amounts[0];
    const originalPrice = amounts.length > 1 && amounts[1] > price ? amounts[1] : null;
    const ratingMatch = RATING_RE.exec(block);
    const rating = ratingMatch ? Number(`${ratingMatch[1]}.${ratingMatch[2]}`) : null;
    const soldMatch = SOLD_RE.exec(block);
    const soldCount = soldMatch ? Number(soldMatch[1].replace(/\./g, "")) : null;

    const base = amazonSeedToDeal(
      { asin, title, price, originalPrice, imageUrl: m[2] },
      tag,
    );
    if (!base) continue;
    deals.push({
      ...base,
      rating,
      soldCount,
      // Sem preço riscado, o desconto é desconhecido — não zero.
      ...(originalPrice === null ? { discountUnknown: true } : {}),
    });
    if (deals.length >= limit) break;
  }
  return deals;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: { markdown?: string };
  markdown?: string; // forma v1
  error?: string;
}

/** Raspa uma página de busca da Amazon via Firecrawl e devolve Deals. */
export async function scrapeAmazonSearch(
  keyword: string,
  apiKey: string,
  tag: string,
  fetchFn: typeof fetch = fetch,
  limit = 20,
): Promise<Deal[]> {
  const url = `${AMAZON_SEARCH_URL}?k=${encodeURIComponent(keyword)}`;
  const res = await fetchFn(
    FIRECRAWL_API_URL,
    withTimeout(
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      },
      FIRECRAWL_FETCH_TIMEOUT_MS,
    ),
  );
  if (!res.ok) throw new Error(`Firecrawl falhou (${res.status})`);
  const json = (await res.json()) as FirecrawlScrapeResponse;
  if (json.success === false) throw new Error(`Firecrawl erro: ${json.error ?? "sem detalhe"}`);
  const markdown = json.data?.markdown ?? json.markdown;
  if (typeof markdown !== "string" || !markdown) {
    throw new Error("Firecrawl não devolveu markdown");
  }
  return parseFirecrawlAmazonMarkdown(markdown, tag, limit);
}
