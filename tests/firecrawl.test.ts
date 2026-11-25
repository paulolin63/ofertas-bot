import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseFirecrawlAmazonMarkdown,
  scrapeAmazonSearch,
  FIRECRAWL_API_URL,
  AMAZON_SEARCH_URL,
} from "../src/amazon/firecrawl.ts";
import { pickDeals } from "../src/ml/deals.ts";

const TAG = "lin63-20";

function fixture(): string {
  return fs.readFileSync(
    new URL("./fixtures/firecrawl-amazon-search.md", import.meta.url),
    "utf8",
  );
}

test("parser extrai ASIN, título, preço, preço riscado, avaliação e vendas da fixture real", () => {
  const deals = parseFirecrawlAmazonMarkdown(fixture(), TAG);
  assert.equal(deals.length, 2);

  const helmet = deals[0];
  assert.equal(helmet.key, "amazon:B0C4JX92HV");
  assert.equal(helmet.store, "amazon");
  assert.equal(helmet.title, "Capacete Bike Ciclismo Masculino Feminino Com Led Pisca MTB");
  assert.equal(helmet.price, 72.67);
  assert.equal(helmet.originalPrice, 76.5);
  assert.equal(helmet.discountPct, 5);
  assert.equal(helmet.discountUnknown, undefined);
  assert.equal(helmet.rating, 4.6);
  assert.equal(helmet.soldCount, 50);
  assert.ok(helmet.url.includes("/dp/B0C4JX92HV"));
  assert.ok(helmet.url.includes("tag=lin63-20"));
  assert.ok(helmet.imageUrl?.includes("m.media-amazon.com/images/I/61oLpkhgsGL"));
});

test("sem preço riscado, o desconto é desconhecido (não zero)", () => {
  const deals = parseFirecrawlAmazonMarkdown(fixture(), TAG);
  const cap = deals[1];
  assert.equal(cap.key, "amazon:B0BG5VSLTZ");
  assert.equal(cap.price, 72.9);
  assert.equal(cap.originalPrice, null);
  assert.equal(cap.discountPct, 0);
  assert.equal(cap.discountUnknown, true);
  assert.equal(cap.rating, 4.4);
});

test("bloco sem preço é descartado e ASIN repetido não duplica", () => {
  const md = `
[![Produto Sem Preço](https://m.media-amazon.com/images/I/AAAAAAAAAAAAAAAAAAAAAA._AC_UL320_.jpg)](https://www.amazon.com.br/Produto-Sem-Preco/dp/B0NOPRICE1/ref=sr_1_1)

[**Produto Sem Preço**](https://www.amazon.com.br/Produto-Sem-Preco/dp/B0NOPRICE1/ref=sr_1_1)

4,0_4,0 de 5 estrelas_

Adicionar ao carrinho

[![Capacete Repetido](https://m.media-amazon.com/images/I/61oLpkhgsGL._AC_UL320_.jpg)](https://www.amazon.com.br/Capacete/dp/B0C4JX92HV/ref=sr_1_1)

[**Capacete Repetido**](https://www.amazon.com.br/Capacete/dp/B0C4JX92HV/ref=sr_1_1)

[R$ 72,67R$72,67](https://www.amazon.com.br/Capacete/dp/B0C4JX92HV/ref=sr_1_1)

Adicionar ao carrinho

[![Capacete Repetido](https://m.media-amazon.com/images/I/61oLpkhgsGL._AC_UL320_.jpg)](https://www.amazon.com.br/Capacete/dp/B0C4JX92HV/ref=sr_1_1)

[**Capacete Repetido**](https://www.amazon.com.br/Capacete/dp/B0C4JX92HV/ref=sr_1_1)

[R$ 72,67R$72,67](https://www.amazon.com.br/Capacete/dp/B0C4JX92HV/ref=sr_1_1)

Adicionar ao carrinho
`;
  const deals = parseFirecrawlAmazonMarkdown(md, TAG);
  assert.deepEqual(
    deals.map((d) => d.key),
    ["amazon:B0C4JX92HV"],
  );
});

test("scrapeAmazonSearch chama a API do Firecrawl com Bearer e a URL de busca", async () => {
  let seenUrl: string | undefined;
  let seenInit: RequestInit | undefined;
  const stubFetch = (async (url: string, init?: RequestInit) => {
    seenUrl = url;
    seenInit = init;
    return new Response(
      JSON.stringify({ success: true, data: { markdown: fixture() } }),
    );
  }) as unknown as typeof fetch;

  const deals = await scrapeAmazonSearch("capacete ciclismo", "fc-test-key", TAG, stubFetch);
  assert.equal(seenUrl, FIRECRAWL_API_URL);
  assert.equal(seenInit?.method, "POST");
  const headers = seenInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer fc-test-key");
  const body = JSON.parse(String(seenInit?.body));
  assert.equal(body.url, `${AMAZON_SEARCH_URL}?k=capacete%20ciclismo`);
  assert.deepEqual(body.formats, ["markdown"]);
  assert.equal(deals.length, 2);
  assert.equal(deals[0].key, "amazon:B0C4JX92HV");
});

test("scrapeAmazonSearch falha em HTTP não-OK ou success:false", async () => {
  const failFetch = (async () =>
    new Response("err", { status: 402 })) as unknown as typeof fetch;
  await assert.rejects(
    () => scrapeAmazonSearch("x", "k", TAG, failFetch),
    /Firecrawl falhou \(402\)/,
  );
  const noSuccessFetch = (async () =>
    new Response(
      JSON.stringify({ success: false, error: "cota esgotada" }),
    )) as unknown as typeof fetch;
  await assert.rejects(
    () => scrapeAmazonSearch("x", "k", TAG, noSuccessFetch),
    /cota esgotada/,
  );
});

test("pickDeals isenta desconto desconhecido do mínimo, mas não o desconto zero conhecido", () => {
  const unknown = parseFirecrawlAmazonMarkdown(fixture(), TAG)[1];
  const zeroKnown = {
    store: "ml" as const,
    key: "ml:MLB1",
    title: "Sem desconto",
    price: 100,
    originalPrice: null,
    discountPct: 0,
    url: "https://example.com",
    imageUrl: null,
    rating: null,
    soldCount: null,
    commissionRate: null,
  };
  const picked = pickDeals([zeroKnown, unknown], 20, 5);
  assert.deepEqual(
    picked.map((d) => d.key),
    ["amazon:B0BG5VSLTZ"],
  );
});
