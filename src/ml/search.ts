/**
 * Mercado Livre — busca de produtos via API pública de sites.
 * GET https://api.mercadolibre.com/sites/MLB/search?q=...&limit=50
 * Não exige autenticação, mas o ML bloqueia alguns IPs de datacenter
 * (nesta VM o endpoint devolve 403 e o site mostra captcha). Por isso o
 * job foi desenhado para rodar no GitHub Actions — veja
 * .github/workflows/post-deals.yml e docs/SETUP.md.
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

const SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search";

export async function searchMl(
  query: string,
  limit = 50,
  fetchFn: typeof fetch = fetch,
): Promise<MlSearchItem[]> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetchFn(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ofertas-bot/0.1 (+https://github.com/paulolin63/ofertas-bot)",
    },
  });
  if (!res.ok) {
    throw new Error(`ML search falhou (${res.status}) para "${query}"`);
  }
  const data = (await res.json()) as MlSearchResponse;
  return data.results ?? [];
}
