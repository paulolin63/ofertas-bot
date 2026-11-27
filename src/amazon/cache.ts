/**
 * Cache diário das raspagens da Amazon via Firecrawl (data/amazon-cache.json).
 *
 * O bot roda 4× ao dia (10h, 13h, 16h, 19h BRT) buscando as mesmas 5 keywords
 * do tema do dia. Sem cache, cada dia consumia ~20 créditos do Firecrawl
 * (~440–600/mês). Com cache diário por data BRT + keyword, cada keyword é
 * raspada só uma vez por dia (~5 créditos/dia, ~110/mês — redução de 75%).
 *
 * Falhas transitórias de uma keyword NÃO são gravadas no cache, permitindo
 * nova tentativa na execução seguinte do mesmo dia.
 */

import fs from "node:fs";
import path from "node:path";
import type { Deal } from "../ml/deals.ts";
import { getBrtDateKey } from "../theme.ts";
import { scrapeAmazonSearch } from "./firecrawl.ts";

export const AMAZON_CACHE_FILENAME = "amazon-cache.json";

export interface AmazonCacheData {
  /** Data BRT (YYYY-MM-DD) da coleta. */
  date: string;
  /** Tracking ID usado nas URLs em cache. */
  tag: string;
  /** Ofertas raspadas por keyword normalizada (lowercase + trim). */
  byKeyword: Record<string, Deal[]>;
}

export interface AmazonCacheCollectOptions {
  dataDir: string;
  keywords: string[];
  apiKey: string;
  tag: string;
  now?: Date;
  scrapeFn?: (keyword: string, apiKey: string, tag: string) => Promise<Deal[]>;
}

export interface AmazonCacheCollectResult {
  deals: Deal[];
  cacheHits: number;
  scraped: number;
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

export function loadAmazonCache(
  dataDir: string,
  dateKey: string,
  tag: string,
): AmazonCacheData {
  const file = path.join(dataDir, AMAZON_CACHE_FILENAME);
  const empty: AmazonCacheData = { date: dateKey, tag, byKeyword: {} };
  if (!fs.existsSync(file)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AmazonCacheData>;
    if (
      parsed &&
      parsed.date === dateKey &&
      parsed.tag === tag &&
      parsed.byKeyword &&
      typeof parsed.byKeyword === "object"
    ) {
      return {
        date: parsed.date,
        tag: parsed.tag,
        byKeyword: parsed.byKeyword,
      };
    }
  } catch {
    // Cache corrompido: ignora e refaz a coleta do dia.
  }
  return empty;
}

export function saveAmazonCache(dataDir: string, cache: AmazonCacheData): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, AMAZON_CACHE_FILENAME);
  fs.writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`);
}

export async function collectAmazonWithCache(
  opts: AmazonCacheCollectOptions,
): Promise<AmazonCacheCollectResult> {
  const dateKey = getBrtDateKey(opts.now ?? new Date());
  const scrape = opts.scrapeFn ?? ((kw, key, tag) => scrapeAmazonSearch(kw, key, tag));
  const cache = loadAmazonCache(opts.dataDir, dateKey, opts.tag);

  const deals: Deal[] = [];
  let cacheHits = 0;
  let scraped = 0;
  let dirty = false;

  for (const keyword of opts.keywords) {
    const k = normalizeKeyword(keyword);
    if (!k) continue;
    const cached = cache.byKeyword[k];
    if (Array.isArray(cached) && cached.length > 0) {
      deals.push(...cached);
      cacheHits += 1;
      continue;
    }
    try {
      const found = await scrape(keyword, opts.apiKey, opts.tag);
      deals.push(...found);
      scraped += 1;
      // Não grava lista vazia no cache: páginas sem ofertas extraídas
      // (bloqueio temporário/layout) tentam novamente na próxima execução.
      if (found.length > 0) {
        cache.byKeyword[k] = found;
        dirty = true;
      }
    } catch (error) {
      console.error(`[amazon] busca Firecrawl "${keyword}" falhou:`, (error as Error).message);
    }
  }

  if (dirty) {
    saveAmazonCache(opts.dataDir, cache);
  }

  return { deals, cacheHits, scraped };
}
