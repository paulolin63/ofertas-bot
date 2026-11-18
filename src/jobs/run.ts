import { loadConfig, type BotConfig } from "../config.ts";
import { getClientCredentialsToken } from "../ml/auth.ts";
import { searchMl } from "../ml/search.ts";
import { mlItemToDeal, pickDeals, type Deal } from "../ml/deals.ts";
import { searchProductOffers } from "../shopee/api.ts";
import { shopeeOfferToDeal } from "../shopee/deals.ts";
import { loadAmazonSeedDeals } from "../amazon/deals.ts";
import {
  collectFreebies,
  formatFreebieMessage,
  type Freebie,
} from "../freebies/freebie.ts";
import { sendMessage, sendPhoto } from "../telegram/client.ts";
import { formatDealMessage } from "../telegram/format.ts";
import { PostedDb } from "../store/db.ts";
import {
  formatThemeAnnouncement,
  getTheme,
  themeAnnouncementKey,
  type DayTheme,
} from "../theme.ts";

export interface RunStats {
  theme: string;
  themeAnnouncement: boolean;
  found: number;
  eligible: number;
  posted: number;
  skippedAlreadyPosted: number;
  freebiesFound: number;
  freebiesPosted: number;
  errors: string[];
}

async function collectMlDeals(config: BotConfig): Promise<Deal[]> {
  if (!config.mlAffiliateTag) {
    console.warn("[ml] ML_AFFILIATE_TAG não configurado — loja ML ignorada.");
    return [];
  }
  // Tentativa B: emitir um token client_credentials e buscar autenticado.
  // Se falhar, segue sem token (a busca pode devolver 403 em datacenter).
  let accessToken: string | undefined;
  if (config.mlClientId && config.mlClientSecret) {
    try {
      accessToken = await getClientCredentialsToken(config.mlClientId, config.mlClientSecret);
      console.log("[ml] token client_credentials emitido.");
    } catch (error) {
      console.error("[ml] token client_credentials falhou:", (error as Error).message);
    }
  } else {
    console.warn("[ml] ML_CLIENT_ID/ML_CLIENT_SECRET não configurados — busca sem autenticação.");
  }
  const deals: Deal[] = [];
  for (const keyword of config.keywords) {
    try {
      const items = await searchMl(keyword, 50, fetch, accessToken);
      for (const item of items) {
        const deal = mlItemToDeal(item, config.mlAffiliateTag, config.mlAffiliateLabel);
        if (deal) deals.push(deal);
      }
    } catch (error) {
      console.error(`[ml] busca "${keyword}" falhou:`, (error as Error).message);
    }
  }
  return deals;
}

async function collectShopeeDeals(config: BotConfig): Promise<Deal[]> {
  if (!config.shopeeAppId || !config.shopeeSecret) {
    console.warn("[shopee] credenciais da API não configuradas — loja Shopee ignorada.");
    return [];
  }
  const deals: Deal[] = [];
  for (const keyword of config.keywords) {
    try {
      const offers = await searchProductOffers({
        appId: config.shopeeAppId,
        secret: config.shopeeSecret,
        keyword,
        sortType: 2, // mais vendidos
        limit: 20,
      });
      for (const offer of offers) deals.push(shopeeOfferToDeal(offer));
    } catch (error) {
      console.error(`[shopee] busca "${keyword}" falhou:`, (error as Error).message);
    }
  }
  return deals;
}

async function collectAmazonDeals(config: BotConfig): Promise<Deal[]> {
  if (!config.amazonAffiliateTag) {
    console.warn("[amazon] AMAZON_AFFILIATE_TAG não configurado — loja Amazon ignorada.");
    return [];
  }
  // Plano B: lista curada em data/amazon-deals.json (sem PA-API).
  const deals = loadAmazonSeedDeals(config.dataDir, config.amazonAffiliateTag);
  console.log(`[amazon] ${deals.length} oferta(s) na lista curada.`);
  return deals;
}

