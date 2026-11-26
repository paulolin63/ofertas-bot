/**
 * Publicação semi-automática de uma oferta do Mercado Livre no Telegram.
 *
 * Como a busca da API do ML retorna 403 em IPs de datacenter e a página de
 * busca aciona reCAPTCHA no Firecrawl, este script permite publicar ofertas
 * escolhidas manualmente (via GitHub Actions workflow_dispatch em
 * `.github/workflows/post-ml-deal.yml` ou localmente), gerando o link de
 * afiliado, validando deduplicação em `data/posted.json` e formatando o post
 * com o mesmo padrão das ofertas automáticas.
 */

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.ts";
import { buildAffiliateUrl } from "./affiliate.ts";
import { discountPct, type Deal } from "./deals.ts";
import { PostedDb } from "../store/db.ts";
import { isSimilarTitle } from "../store/titleKey.ts";
import { sendMessage, sendPhoto } from "../telegram/client.ts";
import { formatDealMessage } from "../telegram/format.ts";

const ML_HOSTS = [
  "mercadolivre.com.br",
  "mercadolivre.com",
  "mercadolibre.com.br",
  "mercadolibre.com",
];

export interface ManualMlDealInput {
  url: string;
  title: string;
  price: string | number;
  originalPrice?: string | number | null;
  imageUrl?: string | null;
  affiliateTag: string;
  affiliateLabel?: string;
}

export interface PostManualMlDealOptions extends ManualMlDealInput {
  telegramBotToken: string;
  telegramChatId: string;
  dataDir: string;
  force?: boolean;
  dryRun?: boolean;
  fetchFn?: typeof fetch;
}

export interface PostManualMlDealResult {
  posted: boolean;
  dryRun: boolean;
  skippedDuplicate: boolean;
  deal: Deal;
  message: string;
}

/** Interpreta preço em formato BR ("1.299,90", "R$ 199,90") ou US ("199.90"). */
export function parseBrlPrice(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (!raw) return null;
  const cleaned = raw.replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isMercadoLivreUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return ML_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function extractMlItemId(rawUrl: string): string {
  const match = /MLB-?(\d{6,})/i.exec(rawUrl);
  if (match) return `MLB${match[1]}`;
  const hash = crypto.createHash("sha256").update(rawUrl.trim()).digest("hex").slice(0, 12);
  return `url-${hash}`;
}

function isShortAffiliateLink(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      (parsed.hostname.toLowerCase() === "mercadolivre.com" ||
        parsed.hostname.toLowerCase() === "www.mercadolivre.com") &&
      parsed.pathname.startsWith("/sec/")
    );
  } catch {
    return false;
  }
}

function validateOptionalImageUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`URL de imagem inválida: ${trimmed}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL de imagem precisa ser http(s): ${trimmed}`);
  }
  return parsed.toString();
}

export function buildManualMlDeal(input: ManualMlDealInput): Deal {
  const rawUrl = input.url.trim();
  if (!isMercadoLivreUrl(rawUrl)) {
    throw new Error(`URL fora do Mercado Livre: ${rawUrl}`);
  }
  const title = input.title.trim();
  if (!title) {
    throw new Error("Título do produto é obrigatório.");
  }
  const price = parseBrlPrice(input.price);
  if (price === null) {
    throw new Error(`Preço inválido: ${String(input.price)}`);
  }
  const parsedOriginal = parseBrlPrice(input.originalPrice);
  const originalPrice = parsedOriginal !== null && parsedOriginal > price ? parsedOriginal : null;

  let affiliateUrl: string;
  if (isShortAffiliateLink(rawUrl)) {
    affiliateUrl = rawUrl;
  } else {
    if (!input.affiliateTag.trim()) {
      throw new Error("ML_AFFILIATE_TAG é obrigatório para gerar link de afiliado do ML.");
    }
    affiliateUrl = buildAffiliateUrl(rawUrl, {
      tag: input.affiliateTag.trim(),
      label: input.affiliateLabel?.trim() || undefined,
    });
  }

  const itemId = extractMlItemId(rawUrl);
  return {
    store: "ml",
    key: `ml:${itemId}`,
    title,
    price,
    originalPrice,
    discountPct: discountPct(price, originalPrice),
    ...(originalPrice === null ? { discountUnknown: true } : {}),
    url: affiliateUrl,
    imageUrl: validateOptionalImageUrl(input.imageUrl),
    rating: null,
    soldCount: null,
    commissionRate: null,
  };
}

export async function postManualMlDeal(
  opts: PostManualMlDealOptions,
): Promise<PostManualMlDealResult> {
  const deal = buildManualMlDeal(opts);
  const message = formatDealMessage(deal);
  const db = new PostedDb(opts.dataDir);
  db.prune();

  const isDuplicate =
    db.has(deal.key) || db.postedDealTitles().some((t) => isSimilarTitle(t, deal.title));
  if (isDuplicate && !opts.force) {
    console.log(`[ml-manual] oferta já postada (${deal.key}) — ignorada (use force=true para repostar).`);
    return { posted: false, dryRun: Boolean(opts.dryRun), skippedDuplicate: true, deal, message };
  }

  if (opts.dryRun) {
    console.log(`--- DRY-RUN [ml-manual] ${deal.key} ---`);
    console.log(message);
    console.log(`URL: ${deal.url}`);
    return { posted: false, dryRun: true, skippedDuplicate: false, deal, message };
  }

  if (!opts.telegramBotToken || !opts.telegramChatId) {
    throw new Error("TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID são obrigatórios (ou rode com dry_run=true).");
  }

  const fetchFn = opts.fetchFn ?? fetch;
  if (deal.imageUrl) {
    await sendPhoto(opts.telegramBotToken, opts.telegramChatId, deal.imageUrl, message, fetchFn);
  } else {
    await sendMessage(opts.telegramBotToken, opts.telegramChatId, message, fetchFn);
  }
  db.mark(deal.key, deal.title);
  db.save();

  console.log(`[ml-manual] oferta postada: ${deal.key}`);
  return { posted: true, dryRun: false, skippedDuplicate: false, deal, message };
}

async function main(): Promise<void> {
  const cfg = loadConfig(process.argv.slice(2));
  const env = process.env;
  const dryRun = cfg.dryRun || env.ML_DEAL_DRY_RUN === "true";
  const force = process.argv.includes("--force") || env.ML_DEAL_FORCE === "true";

  const result = await postManualMlDeal({
    url: env.ML_DEAL_URL ?? "",
    title: env.ML_DEAL_TITLE ?? "",
    price: env.ML_DEAL_PRICE ?? "",
    originalPrice: env.ML_DEAL_ORIGINAL_PRICE ?? "",
    imageUrl: env.ML_DEAL_IMAGE_URL ?? "",
    affiliateTag: cfg.mlAffiliateTag,
    affiliateLabel: cfg.mlAffiliateLabel,
    telegramBotToken: cfg.telegramBotToken,
    telegramChatId: cfg.telegramChatId,
    dataDir: cfg.dataDir,
    force,
    dryRun,
  });

  console.log(
    JSON.stringify({
      key: result.deal.key,
      posted: result.posted,
      dryRun: result.dryRun,
      skippedDuplicate: result.skippedDuplicate,
      discountPct: result.deal.discountPct,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
