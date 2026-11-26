import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../src/http.ts";
import { getClientCredentialsToken } from "../src/ml/auth.ts";
import { searchMl } from "../src/ml/search.ts";
import { generateShortLink, searchProductOffers } from "../src/shopee/api.ts";
import { scrapeAmazonSearch } from "../src/amazon/firecrawl.ts";
import { fetchEpicFreeGames } from "../src/freebies/epic.ts";
import { fetchGamerPowerGiveaways } from "../src/freebies/gamerpower.ts";
import { sendMessage } from "../src/telegram/client.ts";

test("withTimeout anexa AbortSignal por padrão e preserva signal existente", () => {
  const auto = withTimeout({ method: "GET" }, 5_000);
  assert.ok(auto.signal instanceof AbortSignal);

  const custom = new AbortController().signal;
  const preserved = withTimeout({ signal: custom }, 5_000);
  assert.equal(preserved.signal, custom);
});

test("todas as chamadas HTTP externas passam AbortSignal de timeout", async () => {
  const signals: Array<AbortSignal | null | undefined> = [];
  const makeStub = (body: unknown): typeof fetch =>
    (async (_url: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

  await getClientCredentialsToken("id", "sec", makeStub({ access_token: "tok" }));
  await searchMl("fone", 10, makeStub({ results: [] }));
  await searchProductOffers(
    { appId: "1", secret: "s", keyword: "fone" },
    makeStub({ data: { productOfferV2: { nodes: [] } } }),
  );
  await generateShortLink(
    { appId: "1", secret: "s", originUrl: "https://shopee.com.br/x" },
    makeStub({ data: { generateShortLink: { shortLink: "https://shope.ee/x" } } }),
  );
  await scrapeAmazonSearch(
    "fone",
    "fc-key",
    "lin63-20",
    makeStub({ success: true, data: { markdown: "# vazio" } }),
  );
  await fetchEpicFreeGames(makeStub({ data: { Catalog: { searchStore: { elements: [] } } } }));
  await fetchGamerPowerGiveaways(makeStub([]));
  await sendMessage("tok", "@canal", "teste", makeStub({ ok: true }));

  assert.equal(signals.length, 8);
  for (const [index, sig] of signals.entries()) {
    assert.ok(sig instanceof AbortSignal, `fetch #${index + 1} precisa receber AbortSignal de timeout`);
  }
});
