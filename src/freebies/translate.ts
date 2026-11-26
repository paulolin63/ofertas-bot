/**
 * Tradução EN → PT-BR via MyMemory (gratuita, sem cadastro obrigatório).
 *
 * - Sem e-mail: cota anônima (~5 mil caracteres/dia por IP — instável em
 *   datacenter, onde o IP é compartilhado). Com `de` (qualquer e-mail
 *   válido, conforme a spec do MyMemory): 50 mil caracteres/dia.
 *   (`key` é apenas para chaves privadas de TM geradas no keygen.)
 * - O gtx do Google Tradutor é bloqueado a partir de datacenter
 *   (página "Sorry..."), e o demo do LibreTranslate é instável — por
 *   isso o MyMemory é o tradutor do bot.
 * - Se a tradução falhar (cota, rede, HTTP), lança exceção: o item não
 *   é postado nessa execução e tenta de novo na próxima.
 */
import { withTimeout } from "../http.ts";

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

export async function translateEnToPtBr(
  text: string,
  fetchFn: typeof fetch = fetch,
  email?: string,
): Promise<string> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const params = new URLSearchParams({
    q: clean,
    langpair: "en|pt-BR",
  });
  if (email?.trim()) params.set("de", email.trim());
  const res = await fetchFn(
    `${MYMEMORY_URL}?${params.toString()}`,
    withTimeout({
      headers: { "User-Agent": "ofertas-bot/0.1 (+https://github.com/paulolin63/ofertas-bot)" },
    }),
  );
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  };
  const translated = data.responseData?.translatedText ?? "";
  if (!translated || translated.startsWith("MYMEMORY WARNING")) {
    throw new Error("MyMemory sem cota ou indisponível no momento.");
  }
  return translated;
}
