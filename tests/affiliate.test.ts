import test from "node:test";
import assert from "node:assert/strict";
import { buildAffiliateUrl, extractTagFromGeneratedLink } from "../src/ml/affiliate.ts";

test("anexa matt_tool e matt_word ao permalink", () => {
  const url = buildAffiliateUrl(
    "https://www.mercadolivre.com.br/capacete-ciclismo/p/MLB1234567890",
    { tag: "35439858", label: "ofertas-bot" },
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("matt_tool"), "35439858");
  assert.equal(parsed.searchParams.get("matt_word"), "ofertas-bot");
  assert.equal(parsed.pathname, "/capacete-ciclismo/p/MLB1234567890");
});

test("preserva parâmetros existentes da URL", () => {
  const url = buildAffiliateUrl(
    "https://www.mercadolivre.com.br/produto/p/MLB1?pdp_filters=item_id%3AMLB1",
    { tag: "35439858" },
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("pdp_filters"), "item_id:MLB1");
  assert.equal(parsed.searchParams.get("matt_tool"), "35439858");
  assert.equal(parsed.searchParams.get("matt_word"), null);
});

test("extrai a etiqueta de um link gerado", () => {
  assert.equal(
    extractTagFromGeneratedLink("https://mercadolivre.com/sec/abc?matt_tool=35439858&matt_word=x"),
    "35439858",
  );
  assert.equal(extractTagFromGeneratedLink("https://www.mercadolivre.com.br/produto/p/MLB1"), null);
});
