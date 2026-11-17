import { fetchEpicFreeGames, type EpicGame } from "./epic.ts";
import {
  fetchGamerPowerGiveaways,
  type GamerPowerGiveaway,
} from "./gamerpower.ts";
import { translateEnToPtBr } from "./translate.ts";

export interface Freebie {
  source: "epic" | "gamerpower";
  key: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  worth: string | null;
  endDate: string | null;
}

export interface FreebieConfig {
  sources: Array<"epic" | "gamerpower">;
  maxPerRun: number;
  myMemoryEmail: string;
}

function normalizeSpace(text: string): string {
  return text.replace(/ /g, " ");
}

function formatEndDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  // Corta na fronteira da palavra quando der, para não partir palavra no meio.
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed}…`;
}

/**
 * Legenda do post de brinde. Igual ao limite de 1024 caracteres da
 * legenda de foto do Telegram. Brinde não tem link de afiliado — o
 * rodapé deixa isso claro para não confundir com as ofertas.
 */
export function formatFreebieMessage(f: Freebie): string {
  const lines: string[] = [];
  lines.push(`🎁 <b>GRÁTIS</b> — ${truncate(f.title, 120)}`);
  if (f.description) {
    lines.push("");
    lines.push(truncate(f.description, 200));
  }
  lines.push("");
  if (f.worth) {
    lines.push(`💰 De <s>${normalizeSpace(f.worth)}</s> por <b>GRÁTIS</b>`);
  } else {
    lines.push(`💰 <b>GRÁTIS</b>`);
  }
  const end = formatEndDate(f.endDate);
  if (end) lines.push(`⏰ Até ${end}`);
  lines.push(`🏬 ${f.source === "epic" ? "Epic Games" : "GamerPower"}`);
  lines.push("");
  lines.push(`👉 <a href="${f.url}">Pegar grátis</a>`);
  lines.push(`📌 Gratuito — sem link de afiliado.`);
  const text = lines.join("\n");
  return text.length > 1024 ? `${text.slice(0, 1021)}…` : text;
}

function epicToFreebie(g: EpicGame): Freebie {
  return {
    source: "epic",
    key: `freebie:epic:${g.url}`,
    title: g.title,
    description: g.description,
    url: g.url,
    imageUrl: g.imageUrl,
    worth: g.originalPrice,
    endDate: g.endDate,
  };
}

async function gamerpowerToFreebie(
  item: GamerPowerGiveaway,
  fetchFn: typeof fetch,
  myMemoryEmail: string,
): Promise<Freebie> {
  const title = await translateEnToPtBr(item.title, fetchFn, myMemoryEmail || undefined);
  const description = item.description
    ? await translateEnToPtBr(item.description, fetchFn, myMemoryEmail || undefined)
    : "";
  return {
    source: "gamerpower",
    key: `freebie:gp:${item.id}`,
    title,
    description,
    url: item.openGiveawayUrl ?? item.gamerpowerUrl ?? "",
    imageUrl: item.image ?? item.thumbnail,
    worth: item.worth,
    endDate: item.endDate,
  };
}

export async function collectFreebies(
  cfg: FreebieConfig,
  fetchFn: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<{ freebies: Freebie[]; errors: string[] }> {
  const freebies: Freebie[] = [];
  const errors: string[] = [];

  if (cfg.sources.includes("epic")) {
    try {
      const games = await fetchEpicFreeGames(fetchFn, now);
      for (const game of games) freebies.push(epicToFreebie(game));
    } catch (error) {
      errors.push(`[epic] ${(error as Error).message}`);
    }
  }

  if (cfg.sources.includes("gamerpower")) {
    try {
      const items = await fetchGamerPowerGiveaways(fetchFn);
      for (const item of items.slice(0, 10)) {
        try {
          freebies.push(await gamerpowerToFreebie(item, fetchFn, cfg.myMemoryEmail));
        } catch (error) {
          // Sem tradução não posta: tenta de novo na próxima execução.
          errors.push(`[gamerpower:${item.id}] ${(error as Error).message}`);
        }
      }
    } catch (error) {
      errors.push(`[gamerpower] ${(error as Error).message}`);
    }
  }

  return { freebies: freebies.slice(0, cfg.maxPerRun), errors };
}
