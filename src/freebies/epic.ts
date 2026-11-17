/**
 * Jogos grátis da Epic Games Store (Brasil).
 *
 * API pública, sem chave: freeGamesPromotions com locale=pt-BR e
 * country=BR já devolve título e descrição em português — sem tradução.
 * Um jogo está grátis agora quando há promotionalOffer com
 * discountPercentage 0 e a data atual dentro de [startDate, endDate].
 */

export interface EpicGame {
  title: string;
  description: string;
  originalPrice: string | null;
  imageUrl: string | null;
  url: string;
  endDate: string | null;
}

interface EpicElement {
  title: string;
  description?: string;
  productSlug?: string | null;
  urlSlug?: string | null;
  price?: { totalPrice?: { fmtPrice?: { originalPrice?: string } } };
  keyImages?: Array<{ type: string; url: string }>;
  promotions?: {
    promotionalOffers?: Array<{
      promotionalOffers?: Array<{
        startDate?: string;
        endDate?: string;
        discountSetting?: { discountPercentage?: number };
      }>;
    }>;
  } | null;
}

const EPIC_URL =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR";

export function epicElementToGame(el: EpicElement, now: Date = new Date()): EpicGame | null {
  const offers = el.promotions?.promotionalOffers ?? [];
  let endDate: string | null = null;
  let isFreeNow = false;
  for (const group of offers) {
    for (const offer of group.promotionalOffers ?? []) {
      const pct = offer.discountSetting?.discountPercentage;
      if (pct !== 0) continue;
      const start = offer.startDate ? new Date(offer.startDate) : null;
      const end = offer.endDate ? new Date(offer.endDate) : null;
      if (start && start > now) continue;
      if (end && end < now) continue;
      isFreeNow = true;
      if (end) endDate = offer.endDate ?? null;
    }
  }
  if (!isFreeNow) return null;
  const slug = el.productSlug || el.urlSlug;
  const url = slug
    ? `https://store.epicgames.com/pt-BR/p/${slug}`
    : `https://store.epicgames.com/pt-BR/browse?q=${encodeURIComponent(el.title)}`;
  const wide = el.keyImages?.find((i) => i.type === "OfferImageWide")?.url
    ?? el.keyImages?.find((i) => i.type === "Thumbnail")?.url
    ?? null;
  return {
    title: el.title,
    description: (el.description ?? "").trim(),
    originalPrice: el.price?.totalPrice?.fmtPrice?.originalPrice ?? null,
    imageUrl: wide,
    url,
    endDate,
  };
}

export async function fetchEpicFreeGames(
  fetchFn: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<EpicGame[]> {
  const res = await fetchFn(EPIC_URL, {
    headers: { "User-Agent": "ofertas-bot/0.1 (+https://github.com/paulolin63/ofertas-bot)" },
  });
  if (!res.ok) throw new Error(`Epic HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: { Catalog?: { searchStore?: { elements?: EpicElement[] } } };
  };
  const elements = data.data?.Catalog?.searchStore?.elements ?? [];
  const games: EpicGame[] = [];
  for (const el of elements) {
    const game = epicElementToGame(el, now);
    if (game) games.push(game);
  }
  return games;
}
