import fs from "node:fs";
import path from "node:path";
import { buildAmazonAffiliateUrl } from "./affiliate.ts";
import { discountPct, type Deal } from "../ml/deals.ts";

/**
 * Amazon — plano B: lista curada em data/amazon-deals.json.
 *
 * A Amazon não tem busca pública utilizável (a busca por fetch a partir
 * de datacenter é bloqueada) e a Product Advertising API (plano A) exige
 * 3 vendas qualificadas em 180 dias para devolver dados. Enquanto isso,
 * as ofertas da Amazon vêm de uma lista curada à mão, conferida no
 * navegador na amazon.com.br (ver docs/SETUP.md). Cada item é um produto
 * real com preço e preço original da data da conferência — refrescar a
 * lista toda semana, pois preço e oferta mudam.
 */
export interface AmazonSeedDeal {
  asin: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
}

const ASIN_RE = /^[A-Z0-9]{10}$/;

export function amazonSeedToDeal(seed: AmazonSeedDeal, tag: string): Deal | null {
  if (!ASIN_RE.test(seed.asin)) return null;
  if (!seed.title || !(seed.price > 0)) return null;
  const originalPrice = seed.originalPrice ?? null;
  return {
    store: "amazon",
    key: `amazon:${seed.asin}`,
    title: seed.title,
    price: seed.price,
    originalPrice,
    discountPct: discountPct(seed.price, originalPrice),
    url: buildAmazonAffiliateUrl(`https://www.amazon.com.br/dp/${seed.asin}`, tag),
    imageUrl: seed.imageUrl ?? null,
    rating: null,
    soldCount: null,
    commissionRate: null, // varia por categoria; só aparece no painel do afiliado
  };
}

export function loadAmazonSeedDeals(
  dataDir: string,
  tag: string,
  readFile: (p: string) => string = (p) => fs.readFileSync(p, "utf8"),
): Deal[] {
  if (!tag) return [];
  const file = path.join(dataDir, "amazon-deals.json");
  let raw: string;
  try {
    raw = readFile(file);
  } catch {
    console.warn("[amazon] data/amazon-deals.json não encontrado — loja Amazon sem ofertas.");
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[amazon] data/amazon-deals.json com JSON inválido — ignorado.");
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { deals?: unknown }).deals;
  if (!Array.isArray(list)) return [];
  const deals: Deal[] = [];
  for (const entry of list as AmazonSeedDeal[]) {
    try {
      const deal = amazonSeedToDeal(entry, tag);
      if (deal) deals.push(deal);
    } catch (error) {
      console.error(
        `[amazon] item inválido ignorado (${(entry as { asin?: string }).asin ?? "?"}):`,
        (error as Error).message,
      );
    }
  }
  return deals;
}
