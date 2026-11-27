import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("variável numérica vazia usa o padrão (bug do vars do GitHub)", () => {
  // No GitHub Actions, `${{ vars.X }}` sem variável definida chega como
  // string vazia — e Number("") é 0. Foi o que zerou os brindes no run #3.
  withEnv(
    { FREEBIE_MAX_PER_RUN: "", DEAL_MAX_POSTS_PER_RUN: "", DEAL_MIN_DISCOUNT_PCT: "" },
    () => {
      const cfg = loadConfig([]);
      assert.equal(cfg.freebieMaxPerRun, 3);
      assert.equal(cfg.maxPostsPerRun, 5);
      assert.equal(cfg.minDiscountPct, 20);
    },
  );
});

test("variável numérica com valor é respeitada", () => {
  withEnv(
    { FREEBIE_MAX_PER_RUN: "2", DEAL_MAX_POSTS_PER_RUN: "7", DEAL_MIN_DISCOUNT_PCT: "30" },
    () => {
      const cfg = loadConfig([]);
      assert.equal(cfg.freebieMaxPerRun, 2);
      assert.equal(cfg.maxPostsPerRun, 7);
      assert.equal(cfg.minDiscountPct, 30);
    },
  );
});

test("variável numérica inválida usa o padrão", () => {
  withEnv({ FREEBIE_MAX_PER_RUN: "abc" }, () => {
    assert.equal(loadConfig([]).freebieMaxPerRun, 3);
  });
});

test("variáveis de qualidade usam padrão quando vazias e respeitam valores definidos", () => {
  withEnv(
    {
      DEAL_MIN_PRICE: "",
      DEAL_MAX_DISCOUNT_PCT: "",
      DEAL_MIN_RATING: "",
      DEAL_MIN_SALES: "",
    },
    () => {
      const cfg = loadConfig([]);
      assert.equal(cfg.minPrice, 10);
      assert.equal(cfg.maxDiscountPct, 85);
      assert.equal(cfg.minRating, 4);
      assert.equal(cfg.minSales, 10);
    },
  );
  withEnv(
    {
      DEAL_MIN_PRICE: "25",
      DEAL_MAX_DISCOUNT_PCT: "80",
      DEAL_MIN_RATING: "4.5",
      DEAL_MIN_SALES: "50",
    },
    () => {
      const cfg = loadConfig([]);
      assert.equal(cfg.minPrice, 25);
      assert.equal(cfg.maxDiscountPct, 80);
      assert.equal(cfg.minRating, 4.5);
      assert.equal(cfg.minSales, 50);
    },
  );
});

test("DEAL_STORES usa shopee,amazon por padrão e aceita ml explícito", () => {
  withEnv({ DEAL_STORES: "" }, () => {
    assert.deepEqual(loadConfig([]).stores, ["shopee", "amazon"]);
  });
  withEnv({ DEAL_STORES: "ml,shopee,amazon" }, () => {
    assert.deepEqual(loadConfig([]).stores, ["ml", "shopee", "amazon"]);
  });
});
