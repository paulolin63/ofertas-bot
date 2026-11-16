import test from "node:test";
import assert from "node:assert/strict";
import { discountPct, mlItemToDeal, pickDeals, type Deal } from "../src/ml/deals.ts";
import type { MlSearchItem } from "../src/ml/search.ts";

function item(partial: Partial<MlSearchItem> & { id: string }): MlSearchItem {
  return {
    title: "Produto teste",
    price: 100,
    original_price: null,
    permalink: "https://www.mercadolivre.com.br/produto/p/MLB1",
    thumbnail: null,
    condition: "new",
    sold_quantity: 10,
    ...partial,
  };
}

test("desconto: 200 -> 100 = 50%", () => {
  assert.equal(discountPct(100, 200), 50);
  assert.equal(discountPct(100, null), 0);
  assert.equal(discountPct(100, 100), 0);
  assert.equal(discountPct(100, 90), 0);
});

test("item usado é descartado (só produto novo entra no programa)", () => {
  assert.equal(mlItemToDeal(item({ id: "MLB1", condition: "used" }), "TAG", "x"), null);
});

test("item novo vira Deal com link de afiliado", () => {
  const deal = mlItemToDeal(item({ id: "MLB2", price: 80, original_price: 100 }), "TAG", "x");
  assert.ok(deal);
  assert.equal(deal?.key, "ml:MLB2");
  assert.equal(deal?.discountPct, 20);
  assert.ok(deal?.url.includes("matt_tool=TAG"));
});

test("pickDeals filtra pelo mínimo e ordena por desconto", () => {
  const mk = (key: string, pct: number, price: number): Deal => ({
    store: "ml",
    key,
    title: key,
    price,
    originalPrice: 100,
    discountPct: pct,
    url: "https://example.com",
    imageUrl: null,
    rating: null,
    soldCount: null,
    commissionRate: null,
  });
  const picked = pickDeals([mk("a", 10, 90), mk("b", 50, 50), mk("c", 30, 70)], 20, 2);
  assert.deepEqual(
    picked.map((d) => d.key),
    ["b", "c"],
  );
});
