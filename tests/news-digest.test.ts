import assert from "node:assert/strict";
import test from "node:test";
import { parseFeed, selectNewItems } from "../src/news/digest.ts";

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
