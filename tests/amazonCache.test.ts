import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AMAZON_CACHE_FILENAME, collectAmazonWithCache } from "../src/amazon/cache.ts";
import type { Deal } from "../src/ml/deals.ts";

function fakeDeal(asin: string, tag: string): Deal {
  return {
    store: "amazon",
    key: `amazon:${asin}`,
    title: `Produto ${asin}`,
    price: 120,
    originalPrice: 160,
    discountPct: 25,
    url: `https://www.amazon.com.br/dp/${asin}?tag=${tag}`,
    imageUrl: null,
    rating: 4.7,
    soldCount: 100,
    commissionRate: null,
  };
}

test("collectAmazonWithCache reutiliza cache no mesmo dia BRT e raspa de novo no dia seguinte", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-amz-cache-"));
  const calls: string[] = [];
  const scrapeFn = async (kw: string, _key: string, tag: string): Promise<Deal[]> => {
    calls.push(kw);
    return [fakeDeal(kw === "fone" ? "B000000001" : "B000000002", tag)];
  };

  try {
    const morning = new Date("2026-11-18T10:07:00-03:00");
    const first = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["fone", "carregador"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: morning,
      scrapeFn,
    });
    assert.equal(first.scraped, 2);
    assert.equal(first.cacheHits, 0);
    assert.equal(first.deals.length, 2);
    assert.ok(fs.existsSync(path.join(dir, AMAZON_CACHE_FILENAME)));

    // Segunda execução no mesmo dia (16h BRT): 0 chamadas ao Firecrawl!
    const afternoon = new Date("2026-11-18T16:07:00-03:00");
    const second = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["Fone", "carregador"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: afternoon,
      scrapeFn,
    });
    assert.equal(second.scraped, 0);
    assert.equal(second.cacheHits, 2);
    assert.equal(calls.length, 2);

    // Dia seguinte (BRT): invalida cache e raspa de novo.
    const nextDay = new Date("2026-11-19T10:07:00-03:00");
    const third = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["fone"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: nextDay,
      scrapeFn,
    });
    assert.equal(third.scraped, 1);
    assert.equal(third.cacheHits, 0);
    assert.equal(calls.length, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("collectAmazonWithCache não grava keyword que falhou, permitindo nova tentativa", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-amz-cache-err-"));
  let failSecond = true;
  const calls: string[] = [];
  const scrapeFn = async (kw: string, _key: string, tag: string): Promise<Deal[]> => {
    calls.push(kw);
    if (kw === "falha" && failSecond) throw new Error("timeout");
    return [fakeDeal(kw === "ok" ? "B000000010" : "B000000020", tag)];
  };

  try {
    const now = new Date("2026-11-18T10:07:00-03:00");
    const first = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["ok", "falha"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now,
      scrapeFn,
    });
    assert.equal(first.scraped, 1);
    assert.equal(first.deals.length, 1);

    // Na próxima execução do mesmo dia: "ok" vem do cache, "falha" tenta de novo.
    failSecond = false;
    const second = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["ok", "falha"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: new Date("2026-11-18T13:07:00-03:00"),
      scrapeFn,
    });
    assert.equal(second.cacheHits, 1);
    assert.equal(second.scraped, 1);
    assert.equal(second.deals.length, 2);
    assert.deepEqual(calls, ["ok", "falha", "falha"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("collectAmazonWithCache invalida cache se o tracking tag mudar", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-amz-cache-tag-"));
  let scrapes = 0;
  const scrapeFn = async (_kw: string, _key: string, tag: string): Promise<Deal[]> => {
    scrapes += 1;
    return [fakeDeal("B000000099", tag)];
  };

  try {
    const now = new Date("2026-11-18T10:07:00-03:00");
    await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["fone"],
      apiKey: "fc-key",
      tag: "tag-a-20",
      now,
      scrapeFn,
    });
    const res = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["fone"],
      apiKey: "fc-key",
      tag: "tag-b-20",
      now,
      scrapeFn,
    });
    assert.equal(scrapes, 2);
    assert.ok(res.deals[0]?.url.includes("tag=tag-b-20"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("collectAmazonWithCache não grava resultado vazio [], permitindo nova tentativa no mesmo dia", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-amz-cache-empty-"));
  let attempt = 0;
  const scrapeFn = async (_kw: string, _key: string, tag: string): Promise<Deal[]> => {
    attempt += 1;
    return attempt === 1 ? [] : [fakeDeal("B000000777", tag)];
  };

  try {
    const first = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["capacete ciclismo"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: new Date("2026-11-18T10:07:00-03:00"),
      scrapeFn,
    });
    assert.equal(first.scraped, 1);
    assert.equal(first.deals.length, 0);

    const second = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["capacete ciclismo"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: new Date("2026-11-18T13:07:00-03:00"),
      scrapeFn,
    });
    assert.equal(second.cacheHits, 0);
    assert.equal(second.scraped, 1);
    assert.equal(second.deals.length, 1);

    // Agora que retornou oferta, a 3ª execução vem do cache.
    const third = await collectAmazonWithCache({
      dataDir: dir,
      keywords: ["capacete ciclismo"],
      apiKey: "fc-key",
      tag: "lin63-20",
      now: new Date("2026-11-18T16:07:00-03:00"),
      scrapeFn,
    });
    assert.equal(third.cacheHits, 1);
    assert.equal(third.scraped, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
