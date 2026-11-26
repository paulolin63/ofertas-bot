/**
 * Utilitários HTTP compartilhados (timeouts padrão para chamadas fetch).
 *
 * Sem AbortSignal.timeout, qualquer upstream travado (Shopee, ML, Firecrawl,
 * MyMemory, Telegram) pode segurar o runner do GitHub Actions por horas.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const TELEGRAM_FETCH_TIMEOUT_MS = 20_000;
export const FIRECRAWL_FETCH_TIMEOUT_MS = 30_000;

export function withTimeout(
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): RequestInit {
  if (init.signal) return init;
  return { ...init, signal: AbortSignal.timeout(timeoutMs) };
}
