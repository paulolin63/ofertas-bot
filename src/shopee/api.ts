/**
 * Shopee Affiliate Open API (Brasil).
 * Endpoint: https://open-api.affiliate.shopee.com.br/graphql
 *
 * Autenticação (conforme o cliente oficial de referência):
 *   signature = SHA256(appId + timestamp + payload + secret)  [hex]
 *   Authorization: SHA256 Credential=<appId>, Timestamp=<ts>, Signature=<sig>
 *
 * Operações usadas:
 * - productOfferV2: lista ofertas por palavra-chave (já traz offerLink, que
 *   é o link de afiliado pronto, além de priceDiscountRate e commissionRate).
 * - generateShortLink: converte uma URL qualquer de produto em link afiliado.
 */

import crypto from "node:crypto";
import { withTimeout } from "../http.ts";

export const SHOPEE_GRAPHQL_URL = "https://open-api.affiliate.shopee.com.br/graphql";

export function buildAuthorization(
  appId: string,
  secret: string,
  payload: string,
  timestamp: number,
): string {
  const signature = crypto
    .createHash("sha256")
    .update(`${appId}${timestamp}${payload}${secret}`)
    .digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export interface ShopeeProductOffer {
  itemId: number;
  shopId: number;
  productName: string;
  productLink: string;
  offerLink: string;
  imageUrl: string;
  priceMin: string;
  priceMax: string;
  priceDiscountRate: number;
  commissionRate: string;
  sellerCommissionRate: string;
  shopeeCommissionRate: string;
  commission: string;
  sales: number;
  ratingStar: string;
  shopName: string;
}

interface ProductOfferResponse {
  data?: { productOfferV2?: { nodes?: ShopeeProductOffer[] } };
  errors?: Array<{ message: string }>;
}

export async function searchProductOffers(
  opts: {
    appId: string;
    secret: string;
    keyword: string;
    sortType?: number; // 1 relevância, 2 vendas, 5 maior comissão
    page?: number;
    limit?: number;
  },
  fetchFn: typeof fetch = fetch,
): Promise<ShopeeProductOffer[]> {
  const query = `{
  productOfferV2(keyword: ${JSON.stringify(opts.keyword)}, sortType: ${opts.sortType ?? 2}, page: ${opts.page ?? 1}, limit: ${opts.limit ?? 20}) {
    nodes {
      itemId shopId productName productLink offerLink imageUrl
      priceMin priceMax priceDiscountRate commissionRate
      sellerCommissionRate shopeeCommissionRate commission
      sales ratingStar shopName
    }
    pageInfo { page limit hasNextPage }
  }
}`;
  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const res = await fetchFn(
    SHOPEE_GRAPHQL_URL,
    withTimeout({
      method: "POST",
      headers: {
        Authorization: buildAuthorization(opts.appId, opts.secret, payload, timestamp),
        "Content-Type": "application/json",
      },
      body: payload,
    }),
  );
  if (!res.ok) throw new Error(`Shopee API falhou (${res.status})`);
  const json = (await res.json()) as ProductOfferResponse;
  if (json.errors?.length) {
    throw new Error(`Shopee API erro: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data?.productOfferV2?.nodes ?? [];
}

export async function generateShortLink(
  opts: { appId: string; secret: string; originUrl: string; subIds?: string[] },
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const subIds = (opts.subIds ?? ["ofertas-bot"])
    .map((s) => JSON.stringify(s))
    .join(",");
  const query = `mutation {
  generateShortLink(input: { originUrl: ${JSON.stringify(opts.originUrl)}, subIds: [${subIds}] }) {
    shortLink
  }
}`;
  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const res = await fetchFn(
    SHOPEE_GRAPHQL_URL,
    withTimeout({
      method: "POST",
      headers: {
        Authorization: buildAuthorization(opts.appId, opts.secret, payload, timestamp),
        "Content-Type": "application/json",
      },
      body: payload,
    }),
  );
  if (!res.ok) throw new Error(`Shopee generateShortLink falhou (${res.status})`);
  const json = (await res.json()) as {
    data?: { generateShortLink?: { shortLink?: string } };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`Shopee API erro: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  const link = json.data?.generateShortLink?.shortLink;
  if (!link) throw new Error("Shopee não devolveu shortLink");
  return link;
}
