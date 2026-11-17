import test from "node:test";
import assert from "node:assert/strict";
import { epicElementToGame, fetchEpicFreeGames } from "../src/freebies/epic.ts";
import {
  gamerpowerItemToGiveaway,
  shortDescription,
} from "../src/freebies/gamerpower.ts";
import { translateEnToPtBr } from "../src/freebies/translate.ts";
import {
  collectFreebies,
  formatFreebieMessage,
  type Freebie,
} from "../src/freebies/freebie.ts";

function mockFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const NOW = new Date("2026-11-17T12:00:00Z");

test("epic: jogo grátis agora vira game com preço original em R$", () => {
  const game = epicElementToGame(
    {
      title: "Knightica",
      description: "Um roguelike tático.",
      productSlug: "knightica",
      price: { totalPrice: { fmtPrice: { originalPrice: "R$ 39,99" } } },
      keyImages: [{ type: "OfferImageWide", url: "https://cdn.example.com/wide.jpg" }],
      promotions: {
        promotionalOffers: [
          {
            promotionalOffers: [
              {
                startDate: "2026-11-12T16:00:00.000Z",
                endDate: "2026-11-19T16:00:00.000Z",
                discountSetting: { discountPercentage: 0 },
              },
            ],
          },
        ],
      },
    },
    NOW,
  );
  assert.ok(game);
  assert.equal(game?.title, "Knightica");
  assert.equal(game?.url, "https://store.epicgames.com/pt-BR/p/knightica");
  assert.equal(game?.endDate, "2026-11-19T16:00:00.000Z");
});

test("epic: sem oferta grátis ativa é descartado", () => {
  const game = epicElementToGame(
    {
      title: "Jogo Pago",
      promotions: {
        promotionalOffers: [
          {
            promotionalOffers: [
              {
                startDate: "2026-11-12T16:00:00.000Z",
                endDate: "2026-11-19T16:00:00.000Z",
                discountSetting: { discountPercentage: 50 },
              },
            ],
          },
        ],
      },
    },
    NOW,
  );
  assert.equal(game, null);
});

test("gamerpower: item ativo vira giveaway, inativo é descartado", () => {
  const item = gamerpowerItemToGiveaway({
    id: 3850,
    title: "Knightica (Epic Games) Giveaway",
    worth: "$14.99",
    description: "Score Knightica for free via Epic Games Store!\n\n*Please note...*",
    open_giveaway_url: "https://www.gamerpower.com/open/knightica",
    end_date: "2026-11-19 23:59:00",
    platforms: "PC, Epic Games Store",
    status: "Active",
  });
  assert.ok(item);
  assert.equal(item?.description, "Score Knightica for free via Epic Games Store!");
  assert.equal(
    gamerpowerItemToGiveaway({ id: 1, title: "X", status: "Expired" }),
    null,
  );
});

test("shortDescription corta no primeiro parágrafo e em 200 caracteres", () => {
  assert.equal(shortDescription("Primeiro.\n\nSegundo."), "Primeiro.");
  assert.equal(shortDescription("a".repeat(250)).length, 200);
});

test("translate: sucesso devolve o texto traduzido", async () => {
  const out = await translateEnToPtBr(
    "Free game for PC",
    mockFetch({ responseData: { translatedText: "Jogo grátis para PC" } }),
  );
  assert.equal(out, "Jogo grátis para PC");
});

test("translate: aviso de cota vira exceção", async () => {
  await assert.rejects(
    () =>
      translateEnToPtBr(
        "Free game",
        mockFetch({
          responseData: {
            translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS",
          },
        }),
      ),
    /MyMemory/,
  );
});

test("translate: HTTP 500 vira exceção", async () => {
  await assert.rejects(
    () => translateEnToPtBr("Free game", mockFetch({}, 500)),
    /HTTP 500/,
  );
});

test("formatFreebieMessage: grátis, valor riscado, prazo e sem afiliado", () => {
  const f: Freebie = {
    source: "epic",
    key: "freebie:epic:x",
    title: "Knightica",
    description: "Um roguelike tático.",
    url: "https://store.epicgames.com/pt-BR/p/knightica",
    imageUrl: null,
    worth: "R$ 39,99",
    endDate: "2026-11-19T16:00:00.000Z",
  };
  const text = formatFreebieMessage(f);
  assert.ok(text.includes("GRÁTIS"));
  assert.ok(text.includes("<s>R$ 39,99</s>"));
  assert.ok(text.includes("Até 19/11"));
  assert.ok(text.includes("sem link de afiliado"));
});

test("collectFreebies: epic entra direto, gamerpower traduzido", async () => {
  const epicBody = {
    data: {
      Catalog: {
        searchStore: {
          elements: [
            {
              title: "Knightica",
              description: "Um roguelike tático.",
              productSlug: "knightica",
              price: { totalPrice: { fmtPrice: { originalPrice: "R$ 39,99" } } },
              promotions: {
                promotionalOffers: [
                  {
                    promotionalOffers: [
                      {
                        startDate: "2026-11-12T16:00:00.000Z",
                        endDate: "2026-11-19T16:00:00.000Z",
                        discountSetting: { discountPercentage: 0 },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    },
  };
  const gpBody = [
    {
      id: 3850,
      title: "Knightica Giveaway",
      worth: "$14.99",
      description: "Score it for free!",
      open_giveaway_url: "https://www.gamerpower.com/open/knightica",
      end_date: "2026-11-19 23:59:00",
      status: "Active",
    },
  ];
  const fetchFn = (async (url: string) => {
    if (url.includes("epicgames")) return new Response(JSON.stringify(epicBody));
    if (url.includes("gamerpower")) return new Response(JSON.stringify(gpBody));
    // MyMemory: ecoa o texto com prefixo para provar que traduziu
    const q = new URL(url).searchParams.get("q") ?? "";
    return new Response(
      JSON.stringify({ responseData: { translatedText: `[PT] ${q}` } }),
    );
  }) as unknown as typeof fetch;

  const { freebies, errors } = await collectFreebies(
    { sources: ["epic", "gamerpower"], maxPerRun: 5, myMemoryEmail: "" },
    fetchFn,
    NOW,
  );
  assert.deepEqual(errors, []);
  assert.equal(freebies.length, 2);
  assert.equal(freebies[0].source, "epic");
  assert.equal(freebies[0].title, "Knightica");
  assert.equal(freebies[1].source, "gamerpower");
  assert.ok(freebies[1].title.startsWith("[PT]"));
});

test("collectFreebies: tradução falhou pula o item e registra o erro", async () => {
  const fetchFn = (async (url: string) => {
    if (url.includes("epicgames")) {
      return new Response(JSON.stringify({ data: { Catalog: { searchStore: { elements: [] } } } }));
    }
    if (url.includes("gamerpower")) {
      return new Response(
        JSON.stringify([
          {
            id: 1,
            title: "Some Game",
            description: "Free!",
            open_giveaway_url: "https://www.gamerpower.com/open/x",
            status: "Active",
          },
        ]),
      );
    }
    return new Response(
      JSON.stringify({
        responseData: { translatedText: "MYMEMORY WARNING: quota" },
      }),
    );
  }) as unknown as typeof fetch;

  const { freebies, errors } = await collectFreebies(
    { sources: ["gamerpower"], maxPerRun: 5, myMemoryEmail: "" },
    fetchFn,
    NOW,
  );
  assert.equal(freebies.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /gamerpower:1/);
});