export async function runJob(config: BotConfig, now: Date = new Date()): Promise<RunStats> {
  const theme: DayTheme = getTheme(now);
  // No dia de tema, as palavras-chave do tema substituem DEAL_KEYWORDS.
  const effectiveConfig: BotConfig =
    theme.keywords.length > 0 ? { ...config, keywords: theme.keywords } : config;
  const stats: RunStats = {
    theme: theme.name,
    themeAnnouncement: false,
    found: 0,
    eligible: 0,
    posted: 0,
    skippedAlreadyPosted: 0,
    freebiesFound: 0,
    freebiesPosted: 0,
    errors: [],
  };
  const db = new PostedDb(config.dataDir);
  db.prune();

  // Sábado (só jogos grátis) e domingo (só IA grátis): sem ofertas pagas.
  const found: Deal[] = [];
  if (theme.mode === "deals") {
    if (effectiveConfig.stores.includes("ml")) found.push(...(await collectMlDeals(effectiveConfig)));
    if (effectiveConfig.stores.includes("shopee")) found.push(...(await collectShopeeDeals(effectiveConfig)));
    if (effectiveConfig.stores.includes("amazon")) found.push(...(await collectAmazonDeals(effectiveConfig)));
  }
  stats.found = found.length;

  const fresh = found.filter((d) => {
    if (db.has(d.key)) {
      stats.skippedAlreadyPosted += 1;
      return false;
    }
    return true;
  });
  const picked = pickDeals(fresh, config.minDiscountPct, config.maxPostsPerRun);
  stats.eligible = picked.length;

  // Brindes: a coleta acontece ANTES da checagem do token, para o log
  // mostrar o que foi encontrado mesmo sem token (o post em si continua
  // exigindo o token — sem ele, a execução falha aqui, como esperado).
  // Domingo (só IA grátis): sem jogos — a coleta de brindes é pulada.
  const { freebies, errors: freebieErrors } =
    theme.mode === "free-ai"
      ? { freebies: [] as Freebie[], errors: [] as string[] }
      : await collectFreebies({
          sources: config.freebieSources,
          maxPerRun: config.freebieMaxPerRun,
          myMemoryEmail: config.myMemoryEmail,
        });
  stats.errors.push(...freebieErrors);
  stats.freebiesFound = freebies.length;

  if (!config.dryRun && (!config.telegramBotToken || !config.telegramChatId)) {
    throw new Error("TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID são obrigatórios (ou rode com --dry-run).");
  }

  // Anúncio do tema do dia — só na primeira execução do dia (BRT).
  // A chave é marcada só depois do envio real; em dry-run, não marca.
  const announcementKey = themeAnnouncementKey(now);
  if (!db.has(announcementKey)) {
    const text = formatThemeAnnouncement(theme, now);
    if (config.dryRun) {
      console.log(`--- DRY-RUN [theme] ${announcementKey} ---`);
      console.log(text);
      stats.themeAnnouncement = true;
    } else {
      try {
        await sendMessage(config.telegramBotToken, config.telegramChatId, text);
        db.mark(announcementKey, `Tema do dia: ${theme.name}`);
        stats.themeAnnouncement = true;
        await new Promise((r) => setTimeout(r, 1500));
      } catch (error) {
        const message = `[${announcementKey}] ${(error as Error).message}`;
        console.error(message);
        stats.errors.push(message);
      }
    }
  }

  for (const deal of picked) {
    const text = formatDealMessage(deal);
    if (config.dryRun) {
      console.log(`--- DRY-RUN [${deal.store}] ${deal.key} ---`);
      console.log(text);
      console.log(`URL: ${deal.url}`);
      stats.posted += 1;
      continue;
    }
    try {
      if (deal.imageUrl) {
        await sendPhoto(config.telegramBotToken, config.telegramChatId, deal.imageUrl, text);
      } else {
        await sendMessage(config.telegramBotToken, config.telegramChatId, text);
      }
      db.mark(deal.key, deal.title);
      stats.posted += 1;
      // Intervalo entre posts para não parecer spam.
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      const message = `[${deal.key}] ${(error as Error).message}`;
      console.error(message);
      stats.errors.push(message);
    }
  }

  // Brindes grátis (Epic + GamerPower, em PT-BR) — depois das ofertas.
  await publishFreebies(config, db, stats, freebies);

  db.save();
  return stats;
}

async function publishFreebies(
  config: BotConfig,
  db: PostedDb,
  stats: RunStats,
  freebies: Freebie[],
): Promise<void> {
  const fresh = freebies.filter((f) => {
    if (db.has(f.key)) {
      stats.skippedAlreadyPosted += 1;
      return false;
    }
    return true;
  });

  for (const freebie of fresh) {
    const text = formatFreebieMessage(freebie);
    if (config.dryRun) {
      console.log(`--- DRY-RUN [freebie:${freebie.source}] ${freebie.key} ---`);
      console.log(text);
      console.log(`URL: ${freebie.url}`);
      stats.freebiesPosted += 1;
      continue;
    }
    try {
      if (freebie.imageUrl) {
        await sendPhoto(config.telegramBotToken, config.telegramChatId, freebie.imageUrl, text);
      } else {
        await sendMessage(config.telegramBotToken, config.telegramChatId, text);
      }
      db.mark(freebie.key, freebie.title);
      stats.freebiesPosted += 1;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      const message = `[${freebie.key}] ${(error as Error).message}`;
      console.error(message);
      stats.errors.push(message);
    }
  }

  db.save();
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const config = loadConfig(argv);
  const theme = getTheme();
  // Sábado/domingo não buscam ofertas, então não precisam de keywords.
  if (
    theme.mode === "deals" &&
    theme.keywords.length === 0 &&
    config.keywords.length === 0
  ) {
    throw new Error("Configure DEAL_KEYWORDS (ex.: DEAL_KEYWORDS=capacete ciclismo,air fryer).");
  }
  const stats = await runJob(config);
  console.log(
    JSON.stringify({ dryRun: config.dryRun, ...stats, postedDbSize: new PostedDb(config.dataDir).size }),
  );
}
