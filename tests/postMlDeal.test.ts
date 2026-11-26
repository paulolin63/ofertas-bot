import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildManualMlDeal,
  extractMlItemId,
  parseBrlPrice,
  postManualMlDeal,
} from "../src/ml/postDeal.ts";
import { PostedDb } from "../src/store/db.ts";

test("parseBrlPrice aceita formato brasileiro, americano e rejeita inválidos", () => {
  assert.equal(parseBrlPrice("199,90"), 199.9);
  assert.equal(parseBrlPrice("R$ 1.299,90"), 1299.9);
  assert.equal(parseBrlPrice("199.90"), 199.9);
  assert.equal(parseBrlPrice("1.200"), 1200);
  assert.equal(parseBrlPrice("0"), null);
  assert.equal(parseBrlPrice("-10"), null);
  assert.equal(parseBrlPrice("abc"), null);
  assert.equal(parseBrlPrice(""), null);
});

test("extractMlItemId extrai MLB de URLs comuns e gera hash para shortlinks", () => {
  assert.equal(
    extractMlItemId("https://www.mercadolivre.com.br/produto/p/MLB1234567890"),
    "MLB1234567890",
  );
  assert.equal(
    extractMlItemId("https://produto.mercadolivre.com.br/MLB-987654321-capacete"),
    "MLB987654321",
  );
  const shortId = extractMlItemId("https://mercadolivre.com/sec/1AbCdEf");
  assert.match(shortId, /^url-[0-9a-f]{12}$/);
  assert.equal(shortId, extractMlItemId("https://mercadolivre.com/sec/1AbCdEf"));
});

test("buildManualMlDeal gera link de afiliado, preserva /sec/ e rejeita domínio externo", () => {
  const deal = buildManualMlDeal({
    url: "https://www.mercadolivre.com.br/fone-jbl/p/MLB1234567890",
    title: "Fone JBL Tune 520BT",
    price: "199,90",
    originalPrice: "299,90",
    affiliateTag: "35439858",
    affiliateLabel: "ofertas-bot",
  });
  assert.equal(deal.key, "ml:MLB1234567890");
  assert.equal(deal.price, 199.9);
  assert.equal(deal.originalPrice, 299.9);
  assert.equal(deal.discountPct, 33);
  assert.equal(deal.discountUnknown, undefined);
  assert.ok(deal.url.includes("matt_tool=35439858"));
  assert.ok(deal.url.includes("matt_word=ofertas-bot"));

  // Shortlink /sec/ já vem do gerador oficial e é preservado intacto.
  const shortDeal = buildManualMlDeal({
    url: "https://mercadolivre.com/sec/2XYZabc",
    title: "Air Fryer Mondial",
    price: "289,00",
    affiliateTag: "",
  });
  assert.equal(shortDeal.url, "https://mercadolivre.com/sec/2XYZabc");
  assert.equal(shortDeal.discountUnknown, true);

  assert.throws(
    () =>
      buildManualMlDeal({
        url: "https://evil-mercadolivre.com.br/p/MLB1234567890",
        title: "Teste",
        price: "100",
        affiliateTag: "35439858",
      }),
    /fora do Mercado Livre/,
  );
});

test("postManualMlDeal faz dry-run, posta no Telegram, deduplica e respeita force", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-ml-post-"));
  const sentMethods: string[] = [];
  const stubFetch = (async (url: string) => {
    sentMethods.push(url.split("/").pop() ?? "");
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  }) as unknown as typeof fetch;

  try {
    // 1) Dry-run não posta nem grava no banco.
    const dry = await postManualMlDeal({
      url: "https://www.mercadolivre.com.br/fone-jbl/p/MLB555666777",
      title: "Fone JBL Tune 520BT Preto",
      price: "199,90",
      affiliateTag: "35439858",
      telegramBotToken: "",
      telegramChatId: "",
      dataDir: dir,
      dryRun: true,
      fetchFn: stubFetch,
    });
    assert.equal(dry.posted, false);
    assert.equal(dry.dryRun, true);
    assert.match(dry.message, /<b>OFERTA<\/b>/);
    assert.doesNotMatch(dry.message, /\b0% OFF/);
    assert.equal(sentMethods.length, 0);
    assert.equal(new PostedDb(dir).size, 0);

    // 2) Envio real com foto grava em posted.json.
    const real = await postManualMlDeal({
      url: "https://www.mercadolivre.com.br/fone-jbl/p/MLB555666777",
      title: "Fone JBL Tune 520BT Preto",
      price: "199,90",
      originalPrice: "299,90",
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_123.jpg",
      affiliateTag: "35439858",
      telegramBotToken: "tok",
      telegramChatId: "@canal",
      dataDir: dir,
      fetchFn: stubFetch,
    });
    assert.equal(real.posted, true);
    assert.deepEqual(sentMethods, ["sendPhoto"]);
    assert.equal(new PostedDb(dir).has("ml:MLB555666777"), true);

    // 3) Repetição é ignorada sem force.
    const dup = await postManualMlDeal({
      url: "https://www.mercadolivre.com.br/fone-jbl/p/MLB555666777",
      title: "Fone JBL Tune 520BT Preto",
      price: "199,90",
      affiliateTag: "35439858",
      telegramBotToken: "tok",
      telegramChatId: "@canal",
      dataDir: dir,
      fetchFn: stubFetch,
    });
    assert.equal(dup.posted, false);
    assert.equal(dup.skippedDuplicate, true);
    assert.equal(sentMethods.length, 1);

    // 4) Com force=true e sem foto, envia via sendMessage.
    const forced = await postManualMlDeal({
      url: "https://www.mercadolivre.com.br/fone-jbl/p/MLB555666777",
      title: "Fone JBL Tune 520BT Preto",
      price: "189,90",
      affiliateTag: "35439858",
      telegramBotToken: "tok",
      telegramChatId: "@canal",
      dataDir: dir,
      force: true,
      fetchFn: stubFetch,
    });
    assert.equal(forced.posted, true);
    assert.deepEqual(sentMethods, ["sendPhoto", "sendMessage"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
