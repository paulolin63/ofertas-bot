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
