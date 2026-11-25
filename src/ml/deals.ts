import { buildAffiliateUrl } from "./affiliate.ts";
import type { MlSearchItem } from "./search.ts";

export interface Deal {
  store: "ml" | "shopee" | "amazon";
  /** Chave única para deduplicação, ex.: ml:MLB1234567890 */
  key: string;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPct: number;
  /**
   * true quando a fonte não informou preço original — o desconto é
   * DESCONHECIDO, não zero. A busca da Amazon via Firecrawl muitas
   * vezes mostra só o preço atual, sem o preço riscado; sem este
   * campo, discountPct seria 0 e o filtro de desconto mínimo
   * descartaria TODAS as ofertas da Amazon (ver pickDeals() e
   * src/amazon/firecrawl.ts). Deals com desconto desconhecido passam
   * pelo filtro, mas ordenam depois das que têm desconto conhecido
   * (discountPct 0) — funcionam como reserva, não como prioridade.
   */
  discountUnknown?: boolean;
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

/**
 * Filtra por desconto mínimo e ordena do maior desconto para o menor.
 * Deals com desconto desconhecido (discountUnknown, ex.: Amazon via
 * Firecrawl sem preço riscado na página) são isentos do filtro mínimo:
 * sem preço original não há como calcular desconto, e tratá-lo como 0
 * descartaria todas essas ofertas. Elas ordenam por último (discountPct
 * 0) e só preenchem as vagas que sobram depois das com desconto real.
 */
export function pickDeals(deals: Deal[], minDiscountPct: number, max: number): Deal[] {
  return deals
    .filter((d) => d.discountUnknown === true || d.discountPct >= minDiscountPct)
    .sort((a, b) => b.discountPct - a.discountPct || a.price - b.price)
    .slice(0, max);
}
