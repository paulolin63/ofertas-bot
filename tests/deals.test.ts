import test from "node:test";
import assert from "node:assert/strict";
import {
  discountPct,
  isQualityDeal,
  mlItemToDeal,
  pickDeals,
  rotateStoreOrder,
  type Deal,
} from "../src/ml/deals.ts";
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

function mkDeal(partial: Partial<Deal> & { key: string }): Deal {
  return {
    store: "ml",
    title: partial.key,
    price: 100,
    originalPrice: 150,
    discountPct: 33,
    url: "https://example.com",
    imageUrl: null,
    rating: null,
    soldCount: null,
    commissionRate: null,
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
  const picked = pickDeals(
    [
      mkDeal({ key: "a", discountPct: 10, price: 90 }),
      mkDeal({ key: "b", discountPct: 50, price: 50 }),
      mkDeal({ key: "c", discountPct: 30, price: 70 }),
    ],
    20,
    2,
  );
  assert.deepEqual(
    picked.map((d) => d.key),
    ["b", "c"],
  );
});

test("isQualityDeal descarta preço muito baixo, desconto inflado, nota baixa e poucas vendas", () => {
  assert.equal(isQualityDeal(mkDeal({ key: "ok", price: 50, discountPct: 40, rating: 4.5, soldCount: 50 })), true);
  assert.equal(isQualityDeal(mkDeal({ key: "cheap", price: 4.99 })), false);
  assert.equal(isQualityDeal(mkDeal({ key: "inflated", discountPct: 95 })), false);
  assert.equal(isQualityDeal(mkDeal({ key: "low-rating", rating: 3.4 })), false);
  assert.equal(isQualityDeal(mkDeal({ key: "low-sales", soldCount: 2 })), false);
  // Campos desconhecidos (null) e rating 0 (sem avaliações na Shopee) não reprovam sozinhos.
  assert.equal(isQualityDeal(mkDeal({ key: "unrated", rating: 0, soldCount: null })), true);
});

test("pickDeals intercala lojas em round-robin para evitar monopólio", () => {
  const deals: Deal[] = [
    mkDeal({ key: "s1", store: "shopee", discountPct: 70 }),
    mkDeal({ key: "s2", store: "shopee", discountPct: 65 }),
    mkDeal({ key: "s3", store: "shopee", discountPct: 60 }),
    mkDeal({ key: "a1", store: "amazon", discountPct: 25 }),
    mkDeal({ key: "a2", store: "amazon", discountPct: 0, discountUnknown: true }),
    mkDeal({ key: "m1", store: "ml", discountPct: 40 }),
  ];
  const picked = pickDeals(deals, 20, 5, { storeOrder: ["ml", "shopee", "amazon"] });
  assert.deepEqual(
    picked.map((d) => d.key),
    ["m1", "s1", "a1", "s2", "a2"],
  );
});

test("rotateStoreOrder alterna a loja líder entre turnos BRT", () => {
  const stores: Array<Deal["store"]> = ["ml", "shopee", "amazon"];
  const r10 = rotateStoreOrder(stores, new Date("2026-11-18T10:07:00-03:00"));
  const r13 = rotateStoreOrder(stores, new Date("2026-11-18T13:07:00-03:00"));
  const r16 = rotateStoreOrder(stores, new Date("2026-11-18T16:07:00-03:00"));
  assert.equal(new Set([r10[0], r13[0], r16[0]]).size, 3);
});
