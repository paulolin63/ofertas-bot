import { formatBrl } from "../config.ts";
import type { Deal } from "../ml/deals.ts";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const STORE_LABEL: Record<Deal["store"], string> = {
  ml: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
};

/**
 * Legenda do post. O Telegram limita a legenda de foto a 1024 caracteres,
 * por isso o título é cortado e os extras são opcionais.
 */
export function formatDealMessage(deal: Deal): string {
  const lines: string[] = [];
  const title = truncate(deal.title, 120);
  lines.push(`🔥 <b>${deal.discountPct}% OFF</b> — ${escapeHtml(title)}`);
  lines.push("");
  if (deal.originalPrice && deal.originalPrice > deal.price) {
    lines.push(`💰 De <s>${formatBrl(deal.originalPrice)}</s> por <b>${formatBrl(deal.price)}</b>`);
  } else {
    lines.push(`💰 <b>${formatBrl(deal.price)}</b>`);
  }
  const extras: string[] = [];
  if (deal.rating) extras.push(`⭐ ${deal.rating}`);
  if (deal.soldCount !== null && deal.soldCount > 0) {
    extras.push(`🛒 ${deal.soldCount.toLocaleString("pt-BR")} vendidos`);
  }
  if (extras.length > 0) lines.push(extras.join(" · "));
  lines.push(`🏬 ${STORE_LABEL[deal.store]}`);
  lines.push("");
  lines.push(`👉 <a href="${escapeHtml(deal.url)}">Ver oferta</a>`);
  lines.push(`📌 Link de afiliado — você paga o mesmo preço.`);
  const text = lines.join("\n");
  return text.length > 1024 ? `${text.slice(0, 1021)}…` : text;
}
