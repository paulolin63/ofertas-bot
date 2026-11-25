import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  formatThemeAnnouncement,
  getBrtWeekday,
  getTheme,
  themeAnnouncementKey,
} from "../src/theme.ts";
import { runJob } from "../src/jobs/run.ts";
import type { BotConfig } from "../src/config.ts";

// 2026-11-16 é segunda, 17 terça, 18 quarta, 19 quinta, 20 sexta, 21 sábado, 22 domingo.
const atNoonBrt = (isoDate: string): Date => new Date(`${isoDate}T12:00:00-03:00`);

test("getTheme mapeia cada dia da semana (BRT) para o tema certo", () => {
  assert.equal(getTheme(atNoonBrt("2026-11-16")).name, "Cosméticos");
  assert.equal(getTheme(atNoonBrt("2026-11-17")).name, "Automóveis");
  assert.equal(getTheme(atNoonBrt("2026-11-18")).name, "Eletrônicos");
  assert.equal(getTheme(atNoonBrt("2026-11-19")).name, "Esporte e ciclismo");
  assert.equal(getTheme(atNoonBrt("2026-11-20")).name, "Casa e cozinha");
  assert.equal(getTheme(atNoonBrt("2026-11-21")).name, "Jogos grátis");
  assert.equal(getTheme(atNoonBrt("2026-11-22")).name, "IA grátis");
  assert.equal(getTheme(atNoonBrt("2026-11-21")).mode, "free-games");
  assert.equal(getTheme(atNoonBrt("2026-11-22")).mode, "free-ai");
  assert.equal(getTheme(atNoonBrt("2026-11-18")).mode, "deals");
});

test("getBrtWeekday usa o fuso de Brasília, não o UTC do runner", () => {
  // 2026-11-19T01:00:00Z é 2026-11-18 22:00 em BRT (quarta); em UTC já é quinta.
  assert.equal(getBrtWeekday(new Date("2026-11-19T01:00:00Z")), 3);
  assert.equal(getTheme(new Date("2026-11-19T01:00:00Z")).name, "Eletrônicos");
});

test("themeAnnouncementKey é uma por dia (BRT)", () => {
  const wed = themeAnnouncementKey(atNoonBrt("2026-11-18"));
  assert.equal(wed, "theme:2026-11-18");
  assert.equal(themeAnnouncementKey(new Date("2026-11-18T23:30:00-03:00")), wed);
  assert.notEqual(themeAnnouncementKey(atNoonBrt("2026-11-19")), wed);
});

test("formatThemeAnnouncement traz o dia em PT-BR e o tema em maiúsculas", () => {
  const wed = formatThemeAnnouncement(getTheme(atNoonBrt("2026-11-18")), atNoonBrt("2026-11-18"));
  assert.match(wed, /quarta-feira/);
  assert.match(wed, /ELETRÔNICOS/);
  const sat = formatThemeAnnouncement(getTheme(atNoonBrt("2026-11-21")), atNoonBrt("2026-11-21"));
  assert.match(sat, /sábado/);
  assert.match(sat, /JOGOS GRÁTIS/);
  assert.match(sat, /se não tiver jogo novo/);
  const sun = formatThemeAnnouncement(getTheme(atNoonBrt("2026-11-22")), atNoonBrt("2026-11-22"));
  assert.match(sun, /domingo/);
  assert.match(sun, /IA GRÁTIS/);
  assert.match(sun, /se não tiver dica nova/);
});

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
    freebieSources: [],
    freebieMaxPerRun: 3,
    myMemoryEmail: "",
    keywords: [],
    minDiscountPct: 20,
    maxPostsPerRun: 5,
    stores: [],
    dryRun: true,
    ...partial,
  };
}

