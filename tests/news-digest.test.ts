import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest, parseFeed, selectNewItems } from "../src/news/digest.ts";

const sampleFeed = `<?xml version="1.0"?>
<rss><channel><item>
  <title><![CDATA[Open-source AI model &amp; tools]]></title>
  <link>https://example.com/story?ref=rss&amp;x=1</link>
  <description><![CDATA[<p>A useful <b>technology</b> update.</p>]]></description>
  <pubDate>Tue, 25 Nov 2026 10:00:00 GMT</pubDate>
</item><item>
  <title>Another story</title>
  <link>javascript:alert(1)</link>
  <pubDate>Tue, 25 Nov 2026 09:00:00 GMT</pubDate>
</item></channel></rss>`;

test("parseFeed reads RSS content, decodes entities, and rejects non-http links", () => {
  const items = parseFeed(sampleFeed, "Test Feed");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Open-source AI model & tools");
  assert.equal(items[0].link, "https://example.com/story?ref=rss&x=1");
  assert.equal(items[0].summary, "A useful technology update.");
  assert.equal(items[0].source, "Test Feed");
  assert.equal(items[0].publishedAt?.toISOString(), "2026-11-25T10:00:00.000Z");
});

test("selectNewItems filters old and previously sent stories and caps items per source", () => {
  const now = new Date("2026-11-25T12:00:00.000Z");
  const recent = (source: string, id: number, hoursAgo: number) => ({
    source,
    title: `Story ${id}`,
    link: `https://example.com/${source}/${id}`,
    summary: "",
    publishedAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
  });
  const selected = selectNewItems(
    [
      recent("A", 1, 1),
      recent("A", 2, 2),
      recent("A", 3, 3),
      recent("B", 4, 4),
      recent("Old", 5, 40),
      recent("Sent", 6, 1),
    ],
    new Set(["https://example.com/Sent/6"]),
    now,
  );
  assert.deepEqual(selected.map((item) => item.link), [
    "https://example.com/A/1",
    "https://example.com/A/2",
    "https://example.com/B/4",
  ]);
});

test("buildDigest envia MYMEMORY_EMAIL no parâmetro de (não key)", async () => {
  const prevEmail = process.env.MYMEMORY_EMAIL;
  const realFetch = globalThis.fetch;
  let seenUrl = "";
  process.env.MYMEMORY_EMAIL = "digest@example.com";
  globalThis.fetch = (async (url: string | URL | Request) => {
    seenUrl = String(url);
    return new Response(JSON.stringify({ responseData: { translatedText: "翻譯測試" } }));
  }) as unknown as typeof fetch;
  try {
    const out = await buildDigest(
      [
        {
          source: "OpenAI News",
          title: "Test headline",
          link: "https://example.com/1",
          summary: "",
          publishedAt: new Date("2026-11-25T10:00:00.000Z"),
        },
      ],
      new Date("2026-11-25T12:00:00.000Z"),
    );
    assert.ok(out.includes("翻譯測試"));
    const parsed = new URL(seenUrl);
    assert.equal(parsed.searchParams.get("de"), "digest@example.com");
    assert.equal(parsed.searchParams.get("key"), null);
  } finally {
    globalThis.fetch = realFetch;
    if (prevEmail === undefined) delete process.env.MYMEMORY_EMAIL;
    else process.env.MYMEMORY_EMAIL = prevEmail;
  }
});
