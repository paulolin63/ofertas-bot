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