test("runJob na quarta busca as keywords do tema, não as padrão", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  const shopeeBodies: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: unknown }) => {
    if (url.includes("open-api.affiliate.shopee.com.br")) {
      shopeeBodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }));
    }
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const stats = await runJob(
      config({
        dataDir: dir,
        stores: ["shopee"],
        shopeeAppId: "id",
        shopeeSecret: "secret",
        keywords: ["capacete ciclismo", "garmin"],
      }),
      atNoonBrt("2026-11-18"),
    );
    assert.equal(stats.theme, "Eletrônicos");
    assert.equal(stats.themeAnnouncement, true);
    // 5 keywords do tema de eletrônicos — nenhuma é a padrão.
    assert.equal(shopeeBodies.length, 5);
    assert.ok(shopeeBodies.some((b) => b.includes("fone bluetooth")));
    assert.ok(shopeeBodies.some((b) => b.includes("smartwatch")));
    assert.ok(!shopeeBodies.some((b) => b.includes("capacete ciclismo")));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("runJob no sábado com jogo novo não busca ofertas pagas, só anuncia o tema", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  let shopeeCalls = 0;
  const epicBody = {
    data: {
      Catalog: {
        searchStore: {
          elements: [
            {
              title: "Jogo Teste",
              description: "Um jogo grátis de teste.",
              productSlug: "jogo-teste",
              price: { totalPrice: { fmtPrice: { originalPrice: "R$ 39,99" } } },
              promotions: {
                promotionalOffers: [
                  {
                    promotionalOffers: [
                      {
                        startDate: "2026-01-01T00:00:00.000Z",
                        endDate: "2027-12-31T00:00:00.000Z",
                        discountSetting: { discountPercentage: 0 },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("open-api.affiliate.shopee.com.br")) shopeeCalls += 1;
    if (url.includes("epicgames")) return new Response(JSON.stringify(epicBody));
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const stats = await runJob(
      config({
        dataDir: dir,
        stores: ["shopee"],
        shopeeAppId: "id",
        shopeeSecret: "secret",
        keywords: ["capacete ciclismo"],
        freebieSources: ["epic"],
      }),
      atNoonBrt("2026-11-21"),
    );
    assert.equal(stats.theme, "Jogos grátis");
    assert.equal(stats.themeAnnouncement, true);
    assert.equal(stats.freebiesFound, 1);
    assert.equal(shopeeCalls, 0);
    assert.equal(stats.found, 0);
    assert.equal(stats.posted, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("runJob no sábado sem jogo novo busca ofertas de reserva", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  let shopeeCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("open-api.affiliate.shopee.com.br")) {
      shopeeCalls += 1;
      return new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }));
    }
    if (url.includes("epicgames")) {
      return new Response(JSON.stringify({ data: { Catalog: { searchStore: { elements: [] } } } }));
    }
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const stats = await runJob(
      config({
        dataDir: dir,
        stores: ["shopee"],
        shopeeAppId: "id",
        shopeeSecret: "secret",
        keywords: ["capacete ciclismo"],
        freebieSources: ["epic"],
      }),
      atNoonBrt("2026-11-21"),
    );
    assert.equal(stats.theme, "Jogos grátis");
    assert.equal(stats.freebiesFound, 0);
    // Sem jogo novo: entra a busca de ofertas de reserva (1 keyword padrão).
    assert.equal(shopeeCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("runJob no domingo posta dica de IA e não busca ofertas nem brindes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const stats = await runJob(
      config({
        dataDir: dir,
        stores: ["shopee"],
        shopeeAppId: "id",
        shopeeSecret: "secret",
        freebieSources: ["epic", "gamerpower"],
      }),
      atNoonBrt("2026-11-22"),
    );
    assert.equal(stats.theme, "IA grátis");
    assert.equal(stats.themeAnnouncement, true);
    assert.equal(stats.aiTipsPosted, 1);
    assert.equal(stats.found, 0);
    assert.equal(stats.freebiesFound, 0);
    assert.ok(!calls.some((u) => u.includes("shopee") || u.includes("epicgames") || u.includes("gamerpower")));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("runJob no domingo sem dica nova busca ofertas de reserva", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  // Marca todas as dicas como postadas (janela de 30 dias) antes da execução.
  const { AI_TIPS, aiTipKey } = await import("../src/aitips/tips.ts");
  const posted: Record<string, { at: string; title: string }> = {};
  for (const tip of AI_TIPS) {
    posted[aiTipKey(tip)] = { at: new Date().toISOString(), title: `Dica de IA: ${tip.name}` };
  }
  fs.writeFileSync(path.join(dir, "posted.json"), JSON.stringify({ posted }, null, 2));
  let shopeeCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("open-api.affiliate.shopee.com.br")) {
      shopeeCalls += 1;
      return new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }));
    }
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const stats = await runJob(
      config({
        dataDir: dir,
        stores: ["shopee"],
        shopeeAppId: "id",
        shopeeSecret: "secret",
        keywords: ["capacete ciclismo"],
        freebieSources: ["epic"],
      }),
      atNoonBrt("2026-11-22"),
    );
    assert.equal(stats.theme, "IA grátis");
    assert.equal(stats.aiTipsPosted, 0);
    // Sem dica nova: entra a busca de ofertas de reserva (1 keyword padrão).
    assert.equal(shopeeCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("runJob não posta o mesmo produto duas vezes (dedup por título)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  const offer = (shopId: number, itemId: number) => ({
    itemId,
    shopId,
    productName:
      "1/2/3 Forma De Silicone Para Air Fryer Forno Microondas Fritadeira Assadeira Reutilizável Antiaderente Flexível",
    productLink: `https://shopee.com.br/produto-i.${shopId}.${itemId}`,
    offerLink: `https://shope.ee/${shopId}-${itemId}`,
    imageUrl: "https://cf.shopee.com.br/file/img",
    priceMin: "10.00",
    priceMax: "10.00",
    priceDiscountRate: 50,
    commissionRate: "0.03",
    sellerCommissionRate: "0",
    shopeeCommissionRate: "0.03",
    commission: "0.30",
    sales: 5085,
    ratingStar: "4.8",
    shopName: "Loja Teste",
  });
  let firstCall = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("open-api.affiliate.shopee.com.br")) {
      // O mesmo produto genérico em duas lojas diferentes (chaves distintas).
      const nodes = firstCall ? [offer(111, 1001), offer(222, 2002)] : [];
      firstCall = false;
      return new Response(JSON.stringify({ data: { productOfferV2: { nodes } } }));
    }
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const stats = await runJob(
      config({
        dataDir: dir,
        stores: ["shopee"],
        shopeeAppId: "id",
        shopeeSecret: "secret",
      }),
      atNoonBrt("2026-11-18"),
    );
    assert.equal(stats.found, 2);
    assert.equal(stats.skippedAlreadyPosted, 1);
    assert.equal(stats.posted, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("o anúncio do tema sai uma vez por dia, mesmo com 4 execuções", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-theme-"));
  let telegramCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("api.telegram.org")) {
      telegramCalls += 1;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  try {
    const cfg = config({
      dataDir: dir,
      dryRun: false,
      telegramBotToken: "token",
      telegramChatId: "chat",
      stores: [],
    });
    const first = await runJob(cfg, atNoonBrt("2026-11-18"));
    assert.equal(first.themeAnnouncement, true);
    assert.equal(telegramCalls, 1);
    const second = await runJob(cfg, new Date("2026-11-18T16:00:00-03:00"));
    assert.equal(second.themeAnnouncement, false);
    assert.equal(telegramCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
