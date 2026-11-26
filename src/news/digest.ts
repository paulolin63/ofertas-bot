import fs from "node:fs";
import path from "node:path";

export interface NewsFeed {
  name: string;
  url: string;
}

export interface NewsItem {
  source: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: Date | null;
}

export const NEWS_FEEDS: NewsFeed[] = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "GitHub Blog", url: "https://github.blog/feed/" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage" },
];

const HISTORY_PATH = path.join(process.env.DATA_DIR ?? "./data", "news-digest-posted.json");
const ITEM_WINDOW_HOURS = 36;
const ITEMS_PER_SOURCE = 2;
const MAX_ITEMS = 8;
const TELEGRAM_LIMIT = 4096;
const USER_AGENT = "ofertas-bot-ai-news-digest/1.0 (+https://github.com/paulolin63/ofertas-bot)";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripMarkup(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const safeTag = escapeRegExp(tag);
  const match = new RegExp(`<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag}\\s*>`, "i").exec(block);
  return match?.[1]?.trim() ?? "";
}

function extractLink(block: string): string {
  const href = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i.exec(block)?.[1];
  const textLink = extractTag(block, "link");
  const guid = extractTag(block, "guid");
  const candidate = decodeXmlEntities((href || textLink || guid).trim());
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function extractDate(block: string): Date | null {
  const raw = ["pubDate", "published", "updated", "dc:date", "date"]
    .map((tag) => extractTag(block, tag))
    .find(Boolean);
  if (!raw) return null;
  const parsed = new Date(stripMarkup(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractItems(xml: string): string[] {
  return [...xml.matchAll(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map((match) => match[0]);
}

export function parseFeed(xml: string, source: string): NewsItem[] {
  return extractItems(xml)
    .map((block): NewsItem | null => {
      const title = stripMarkup(extractTag(block, "title"));
      const link = extractLink(block);
      const summary = stripMarkup(
        extractTag(block, "description") ||
          extractTag(block, "summary") ||
          extractTag(block, "content:encoded") ||
          extractTag(block, "content"),
      );
      const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category\s*>/gi)]
        .map((match) => stripMarkup(match[1]))
        .filter(Boolean);
      if (
        source === "GitHub Blog" &&
        categories.length > 0 &&
        !categories.some((category) => /ai|machine learning|copilot|developer|open source|security|code|productivity/i.test(category))
      ) {
        return null;
      }
      if (!title || !link) return null;
      return { source, title, link, summary: source === "Hacker News" ? "" : summary, publishedAt: extractDate(block) };
    })
    .filter((item): item is NewsItem => item !== null);
}

export function selectNewItems(
  items: NewsItem[],
  previouslySent: Set<string>,
  now = new Date(),
): NewsItem[] {
  const cutoff = now.getTime() - ITEM_WINDOW_HOURS * 60 * 60 * 1000;
  const bySource = new Map<string, NewsItem[]>();
  for (const item of items) {
    if (previouslySent.has(item.link)) continue;
    if (item.publishedAt && item.publishedAt.getTime() < cutoff) continue;
    const sourceItems = bySource.get(item.source) ?? [];
    sourceItems.push(item);
    bySource.set(item.source, sourceItems);
  }

  const selected: NewsItem[] = [];
  for (const sourceItems of bySource.values()) {
    sourceItems.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
    selected.push(...sourceItems.slice(0, ITEMS_PER_SOURCE));
  }
  return selected
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, MAX_ITEMS);
}

async function fetchFeed(feed: NewsFeed): Promise<NewsItem[]> {
  const response = await fetch(feed.url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
  return parseFeed(await response.text(), feed.name);
}

async function fetchAllFeeds(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(NEWS_FEEDS.map((feed) => fetchFeed(feed)));
  const items: NewsItem[] = [];
  let successfulFeeds = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulFeeds += 1;
      items.push(...result.value);
    } else {
      console.warn(`Fonte indisponível (${NEWS_FEEDS[index].name}); seguindo com as demais.`);
    }
  });
  if (successfulFeeds === 0) throw new Error("Nenhuma fonte RSS respondeu.");
  return items;
}

async function translateToTraditionalChinese(text: string): Promise<string> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 420);
  if (!clean) return "";
  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", clean);
    url.searchParams.set("langpair", "en|zh-TW");
    const email = process.env.MYMEMORY_EMAIL?.trim();
    if (email) url.searchParams.set("de", email);
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return text;
    const data = (await response.json()) as { responseData?: { translatedText?: string } };
    const translated = data.responseData?.translatedText?.trim() ?? "";
    if (!translated || translated.startsWith("MYMEMORY WARNING")) return text;
    return translated;
  } catch {
    return text;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDateInSaoPaulo(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function buildDigest(items: NewsItem[], now = new Date()): Promise<string> {
  const header = `<b>AI／科技每日快訊｜${formatDateInSaoPaulo(now)}</b>`;
  if (items.length === 0) return `${header}\n\n今天追蹤的來源沒有新項目。`;

  const lines = [header, "取自 OpenAI、Hugging Face、TechCrunch AI、GitHub Blog 與 Hacker News 的新文章：", ""];
  for (const [index, item] of items.entries()) {
    const excerpt = item.summary ? ` — ${item.summary.slice(0, 150)}` : "";
    const translated = await translateToTraditionalChinese(`${item.title}${excerpt}`);
    lines.push(`${index + 1}. <b>${escapeHtml(translated)}</b>`);
    lines.push(`<i>${escapeHtml(item.source)}</i> · <a href="${escapeHtml(item.link)}">閱讀原文</a>`);
    lines.push("");
  }
  let message = lines.join("\n").trim();
  if (message.length > TELEGRAM_LIMIT) {
    message = `${header}\n\n${items.slice(0, 5).map((item, index) => `${index + 1}. <a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a> · ${escapeHtml(item.source)}`).join("\n")}`;
  }
  return message.slice(0, TELEGRAM_LIMIT);
}

function readHistory(): { delivered: string[] } {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) as { delivered?: unknown };
    return { delivered: Array.isArray(parsed.delivered) ? parsed.delivered.filter((item): item is string => typeof item === "string") : [] };
  } catch {
    return { delivered: [] };
  }
}

function writeHistory(delivered: string[]): void {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify({ updatedAt: new Date().toISOString(), delivered: delivered.slice(-500) }, null, 2)}\n`);
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !body.ok) throw new Error(`Telegram sendMessage failed: ${body.description ?? response.status}`);
}

async function run(mode: string): Promise<void> {
  if (mode !== "send" && mode !== "preview") throw new Error("Mode must be 'send' or 'preview'.");
  if (mode === "send" && (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_NEWS_CHAT_ID)) {
    console.log("Private digest destination is not configured yet; skipping delivery safely.");
    return;
  }

  const fetched = await fetchAllFeeds();
  const history = readHistory();
  const selected = selectNewItems(fetched, new Set(history.delivered));
  const message = await buildDigest(selected);

  if (mode === "preview") {
    console.log(message.replace(/<\/?(?:b|i)>/g, "").replace(/<a href="([^"]+)">([^<]*)<\/a>/g, "$2 ($1)"));
    return;
  }

  if (selected.length === 0) {
    console.log("No new feed items; sending a brief no-news notice.");
  }
  await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_NEWS_CHAT_ID!, message);
  if (selected.length > 0) writeHistory([...history.delivered, ...selected.map((item) => item.link)]);
  console.log(`Digest delivered; ${selected.length} new item(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "send";
  run(mode).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Digest failed.");
    process.exitCode = 1;
  });
}
