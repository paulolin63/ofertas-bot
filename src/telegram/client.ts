/**
 * Telegram Bot API — envio para o canal/grupo.
 * O bot precisa ser administrador do canal. Sem dependências externas.
 */

const API = "https://api.telegram.org";

export interface TelegramResult {
  ok: boolean;
  description?: string;
}

async function callBotApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramResult> {
  const res = await fetchFn(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TelegramResult;
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram ${method} falhou: ${json.description ?? res.status}`);
  }
  return json;
}

/** Foto + legenda numa só mensagem (limite da legenda: 1024 caracteres). */
export async function sendPhoto(
  token: string,
  chatId: string,
  photoUrl: string,
  caption: string,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramResult> {
  return callBotApi(
    token,
    "sendPhoto",
    { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" },
    fetchFn,
  );
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramResult> {
  return callBotApi(
    token,
    "sendMessage",
    { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false },
    fetchFn,
  );
}
