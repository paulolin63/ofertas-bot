import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorization } from "../src/shopee/api.ts";
import { shopeeOfferToDeal } from "../src/shopee/deals.ts";

test("assinatura Shopee: SHA256 hex, muda com o payload", () => {
  const a = buildAuthorization("123456", "segredo", '{"query":"{ x }"}', 1577836800);
  const b = buildAuthorization("123456", "segredo", '{"query":"{ y }"}', 1577836800);
  assert.match(a, /^SHA256 Credential=123456, Timestamp=1577836800, Signature=[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("assinatura usa appId+timestamp+payload+secret", async () => {
  const crypto = await import("node:crypto");
  const payload = '{"query":"{ x }"}';
  const expected = crypto
    .createHash("sha256")
    .update(`1234561577836800${payload}segredo`)
    .digest("hex");
  const header = buildAuthorization("123456", "segredo", payload, 1577836800);
  assert.ok(header.endsWith(`Signature=${expected}`));
});

test("oferta Shopee vira Deal com desconto e offerLink", () => {
  const deal = shopeeOfferToDeal({
    itemId: 111,
    shopId: 222,
    productName: "Fone Bluetooth",
    productLink: "https://shopee.com.br/produto-i.222.111",
    offerLink: "https://shope.ee/abc",
    imageUrl: "https://cf.shopee.com.br/file/img",
    priceMin: "89.90",
    priceMax: "99.90",
    priceDiscountRate: 25,
    commissionRate: "0.03",
    sellerCommissionRate: "0",
    shopeeCommissionRate: "0.03",
    commission: "2.70",
    sales: 350,
    ratingStar: "4.9",
    shopName: "Loja Teste",
  });
  assert.equal(deal.key, "shopee:222-111");
  assert.equal(deal.discountPct, 25);
  assert.equal(deal.url, "https://shope.ee/abc");
  assert.equal(deal.price, 89.9);
  assert.ok((deal.originalPrice ?? 0) > deal.price);
});
