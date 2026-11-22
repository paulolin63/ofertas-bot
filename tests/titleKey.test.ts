import test from "node:test";
import assert from "node:assert/strict";
import { titleDedupKey } from "../src/store/titleKey.ts";

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
