/**
 * Calendário semanal de temas do canal Caça Ofertas.
 *
 * Definido com o usuário em 2026-11-17 (e confirmado em 2026-11-18):
 *   segunda 💄 Cosméticos · terça 🚗 Automóveis · quarta 📱 Eletrônicos
 *   quinta 🚴 Esporte e ciclismo · sexta 🏠 Casa e cozinha
 *   sábado 🎮 jogos grátis (ofertas só como reserva, quando não há jogo
 *   novo — decisão de 2026-11-21) · domingo 🤖 IA grátis (dica automática
 *   da lista curada em src/aitips/tips.ts; ofertas só como reserva,
 *   quando a lista esgota — decisão de 2026-11-22)
 *
 * O dia é calculado no fuso America/Sao_Paulo — o runner do GitHub
 * Actions roda em UTC, então `new Date().getDay()` daria o dia errado
 * nas execuções da madrugada/noite.
 */

export type ThemeMode = "deals" | "free-games" | "free-ai";

export interface DayTheme {
  /** 0 = domingo … 6 = sábado (como Date.getDay). */
  day: number;
  name: string;
  emoji: string;
  /** Palavras-chave buscadas nesse dia. Vazio = sem ofertas pagas. */
  keywords: string[];
  mode: ThemeMode;
}

export const WEEK_THEMES: DayTheme[] = [
  { day: 0, name: "IA grátis", emoji: "🤖", keywords: [], mode: "free-ai" },
  {
    day: 1,
    name: "Cosméticos",
    emoji: "💄",
    keywords: ["cosméticos", "maquiagem", "perfume", "skincare", "protetor solar"],
    mode: "deals",
  },
  {
    day: 2,
    name: "Automóveis",
    emoji: "🚗",
    keywords: ["pneu", "óleo motor", "som automotivo", "acessório carro", "capa banco carro"],
    mode: "deals",
  },
  {
    day: 3,
    name: "Eletrônicos",
    emoji: "📱",
    keywords: ["fone bluetooth", "smartwatch", "carregador", "notebook", "tv smart"],
    mode: "deals",
  },
  {
    day: 4,
    name: "Esporte e ciclismo",
    emoji: "🚴",
    keywords: ["capacete ciclismo", "tenis corrida", "garmin", "bicicleta", "suplemento"],
    mode: "deals",
  },
  {
    day: 5,
    name: "Casa e cozinha",
    emoji: "🏠",
    keywords: ["air fryer", "panela", "liquidificador", "aspirador", "organizador"],
    mode: "deals",
  },
  { day: 6, name: "Jogos grátis", emoji: "🎮", keywords: [], mode: "free-games" },
];

function brtDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Dia da semana (0–6) da data no fuso America/Sao_Paulo. */
export function getBrtWeekday(date: Date = new Date()): number {
  const { year, month, day } = brtDateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "YYYY-MM-DD" da data no fuso America/Sao_Paulo. */
export function getBrtDateKey(date: Date = new Date()): string {
  const { year, month, day } = brtDateParts(date);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getTheme(date: Date = new Date()): DayTheme {
  return WEEK_THEMES[getBrtWeekday(date)]!;
}

/** Chave de dedup do anúncio do tema — uma por dia (BRT). */
export function themeAnnouncementKey(date: Date = new Date()): string {
  return `theme:${getBrtDateKey(date)}`;
}

const WEEKDAY_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function formatThemeAnnouncement(theme: DayTheme, date: Date = new Date()): string {
  const weekday = WEEKDAY_PT[getBrtWeekday(date)];
  const head = `🎯 Hoje é ${weekday} — dia de ${theme.name.toUpperCase()}! ${theme.emoji}`;
  if (theme.mode === "free-games") {
    return `${head}\n\nHoje entram jogos grátis (Epic, GamerPower) — e, se não tiver jogo novo, algumas ofertas selecionadas. 🎁`;
  }
  if (theme.mode === "free-ai") {
    return `${head}\n\nHoje entram dicas de ferramentas de IA gratuitas — e, se não tiver dica nova, algumas ofertas selecionadas. ✨`;
  }
  return `${head}\n\nHoje só entram ofertas de ${theme.name.toLowerCase()}. Fica de olho! 👀`;
}
