import fs from "node:fs";
import path from "node:path";

export interface BotConfig {
  telegramBotToken: string;
  telegramChatId: string;
  mlAffiliateTag: string;
  mlAffiliateLabel: string;
  mlClientId: string;
  mlClientSecret: string;
  shopeeAppId: string;
  shopeeSecret: string;
  keywords: string[];
  minDiscountPct: number;
  maxPostsPerRun: number;
  stores: Array<"ml" | "shopee">;
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

  const storesRaw = (args.stores ?? env.DEAL_STORES ?? "ml,shopee")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === "ml" || s === "shopee") as Array<"ml" | "shopee">;

  const keywordsRaw = (env.DEAL_KEYWORDS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  // Sem DEAL_KEYWORDS, usa a lista padrão (a mesma do .env.example).
  const keywords =
    keywordsRaw.length > 0
      ? keywordsRaw
      : ["capacete ciclismo", "tenis corrida", "garmin", "air fryer", "fone bluetooth"];

  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? "",
    telegramChatId: env.TELEGRAM_CHAT_ID ?? "",
    mlAffiliateTag: env.ML_AFFILIATE_TAG ?? "",
    mlAffiliateLabel: env.ML_AFFILIATE_LABEL ?? "ofertas-bot",
    mlClientId: env.ML_CLIENT_ID ?? "",
    mlClientSecret: env.ML_CLIENT_SECRET ?? "",
    shopeeAppId: env.SHOPEE_API_APP_ID ?? "",
    shopeeSecret: env.SHOPEE_API_SECRET ?? "",
    keywords,
    minDiscountPct: Number(env.DEAL_MIN_DISCOUNT_PCT ?? 20),
    maxPostsPerRun: args.max ?? Number(env.DEAL_MAX_POSTS_PER_RUN ?? 5),
    stores: storesRaw.length > 0 ? storesRaw : ["ml", "shopee"],
    dataDir: env.DATA_DIR ?? "./data",
    dryRun: args.dryRun,
  };
}

export function formatBrl(value: number): string {
  // Node ICU põe um non-breaking space depois de "R$" — normaliza para espaço comum.
  return value
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/ /g, " ");
}
