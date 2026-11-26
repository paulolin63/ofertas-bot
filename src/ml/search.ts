/**
 * Mercado Livre listing search. The request must use a user-authorized OAuth
 * access token; an app-only or anonymous request may be rejected with 403.
 * Mercado Livre also documents 403 for country/account authorization and
 * policy restrictions, so the response detail is surfaced without logging
 * arbitrary response bodies or credentials.
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
const SAFE_ERROR_FIELDS = ["error", "code", "blocked_by", "message"] as const;

function safeErrorDetail(body: unknown, accessToken?: string): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const values = SAFE_ERROR_FIELDS.flatMap((key) => {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) return [];
    const safeValue = accessToken ? value.trim().replaceAll(accessToken, "[REDACTED]") : value.trim();
    return [safeValue];
  });
  return [...new Set(values)]
    .join("; ")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

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
    let detail = "";
    try {
      detail = safeErrorDetail(await res.json(), accessToken);
    } catch {
      // Ignore non-JSON bodies; never dump arbitrary response text to logs.
    }
    throw new Error(
      `ML search falhou (${res.status}) para "${query}"${detail ? `: ${detail}` : ""}`,
    );
  }
  const data = (await res.json()) as MlSearchResponse;
  return data.results ?? [];
}
