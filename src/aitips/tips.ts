/**
 * Dicas de ferramentas de IA gratuitas para o domingo (tema "IA grátis").
 *
 * Lista curada a partir do catálogo verificado de recursos gratuitos do
 * usuário (dashboard "免費資源 Dashboard", varredura de 2026-11-21) —
 * só ferramentas com plano gratuito real, utilizáveis pelo público geral.
 * A rotação usa a mesma dedup de 30 dias do PostedDb (chave
 * `aitip:<slug>`): quando a lista esgota dentro da janela, o domingo
 * volta a postar ofertas como reserva (decisão do usuário em 2026-11-22).
 */

export interface AiTip {
  slug: string;
  name: string;
  description: string;
  url: string;
}

export const AI_TIPS: AiTip[] = [
  {
    slug: "google-ai-studio",
    name: "Google AI Studio (Gemini)",
    description:
      "Converse com o Gemini de graça, direto no navegador: escreva textos, resuma documentos, gere ideias e tire dúvidas. Sem cartão de crédito.",
    url: "https://aistudio.google.com",
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    description:
      "Buscador com IA que responde com fontes: pergunte qualquer coisa e receba a resposta resumida, com os links de onde veio. Plano gratuito sem cartão.",
    url: "https://www.perplexity.ai",
  },
  {
    slug: "notebooklm",
    name: "NotebookLM (Google)",
    description:
      "Envie PDFs e links e a IA resume o material, responde perguntas sobre ele e até gera um podcast da conversa. Grátis.",
    url: "https://notebooklm.google.com",
  },
  {
    slug: "elevenlabs",
    name: "ElevenLabs",
    description:
      "Transforme texto em voz realista, inclusive em português: 10 mil créditos grátis por mês, ótimo para vídeos e narrações.",
    url: "https://elevenlabs.io",
  },
  {
    slug: "huggingface-spaces",
    name: "Hugging Face Spaces",
    description:
      "Milhares de demos de IA gratuitos no navegador: gerar imagens, remover fundo de foto, transcrever áudio e muito mais, sem instalar nada.",
    url: "https://huggingface.co/spaces",
  },
  {
    slug: "groq",
    name: "Groq",
    description:
      "Chat com modelos de IA abertos em velocidade absurda (resposta quase instantânea), com plano gratuito generoso.",
    url: "https://groq.com",
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    description:
      "Um cadastro só para testar mais de 25 modelos de IA gratuitos (DeepSeek, Qwen, Llama e outros) no mesmo lugar.",
    url: "https://openrouter.ai",
  },
  {
    slug: "fish-audio",
    name: "Fish Audio",
    description:
      "Gere e clone vozes com IA: créditos gratuitos todo mês para narrações e dublagens.",
    url: "https://fish.audio",
  },
  {
    slug: "ttsmaker",
    name: "TTSMaker",
    description:
      "Texto para voz online e grátis, com vozes em português: cole o texto, gere o MP3 e baixe.",
    url: "https://ttsmaker.com",
  },
  {
    slug: "google-colab",
    name: "Google Colab",
    description:
      "GPU gratuita no navegador para rodar notebooks e testar modelos de IA sem precisar de placa de vídeo.",
    url: "https://colab.research.google.com",
  },
  {
    slug: "z-ai",
    name: "Z.AI (GLM)",
    description:
      "Chat gratuito com o modelo GLM, contexto de 200 mil tokens: bom para textos longos e para código.",
    url: "https://chat.z.ai",
  },
];

export function aiTipKey(tip: AiTip): string {
  return `aitip:${tip.slug}`;
}

/** Próximas dicas ainda não postadas (dentro da janela de dedup). */
export function pickAiTips(has: (key: string) => boolean, max: number): AiTip[] {
  return AI_TIPS.filter((tip) => !has(aiTipKey(tip))).slice(0, max);
}

export function formatAiTipMessage(tip: AiTip): string {
  return [
    `🤖 DICA DE IA GRÁTIS — ${tip.name}`,
    "",
    tip.description,
    "",
    `👉 ${tip.url}`,
    "",
    "📌 Ferramenta gratuita — sem link de afiliado.",
  ].join("\n");
}
