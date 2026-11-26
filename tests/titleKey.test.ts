import test from "node:test";
import assert from "node:assert/strict";
import {
  isSimilarTitle,
  titleDedupKey,
  titleSimilarity,
  titleTokens,
} from "../src/store/titleKey.ts";

test("titleDedupKey normaliza acentos, caixa e pontuação", () => {
  const a = titleDedupKey("Forma de Silicone para Air Fryer — Antiaderente!");
  const b = titleDedupKey("FORMA DE SILICONE PARA AIR FRYER ANTIADERENTE");
  assert.equal(a, b);
});

test("o mesmo produto de vendedores diferentes gera a mesma chave", () => {
  // Títulos reais de lojas diferentes para o mesmo item genérico:
  // iguais nas primeiras palavras, diferentes no rabo de keywords.
  const lojaA =
    "1/2/3 Forma De Silicone Para Air Fryer Forno Microondas Fritadeira Assadeira Reutilizável Antiaderente Flexível";
  const lojaB =
    "1/2/3 Forma De Silicone Para Air Fryer Forno Microondas Fritadeira Assadeira Reutilizável Antiaderente Flexível Redonda Quadrada";
  assert.equal(titleDedupKey(lojaA), titleDedupKey(lojaB));
});

test("produtos diferentes geram chaves diferentes", () => {
  assert.notEqual(
    titleDedupKey("Forma De Silicone Para Air Fryer Forno Microondas"),
    titleDedupKey("Panela De Pressão Elétrica Digital 5 Litros"),
  );
});

test("a chave usa no máximo 8 palavras", () => {
  const key = titleDedupKey("um dois tres quatro cinco seis sete oito nove dez");
  assert.equal(key, "title:um dois tres quatro cinco seis sete oito");
});

test("isSimilarTitle detecta títulos reordenados ou com prefixo de anúncio", () => {
  const a =
    "1/2/3 Forma De Silicone Para Air Fryer Forno Microondas Fritadeira Assadeira Reutilizável Antiaderente";
  const b =
    "Promoção Kit Forma De Silicone Para Air Fryer Forno Microondas Fritadeira Assadeira Antiaderente Redonda";
  assert.equal(isSimilarTitle(a, b), true);
  assert.ok(titleSimilarity(a, b) >= 0.6);

  const c = "Capacete Bike Ciclismo Masculino Feminino Com Led Pisca MTB";
  const d = "Capacete Ciclismo Bike MTB Com Led Pisca Masculino";
  assert.equal(isSimilarTitle(c, d), true);
});

test("isSimilarTitle detecta título curto contido em título longo cheio de keywords", () => {
  const curto = "Fone Bluetooth JBL Tune 520BT Preto";
  const longo =
    "Fone de Ouvido Sem Fio Bluetooth JBL Tune 520BT Preto Original Lacrado Com Nota Fiscal";
  assert.equal(isSimilarTitle(curto, longo), true);
  assert.ok(titleTokens(curto).has("520bt"));
});

test("isSimilarTitle não confunde produtos diferentes da mesma categoria", () => {
  const m10 = "Fone De Ouvido Sem Fio M10 TWS Bluetooth 5.3 display Led Touch";
  const gatinho = "Fone De Ouvido Bluetooth Orelha Gatinho Infantil Led Sem Fio";
  assert.equal(isSimilarTitle(m10, gatinho), false);
});
