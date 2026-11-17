import test from "node:test";
import assert from "node:assert/strict";
import { buildAmazonAffiliateUrl } from "../src/amazon/affiliate.ts";
import {
  amazonSeedToDeal,
  loadAmazonSeedDeals,
  type AmazonSeedDeal,
} from "../src/amazon/deals.ts";

test("tag é anexada à URL do produto", () => {
  assert.equal(
    buildAmazonAffiliateUrl("https://www.amazon.com.br/dp/B0C1234567", "lin63-20"),
    "https://www.amazon.com.br/dp/B0C1234567?tag=lin63-20",
  );
});

test("tag substitui tag existente e preserva outros parâmetros", () => {
  const url = buildAmazonAffiliateUrl(
    "https://www.amazon.com.br/dp/B0C1234567?psc=1&tag=outro-20",
    "lin63-20",
  );
  assert.ok(url.includes("tag=lin63-20"));
  assert.ok(!url.includes("outro-20"));
  assert.ok(url.includes("psc=1"));
});

test("URL fora da amazon.com.br é rejeitada", () => {
  assert.throws(
    () => buildAmazonAffiliateUrl("https://www.shopee.com.br/x", "lin63-20"),
    /amazon\.com\.br/,
  );
});

function seed(partial: Partial<AmazonSeedDeal> = {}): AmazonSeedDeal {
  return {
    asin: "B0C1234567",
    title: "Air Fryer Teste",
    price: 300,
    originalPrice: 400,
    ...partial,
  };
}

test("seed válido vira Deal com desconto e chave amazon:ASIN", () => {
  const deal = amazonSeedToDeal(seed(), "lin63-20");
  assert.ok(deal);
  assert.equal(deal?.store, "amazon");
  assert.equal(deal?.key, "amazon:B0C1234567");
  assert.equal(deal?.discountPct, 25);
  assert.ok(deal?.url.includes("tag=lin63-20"));
});

test("ASIN inválido ou preço inválido é descartado", () => {
  assert.equal(amazonSeedToDeal(seed({ asin: "curto" }), "lin63-20"), null);
  assert.equal(amazonSeedToDeal(seed({ price: 0 }), "lin63-20"), null);
});

test("loader lê a lista e ignora arquivo ausente ou inválido", () => {
  const file = JSON.stringify([
    seed(),
    seed({ asin: "ruim" }),
    seed({ asin: "B0D7654321", price: 100, originalPrice: 100 }),
  ]);
  const deals = loadAmazonSeedDeals("/data", "lin63-20", () => file);
  assert.deepEqual(
    deals.map((d) => d.key),
    ["amazon:B0C1234567", "amazon:B0D7654321"],
  );
  assert.deepEqual(
    loadAmazonSeedDeals("/data", "lin63-20", () => {
      throw new Error("ENOENT");
    }),
    [],
  );
  assert.deepEqual(loadAmazonSeedDeals("/data", "lin63-20", () => "{quebrado"), []);
});
