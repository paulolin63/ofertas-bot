/**
 * Mercado Livre — busca de produtos via API pública de sites.
 * GET https://api.mercadolibre.com/sites/MLB/search?q=...&limit=50
 * Sem autenticação o ML bloqueia IPs de datacenter: 403 nesta VM e também
 * nos runners do GitHub Actions (testado 2026-11-16, 5/5 keywords). Por
 * isso searchMl aceita um access_token opcional (ver src/ml/auth.ts): com
 * Bearer, a chamada pode passar pelo bloqueio. Sem token, segue sem
 * autenticação e o erro 403 é registrado pelo job.
 */

export interface MlSearchItem {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  permalink: string;
  thumbnail: string | null;
  condition: string;
  sold_quantity: number;
  shipping?: { free_shipping?: boolean };
  seller?: { seller_reputation?: { power_seller_status?: string | null } };
}

export interface MlSearchResponse {
  results: MlSearchItem[];
  paging?: { total: number };
}

import { withTimeout } from "../http.ts";

const SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search";

export async function searchMl(
  query: string,
  limit = 50,
  fetchFn: typeof fetch = fetch,
  accessToken?: string,
): Promise<MlSearchItem[]> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "ofertas-bot/0.1 (+https://github.com/paulolin63/ofertas-bot)",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetchFn(url, withTimeout({ headers }));
  if (!res.ok) {
    throw new Error(`ML search falhou (${res.status}) para "${query}"`);
  }
  const data = (await res.json()) as MlSearchResponse;
  return data.results ?? [];
}
