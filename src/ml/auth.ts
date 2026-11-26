/** Mercado Livre OAuth token helpers. */
import { withTimeout } from "../http.ts";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface MlTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  user_id?: number;
}

export interface MlTokenResult {
  accessToken: string;
  /** Always contains the newest refresh token returned by ML, or the input token if omitted. */
  refreshToken: string;
  refreshTokenRotated: boolean;
  expiresIn?: number;
  userId?: number;
}

async function postToken(
  params: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<MlTokenResponse> {
  const res = await fetchFn(
    TOKEN_URL,
    withTimeout({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    }),
  );
  if (!res.ok) {
    throw new Error(`ML token falhou (${res.status})`);
  }
  const data = (await res.json()) as MlTokenResponse;
  if (!data.access_token) {
    throw new Error("ML token: resposta sem access_token");
  }
  return data;
}

/** App-only token; this is not a substitute for a user-authorized token on search. */
export async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const data = await postToken(
    {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    },
    fetchFn,
  );
  return data.access_token;
}

/** Refreshes a user-authorized token and returns the newly issued refresh token without logging it. */
export async function getRefreshTokenAccess(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<MlTokenResult> {
  const data = await postToken(
    {
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
    fetchFn,
  );
  const nextRefreshToken =
    typeof data.refresh_token === "string" && data.refresh_token.length > 0
      ? data.refresh_token
      : refreshToken;
  return {
    accessToken: data.access_token,
    refreshToken: nextRefreshToken,
    refreshTokenRotated: nextRefreshToken !== refreshToken,
    expiresIn: data.expires_in,
    userId: typeof data.user_id === "number" ? data.user_id : undefined,
  };
}
