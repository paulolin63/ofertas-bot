import fs from "node:fs";
import path from "node:path";

export interface BotConfig {
  telegramBotToken: string;
  telegramChatId: string;
  mlAffiliateTag: string;
  mlAffiliateLabel: string;
  mlClientId: string;
  mlClientSecret: string;
  /** Refresh token do usuário (Authorization Code + offline_access). */
  mlRefreshToken: string;
  /** Base64-encoded 32-byte key used to encrypt the rotating refresh token at rest. */
  mlRefreshTokenEncryptionKey: string;
  shopeeAppId: string;
  shopeeSecret: string;
  amazonAffiliateTag: string;
  firecrawlApiKey: string;
  freebieSources: Array<"epic" | "gamerpower">;
  freebieMaxPerRun: number;
  myMemoryEmail: string;
  keywords: string[];
  minDiscountPct: number;
  maxDiscountPct?: number;
  minPrice?: number;
  minRating?: number;
  minSales?: number;
  maxPostsPerRun: number;
  stores: Array<"ml" | "shopee" | "amazon">;
  dataDir: string;
  dryRun: boolean;
}

function loadDotEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): { dryRun: boolean; stores?: string; max?: number } {
  const out: { dryRun: boolean; stores?: string; max?: number } = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--stores=")) out.stores = arg.slice("--stores=".length);
    else if (arg.startsWith("--max=")) out.max = Number(arg.slice("--max=".length));
  }
  return out;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): BotConfig {
  loadDotEnv();
  const args = parseArgs(argv);
  const env = process.env;

  const storesRaw = (args.stores ?? env.DEAL_STORES ?? "ml,shopee,amazon")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === "ml" || s === "shopee" || s === "amazon") as Array<
    "ml" | "shopee" | "amazon"
  >;

  const keywordsRaw = (env.DEAL_KEYWORDS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  // Sem DEAL_KEYWORDS, usa a lista padrão (a mesma do .env.example).
  const keywords =
    keywordsRaw.length > 0
      ? keywordsRaw
      : ["capacete ciclismo", "tenis corrida", "garmin", "air fryer", "fone bluetooth"];

  const freebieSourcesRaw = (env.FREEBIE_SOURCES ?? "epic,gamerpower")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === "epic" || s === "gamerpower") as Array<"epic" | "gamerpower">;

  // Variável de ambiente vazia ("") NÃO é null/undefined, então `??`
  // não cai no padrão — e Number("") é 0. No GitHub Actions, um
  // `${{ vars.X }}` sem variável definida chega como string vazia; sem
  // este tratamento, FREEBIE_MAX_PER_RUN="" zerava os brindes (run #3,
  // 2026-11-17: freebiesFound 0 sem erro). Vazio ou inválido → padrão.
  const num = (name: string, fallback: number): number => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (name: string, fallback: string): string => {
    const raw = env[name]?.trim();
    return raw ? raw : fallback;
  };

  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? "",
    telegramChatId: env.TELEGRAM_CHAT_ID ?? "",
    mlAffiliateTag: env.ML_AFFILIATE_TAG ?? "",
    mlAffiliateLabel: str("ML_AFFILIATE_LABEL", "ofertas-bot"),
    mlClientId: env.ML_CLIENT_ID ?? "",
    mlClientSecret: env.ML_CLIENT_SECRET ?? "",
    mlRefreshToken: env.ML_REFRESH_TOKEN ?? "",
    mlRefreshTokenEncryptionKey: env.ML_REFRESH_TOKEN_ENCRYPTION_KEY ?? "",
    shopeeAppId: env.SHOPEE_API_APP_ID ?? "",
    shopeeSecret: env.SHOPEE_API_SECRET ?? "",
    amazonAffiliateTag: env.AMAZON_AFFILIATE_TAG ?? "",
    firecrawlApiKey: env.FIRECRAWL_API_KEY ?? "",
    freebieSources: freebieSourcesRaw.length > 0 ? freebieSourcesRaw : ["epic", "gamerpower"],
    freebieMaxPerRun: num("FREEBIE_MAX_PER_RUN", 3),
    myMemoryEmail: env.MYMEMORY_EMAIL ?? "",
    keywords,
    minDiscountPct: num("DEAL_MIN_DISCOUNT_PCT", 20),
    maxDiscountPct: num("DEAL_MAX_DISCOUNT_PCT", 85),
    minPrice: num("DEAL_MIN_PRICE", 10),
    minRating: num("DEAL_MIN_RATING", 4),
    minSales: num("DEAL_MIN_SALES", 10),
    maxPostsPerRun:
      args.max !== undefined && Number.isFinite(args.max)
        ? args.max
        : num("DEAL_MAX_POSTS_PER_RUN", 5),
    stores: storesRaw.length > 0 ? storesRaw : ["ml", "shopee", "amazon"],
    dataDir: str("DATA_DIR", "./data"),
    dryRun: args.dryRun,
  };
}

export function formatBrl(value: number): string {
  // Node ICU põe um non-breaking space depois de "R$" — normaliza para espaço comum.
  return value
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}
