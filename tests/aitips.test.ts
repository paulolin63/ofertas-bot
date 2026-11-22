import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_TIPS,
  aiTipKey,
  formatAiTipMessage,
  pickAiTips,
} from "../src/aitips/tips.ts";

test("AI_TIPS tem slugs únicos e URLs https", () => {
  const slugs = new Set(AI_TIPS.map((t) => t.slug));
  assert.equal(slugs.size, AI_TIPS.length);
  for (const tip of AI_TIPS) {
    assert.ok(tip.url.startsWith("https://"), tip.slug);
    assert.ok(tip.description.length > 20, tip.slug);
  }
});

test("pickAiTips pula as já postadas e respeita o máximo", () => {
  const posted = new Set([aiTipKey(AI_TIPS[0]!), aiTipKey(AI_TIPS[1]!)]);
  const picked = pickAiTips((key) => posted.has(key), 2);
  assert.equal(picked.length, 2);
  assert.equal(picked[0]!.slug, AI_TIPS[2]!.slug);
  assert.equal(picked[1]!.slug, AI_TIPS[3]!.slug);
});

test("pickAiTips devolve vazio quando a lista esgotou", () => {
  const all = new Set(AI_TIPS.map(aiTipKey));
  assert.deepEqual(pickAiTips((key) => all.has(key), 1), []);
});

test("formatAiTipMessage traz nome, descrição, link e rodapé", () => {
  const text = formatAiTipMessage(AI_TIPS[0]!);
  assert.match(text, /DICA DE IA GRÁTIS/);
  assert.ok(text.includes(AI_TIPS[0]!.name));
  assert.ok(text.includes(AI_TIPS[0]!.url));
  assert.match(text, /sem link de afiliado/);
});
