import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runJob } from "../src/jobs/run.ts";
import type { BotConfig } from "../src/config.ts";

function config(partial: Partial<BotConfig> & { dataDir: string }): BotConfig {
  return {
    telegramBotToken: "",
    telegramChatId: "",
    mlAffiliateTag: "",
    mlAffiliateLabel: "ofertas-bot",
    mlClientId: "",
    mlClientSecret: "",
    shopeeAppId: "",
    shopeeSecret: "",
    amazonAffiliateTag: "",
    firecrawlApiKey: "",
    freebieSources: ["epic", "gamerpower"],
    freebieMaxPerRun: 3,
    myMemoryEmail: "",
    keywords: [],
    minDiscountPct: 20,
    maxPostsPerRun: 5,
    stores: [],
    dryRun: false,
    ...partial,
  };
}

test("runJob coleta os brindes antes de exigir o token do Telegram", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-run-"));
  let epicHit = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("epicgames")) {
      epicHit = true;
      return new Response(
        JSON.stringify({ data: { Catalog: { searchStore: { elements: [] } } } }),
      );
    }
    return new Response(JSON.stringify([]));
  }) as unknown as typeof fetch;
  try {
    await assert.rejects(
      // Data fixa numa quarta-feira: no domingo (IA grátis) a coleta de
      // brindes é pulada por design, então o teste não pode depender do
      // dia em que roda.
      () =>
        runJob(
          config({ dataDir: dir, freebieSources: ["epic"] }),
          new Date("2026-11-18T12:00:00-03:00"),
        ),
      /TELEGRAM_BOT_TOKEN/,
    );
    // A coleta da Epic aconteceu antes do erro — sem isso, o log do
    // Actions não mostraria os brindes quando o token falta.
    assert.equal(epicHit, true);
  } finally {
    globalThis.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runJob aplica cache diário Amazon, filtro de qualidade, rotação de lojas e dedup similar", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-run-int-"));
  let firecrawlCalls = 0;
  const amazonFixture = fs.readFileSync(
    new URL("./fixtures/firecrawl-amazon-search.md", import.meta.url),
    "utf8",
  );
  const shopeeOffer = (itemId: number, name: string, price: string, discount: number, rating = "4.8", sales = 200) => ({
    itemId,
    shopId: 100 + itemId,
    productName: name,
    productLink: `https://shopee.com.br/p-${itemId}`,
    offerLink: `https://shope.ee/${itemId}`,
    imageUrl: "https://cf.shopee.com.br/file/img",
    priceMin: price,
    priceMax: price,
    priceDiscountRate: discount,
    commissionRate: "0.03",
    sellerCommissionRate: "0",
    shopeeCommissionRate: "0.03",
    commission: "1.00",
    sales,
    ratingStar: rating,
    shopName: "Loja",
  });

  const postedTexts: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("api.firecrawl.dev")) {
      firecrawlCalls += 1;
      return new Response(JSON.stringify({ success: true, data: { markdown: amazonFixture } }));
    }
    if (u.includes("open-api.affiliate.shopee.com.br")) {
      const body = String(init?.body ?? "");
      if (body.includes("capacete ciclismo")) {
        return new Response(
          JSON.stringify({
            data: {
              productOfferV2: {
                nodes: [
                  // Qualidade ruim (preço < R$10)
                  shopeeOffer(1, "Adesivo Capacete Barato", "3.50", 50),
                  // Qualidade ruim (desconto inflado > 85%)
                  shopeeOffer(2, "Capacete Inflado Fake 95%", "80.00", 95),
                  // Duplicata similar do capacete da Amazon (reordenado)
                  shopeeOffer(3, "Promoção Capacete Ciclismo Bike MTB Com Led Pisca Masculino Feminino", "75.00", 40),
                  // Oferta válida Shopee
                  shopeeOffer(4, "Óculos Ciclismo Polarizado UV400 Esportivo MTB", "89.90", 45),
                ],
              },
            },
          }),
        );
      }
      return new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }));
    }
    if (u.includes("api.telegram.org")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { text?: string; caption?: string };
      postedTexts.push(payload.caption ?? payload.text ?? "");
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;

  try {
    // Quinta-feira (tema Esporte e ciclismo — inclui "capacete ciclismo")
    const thuMorning = new Date("2026-11-19T10:07:00-03:00");
    const cfg = config({
      dataDir: dir,
      dryRun: false,
      telegramBotToken: "tok",
      telegramChatId: "@canal",
      stores: ["shopee", "amazon"],
      shopeeAppId: "app",
      shopeeSecret: "sec",
      amazonAffiliateTag: "lin63-20",
      firecrawlApiKey: "fc-key",
      freebieSources: [],
    });

    const first = await runJob(cfg, thuMorning);
    // 5 keywords raspadas 1x na manhã
    assert.equal(firecrawlCalls, 5);
    assert.ok(first.skippedLowQuality >= 2);
    assert.ok(first.posted >= 2);
    // Amazon (discountUnknown) nunca posta "0% OFF"
    for (const msg of postedTexts) {
      assert.doesNotMatch(msg, /\b0% OFF/);
    }
    // Ambas as lojas apareceram (rotação)
    assert.ok(postedTexts.some((m) => m.includes("🏬 Shopee")));
    assert.ok(postedTexts.some((m) => m.includes("🏬 Amazon")));

    // Segunda execução no mesmo dia: 0 novas chamadas ao Firecrawl (100% cache diário)!
    const thuAfternoon = new Date("2026-11-19T16:07:00-03:00");
    await runJob(cfg, thuAfternoon);
    assert.equal(firecrawlCalls, 5);
  } finally {
    globalThis.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
