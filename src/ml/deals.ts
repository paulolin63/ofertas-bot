import { buildAffiliateUrl } from "./affiliate.ts";
import type { MlSearchItem } from "./search.ts";

export interface Deal {
  store: "ml" | "shopee";
  /** Chave única para deduplicação, ex.: ml:MLB1234567890 */
  key: string;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPct: number;
  url: string;
  imageUrl: string | null;
  rating: number | null;
  soldCount: number | null;
  commissionRate: number | null;
}

export function discountPct(price: number, originalPrice: number | null): number {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/** Converte um item da busca do ML em Deal, já com o link de afiliado. */
export function mlItemToDeal(
  item: MlSearchItem,
  tag: string,
  label: string,
): Deal | null {
  // Só produtos novos de vendedores com reputação entram no programa de afiliados.
  if (item.condition && item.condition !== "new") return null;
  const pct = discountPct(item.price, item.original_price);
  return {
    store: "ml",
    key: `ml:${item.id}`,
    title: item.title,
    price: item.price,
    originalPrice: item.original_price,
    discountPct: pct,
    url: buildAffiliateUrl(item.permalink, { tag, label }),
    imageUrl: item.thumbnail ?? null,
    rating: null,
    soldCount: item.sold_quantity ?? null,
    commissionRate: null, // o % por categoria só aparece no painel do afiliado
  };
}

/** Filtra por desconto mínimo e ordena do maior desconto para o menor. */
export function pickDeals(deals: Deal[], minDiscountPct: number, max: number): Deal[] {
  return deals
    .filter((d) => d.discountPct >= minDiscountPct)
    .sort((a, b) => b.discountPct - a.discountPct || a.price - b.price)
    .slice(0, max);
}
