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

export const DEFAULT_MIN_PRICE = 10;
export const DEFAULT_MAX_DISCOUNT_PCT = 85;
export const DEFAULT_MIN_RATING = 4.0;
export const DEFAULT_MIN_SALES = 10;

export interface DealQualityOptions {
  minPrice?: number;
  maxDiscountPct?: number;
  minRating?: number;
  minSales?: number;
}

export interface PickDealsOptions extends DealQualityOptions {
  /** Intercala ofertas entre lojas (round-robin) para evitar monopólio. Padrão: true. */
  rotateStores?: boolean;
  /** Ordem preferencial de lojas na rotação. */
  storeOrder?: Array<Deal["store"]>;
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
 * Filtro de qualidade para descartar iscas de variação (preço irrisório),
 * descontos artificialmente inflados (> 85%), avaliações baixas (< 4.0)
 * e anúncios com pouquíssimas vendas. Campos desconhecidos (null) não
 * penalizam a oferta.
 */
export function isQualityDeal(
  deal: Deal,
  opts: DealQualityOptions = {},
): boolean {
  const minPrice = opts.minPrice ?? DEFAULT_MIN_PRICE;
  const maxDiscountPct = opts.maxDiscountPct ?? DEFAULT_MAX_DISCOUNT_PCT;
  const minRating = opts.minRating ?? DEFAULT_MIN_RATING;
  const minSales = opts.minSales ?? DEFAULT_MIN_SALES;

  if (!deal.title.trim()) return false;
  if (!(deal.price > 0) || deal.price < minPrice) return false;
  if (!deal.discountUnknown && deal.discountPct > maxDiscountPct) return false;
  if (deal.rating !== null && deal.rating > 0 && deal.rating < minRating) return false;
  if (deal.soldCount !== null && deal.soldCount < minSales) return false;
  return true;
}

export function compareDeals(a: Deal, b: Deal): number {
  const unknownDiff = (a.discountUnknown ? 1 : 0) - (b.discountUnknown ? 1 : 0);
  if (unknownDiff !== 0) return unknownDiff;
  const pctDiff = b.discountPct - a.discountPct;
  if (pctDiff !== 0) return pctDiff;
  const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
  if (ratingDiff !== 0) return ratingDiff;
  const soldDiff = (b.soldCount ?? 0) - (a.soldCount ?? 0);
  if (soldDiff !== 0) return soldDiff;
  return a.price - b.price;
}

function brtRotationSlot(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const dayNum = Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
  const hourSlot = Math.floor(get("hour") / 3);
  return dayNum + hourSlot;
}

/**
 * Rotaciona a ordem inicial das lojas conforme o dia e o turno (BRT),
 * garantindo que nenhuma loja lidere sempre as vagas ímpares.
 */
export function rotateStoreOrder(
  stores: Array<Deal["store"]>,
  now: Date = new Date(),
): Array<Deal["store"]> {
  if (stores.length <= 1) return [...stores];
  const shift = ((brtRotationSlot(now) % stores.length) + stores.length) % stores.length;
  return [...stores.slice(shift), ...stores.slice(0, shift)];
}

/**
 * Filtra por qualidade e desconto mínimo, ordena dentro de cada loja e
 * intercala entre lojas (round-robin) para equilibrar ML, Shopee e Amazon.
 * Deals com desconto desconhecido (discountUnknown, ex.: Amazon via
 * Firecrawl sem preço riscado na página) são isentos do filtro mínimo,
 * mas ordenam depois das ofertas com desconto real da mesma loja.
 */
export function pickDeals(
  deals: Deal[],
  minDiscountPct: number,
  max: number,
  options: PickDealsOptions = {},
): Deal[] {
  if (max <= 0) return [];
  const eligible = deals.filter(
    (d) => isQualityDeal(d, options) && (d.discountUnknown === true || d.discountPct >= minDiscountPct),
  );
  if (options.rotateStores === false) {
    return eligible.sort(compareDeals).slice(0, max);
  }

  const buckets = new Map<Deal["store"], Deal[]>();
  for (const deal of eligible) {
    const list = buckets.get(deal.store) ?? [];
    list.push(deal);
    buckets.set(deal.store, list);
  }
  for (const list of buckets.values()) {
    list.sort(compareDeals);
  }

  const preferred = options.storeOrder ?? (["ml", "shopee", "amazon"] as Array<Deal["store"]>);
  const order: Array<Deal["store"]> = [];
  for (const store of preferred) {
    if (buckets.has(store) && !order.includes(store)) order.push(store);
  }
  for (const store of buckets.keys()) {
    if (!order.includes(store)) order.push(store);
  }

  const picked: Deal[] = [];
  let round = 0;
  while (picked.length < max) {
    let addedInRound = false;
    for (const store of order) {
      const list = buckets.get(store);
      if (list && round < list.length) {
        picked.push(list[round]!);
        addedInRound = true;
        if (picked.length >= max) break;
      }
    }
    if (!addedInRound) break;
    round += 1;
  }
  return picked;
}
