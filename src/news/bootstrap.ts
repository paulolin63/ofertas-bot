const API = "https://api.telegram.org";
const USER_AGENT = "ofertas-bot-ai-news-digest-setup/1.0";

interface ApiResponse<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.status}`);
  }
  return payload.result;
}

function tokenFromEnv(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured in repository Actions secrets.");
  return token;
}

async function identify(): Promise<void> {
  const token = tokenFromEnv();
  const me = await call<{ username?: string; first_name?: string }>(token, "getMe");
  const webhook = await call<{ url?: string }>(token, "getWebhookInfo");
  if (!me.username) throw new Error("Telegram returned no bot username.");
  console.log(`Existing Telegram bot: @${me.username}`);
  console.log(`Webhook configured: ${webhook.url ? "yes" : "no"}`);
  if (webhook.url) console.log("Private-chat setup via getUpdates is unavailable while a webhook is active.");
}

async function sendChatIdToPrivateUser(): Promise<void> {
  const token = tokenFromEnv();
  const webhook = await call<{ url?: string }>(token, "getWebhookInfo");
  if (webhook.url) {
    throw new Error("The bot has an active webhook, so Telegram getUpdates cannot be used for setup.");
  }

  const updates = await call<Array<{
    update_id: number;
    message?: {
      text?: string;
      chat?: { id?: number | string; type?: string };
    };
  }>>(token, "getUpdates", { limit: 100, allowed_updates: ["message"] });

  const matching = updates.filter((update) => {
    const message = update.message;
    return Boolean(
      message?.chat?.type === "private" &&
        message.chat.id !== undefined &&
        /^\/start(?:@[A-Za-z0-9_]+)?\s+digestsetup(?:\s|$)/i.test(message.text ?? ""),
    );
  });

  if (matching.length === 0) {
    console.log("No matching private setup message was found. Open the bot and send: /start digestsetup");
    return;
  }

  for (const update of matching) {
    const chatId = update.message!.chat!.id!;
    await call(token, "sendMessage", {
      chat_id: chatId,
      text: `你的 Telegram 私聊 chat ID 是：${chatId}\n\n請把這個數字存成 GitHub repository secret：TELEGRAM_NEWS_CHAT_ID。位置：Settings → Secrets and variables → Actions → New repository secret。這個 ID 不會出現在 Actions 執行紀錄。`,
      disable_web_page_preview: true,
    });
  }
  console.log(`Sent the private chat ID to ${matching.length} matching private chat(s); no chat IDs or message text were written to the Actions log.`);
}

const mode = process.argv[2] ?? "identify";
const operation = mode === "capture" ? sendChatIdToPrivateUser : mode === "identify" ? identify : null;
if (!operation) {
  console.error("Mode must be 'identify' or 'capture'.");
  process.exitCode = 1;
} else {
  operation().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Telegram setup failed.");
    process.exitCode = 1;
  });
}
