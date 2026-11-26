import test from "node:test";
import assert from "node:assert/strict";
import { getClientCredentialsToken, getRefreshTokenAccess } from "../src/ml/auth.ts";
import { searchMl } from "../src/ml/search.ts";

type FetchStub = typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("client_credentials: POST no token endpoint devolve access_token", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const stub: FetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(url);
    seenInit = init;
    return jsonResponse({ access_token: "tok123", token_type: "Bearer", expires_in: 21600 });
  }) as FetchStub;
  const token = await getClientCredentialsToken("ID1", "SECRET1", stub);
  assert.equal(token, "tok123");
  assert.equal(seenUrl, "https://api.mercadolibre.com/oauth/token");
  assert.equal(seenInit?.method, "POST");
  const body = new URLSearchParams(String(seenInit?.body ?? ""));
  assert.equal(body.get("grant_type"), "client_credentials");
  assert.equal(body.get("client_id"), "ID1");
  assert.equal(body.get("client_secret"), "SECRET1");
});

test("client_credentials: erro HTTP vira exceção com o status", async () => {
  const stub: FetchStub = (async () => jsonResponse({ error: "invalid_client" }, 400)) as FetchStub;
  await assert.rejects(() => getClientCredentialsToken("ID1", "WRONG", stub), /ML token falhou \(400\)/);
});

test("client_credentials: resposta sem access_token vira exceção", async () => {
  const stub: FetchStub = (async () => jsonResponse({ token_type: "Bearer" })) as FetchStub;
  await assert.rejects(() => getClientCredentialsToken("ID1", "SECRET1", stub), /sem access_token/);
});

test("searchMl envia Authorization Bearer quando há token, e omite sem token", async () => {
  const seen: Array<Record<string, string>> = [];
  const stub: FetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push((init?.headers ?? {}) as Record<string, string>);
    return jsonResponse({ results: [] });
  }) as FetchStub;
  await searchMl("garmin", 50, stub, "tok123");
  assert.equal(seen[0]?.Authorization, "Bearer tok123");
  await searchMl("garmin", 50, stub);
  assert.equal(seen[1]?.Authorization, undefined);
});

test("searchMl includes safe details from a 403 response without leaking the access token", async () => {
  const stub: FetchStub = (async () =>
    jsonResponse(
      {
        error: "forbidden",
        code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES",
        blocked_by: "PolicyAgent",
        message: "blocked token DO-NOT-LOG-THIS",
        access_token: "DO-NOT-LOG-THIS",
      },
      403,
    )) as FetchStub;
  await assert.rejects(
    () => searchMl("garmin", 50, stub, "DO-NOT-LOG-THIS"),
    (error: Error) => {
      assert.match(error.message, /403/);
      assert.match(error.message, /PA_UNAUTHORIZED_RESULT_FROM_POLICIES/);
      assert.match(error.message, /PolicyAgent/);
      assert.ok(!error.message.includes("DO-NOT-LOG-THIS"));
      return true;
    },
  );
});

test("refresh_token: POST com grant_type=refresh_token devolve token e mantém o atual se não houver rotação", async () => {
  let seenInit: RequestInit | undefined;
  const stub: FetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
    seenInit = init;
    return jsonResponse({ access_token: "user-tok", token_type: "Bearer", expires_in: 21600 });
  }) as FetchStub;
  const result = await getRefreshTokenAccess("ID1", "SECRET1", "REFRESH-OLD", stub);
  assert.equal(result.accessToken, "user-tok");
  assert.equal(result.refreshToken, "REFRESH-OLD");
  assert.equal(result.refreshTokenRotated, false);
  const body = new URLSearchParams(String(seenInit?.body ?? ""));
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("client_id"), "ID1");
  assert.equal(body.get("client_secret"), "SECRET1");
  assert.equal(body.get("refresh_token"), "REFRESH-OLD");
});

test("refresh_token: resposta com refresh_token diferente devolve e marca novo token", async () => {
  const stub: FetchStub = (async () =>
    jsonResponse({
      access_token: "user-tok",
      refresh_token: "REFRESH-NEW",
      expires_in: 21600,
      user_id: 123,
    })) as FetchStub;
  const result = await getRefreshTokenAccess("ID1", "SECRET1", "REFRESH-OLD", stub);
  assert.equal(result.accessToken, "user-tok");
  assert.equal(result.refreshToken, "REFRESH-NEW");
  assert.equal(result.refreshTokenRotated, true);
  assert.equal(result.userId, 123);
});

test("refresh_token: resposta com o mesmo refresh_token não marca rotação", async () => {
  const stub: FetchStub = (async () =>
    jsonResponse({
      access_token: "user-tok",
      refresh_token: "REFRESH-OLD",
      expires_in: 21600,
    })) as FetchStub;
  const result = await getRefreshTokenAccess("ID1", "SECRET1", "REFRESH-OLD", stub);
  assert.equal(result.refreshToken, "REFRESH-OLD");
  assert.equal(result.refreshTokenRotated, false);
});

test("refresh_token: erro HTTP vira exceção sem vazar o token na mensagem", async () => {
  const stub: FetchStub = (async () => jsonResponse({ error: "invalid_grant" }, 400)) as FetchStub;
  await assert.rejects(
    () => getRefreshTokenAccess("ID1", "SECRET1", "REFRESH-SECRET-VALUE", stub),
    (error: Error) => {
      assert.match(error.message, /ML token falhou \(400\)/);
      assert.ok(!error.message.includes("REFRESH-SECRET-VALUE"));
      return true;
    },
  );
});

test("refresh_token: resposta sem access_token vira exceção", async () => {
  const stub: FetchStub = (async () => jsonResponse({ token_type: "Bearer" })) as FetchStub;
  await assert.rejects(
    () => getRefreshTokenAccess("ID1", "SECRET1", "REFRESH-OLD", stub),
    /sem access_token/,
  );
});
