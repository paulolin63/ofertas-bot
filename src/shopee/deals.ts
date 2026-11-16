import type { Deal } from "../ml/deals.ts";
import type { ShopeeProductOffer } from "./api.ts";

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Converte uma oferta da Shopee em Deal. O offerLink já é o link de afiliado. */
export function shopeeOfferToDeal(offer: ShopeeProductOffer): Deal {
  const priceMin = toNumber(offer.priceMin);
  const priceMax = toNumber(offer.priceMax);
  const price = priceMin ?? priceMax ?? 0;
  const pct = offer.priceDiscountRate ?? 0;
  const originalPrice =
    pct > 0 && pct < 100 && price > 0 ? Math.round((price / (1 - pct / 100)) * 100) / 100 : null;
  return {
    store: "shopee",
    key: `shopee:${offer.shopId}-${offer.itemId}`,
    title: offer.productName,
    price,
    originalPrice,
    discountPct: pct,
    url: offer.offerLink || offer.productLink,
    imageUrl: offer.imageUrl || null,
    rating: toNumber(offer.ratingStar),
    soldCount: offer.sales ?? null,
    commissionRate: toNumber(offer.commissionRate),
  };
}
