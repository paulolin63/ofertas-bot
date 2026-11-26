/**
 * Giveaways grátis do GamerPower (jogos e loot) — API pública, sem chave.
 * Conteúdo em inglês: título e descrição são traduzidos para PT-BR
 * (ver translate.ts) antes de postar.
 */

export interface GamerPowerGiveaway {
  id: number;
  title: string;
  worth: string | null;
  thumbnail: string | null;
  image: string | null;
  description: string;
  openGiveawayUrl: string | null;
  gamerpowerUrl: string | null;
  endDate: string | null;
  platforms: string;
  status: string;
}

interface GamerPowerItem {
  id?: number;
  title?: string;
  worth?: string;
  thumbnail?: string;
  image?: string;
  description?: string;
  open_giveaway_url?: string;
  gamerpower_url?: string;
  end_date?: string;
  platforms?: string;
  status?: string;
}

import { withTimeout } from "../http.ts";

const GAMERPOWER_URL =
  "https://www.gamerpower.com/api/giveaways?platform=pc&type=game&sort-by=date";

/** Primeiro parágrafo, até ~200 caracteres — o suficiente para traduzir. */
export function shortDescription(text: string, max = 200): string {
  const first = text.split(/\r?\n\r?\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

export function gamerpowerItemToGiveaway(item: GamerPowerItem): GamerPowerGiveaway | null {
  if (!item.id || !item.title) return null;
  if (item.status && item.status !== "Active") return null;
  return {
    id: item.id,
    title: item.title,
    worth: item.worth && item.worth !== "N/A" ? item.worth : null,
    thumbnail: item.thumbnail ?? null,
    image: item.image ?? null,
    description: shortDescription(item.description ?? ""),
    openGiveawayUrl: item.open_giveaway_url ?? null,
    gamerpowerUrl: item.gamerpower_url ?? null,
    endDate: item.end_date ?? null,
    platforms: item.platforms ?? "",
    status: item.status ?? "",
  };
}

export async function fetchGamerPowerGiveaways(
  fetchFn: typeof fetch = fetch,
): Promise<GamerPowerGiveaway[]> {
  const res = await fetchFn(
    GAMERPOWER_URL,
    withTimeout({
      headers: { "User-Agent": "ofertas-bot/0.1 (+https://github.com/paulolin63/ofertas-bot)" },
    }),
  );
  if (!res.ok) throw new Error(`GamerPower HTTP ${res.status}`);
  const items = (await res.json()) as GamerPowerItem[];
  if (!Array.isArray(items)) return [];
  const out: GamerPowerGiveaway[] = [];
  for (const item of items) {
    const giveaway = gamerpowerItemToGiveaway(item);
    if (giveaway) out.push(giveaway);
  }
  return out;
}
