import test from "node:test";
import assert from "node:assert/strict";
import { formatDealMessage } from "../src/telegram/format.ts";
import type { Deal } from "../src/ml/deals.ts";

function deal(partial: Partial<Deal> = {}): Deal {
  return {
    store: "ml",
    key: "ml:MLB1",
    title: "Capacete Ciclismo MTB Scott Cadence Plus MIPS",
    price: 399.9,
    originalPrice: 599.9,
    discountPct: 33,
    url: "https://www.mercadolivre.com.br/x?matt_tool=TAG",
    imageUrl: null,
    rating: 4.8,
    soldCount: 1200,
    commissionRate: null,
    ...partial,
  };
}

test("mensagem traz desconto, preços e selo de afiliado", () => {
  const text = formatDealMessage(deal());
  assert.match(text, /33% OFF/);
  assert.match(text, /R\$ 599,90/);
  assert.match(text, /R\$ 399,90/);
  assert.match(text, /Mercado Livre/);
  assert.match(text, /Link de afiliado/);
  assert.match(text, /Ver oferta/);
});

test("sem preço original, mostra só o preço atual", () => {
  const text = formatDealMessage(deal({ originalPrice: null, discountPct: 0 }));
  assert.match(text, /R\$ 399,90/);
  assert.doesNotMatch(text, /De <s>/);
});

test("título longo é cortado e a legenda respeita 1024 caracteres", () => {
  const text = formatDealMessage(deal({ title: "X".repeat(500) }));
  assert.ok(text.length <= 1024);
});

test("HTML no título é escapado", () => {
  const text = formatDealMessage(deal({ title: "<b>teste</b> & promoção" }));
  assert.match(text, /&lt;b&gt;teste&lt;\/b&gt; &amp; promoção/);
});
