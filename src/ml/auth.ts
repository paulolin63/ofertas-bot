/**
 * Mercado Livre — token OAuth via client_credentials.
 *
 * Contexto: a busca pública do ML (GET /sites/MLB/search) devolve 403 tanto
 * desta VM quanto dos runners do GitHub Actions (IPs de datacenter). A
 * hipótese testada aqui é que uma chamada autenticada passe pelo bloqueio:
 * cada execução emite um access_token (válido 6h) com as credenciais da
 * aplicação criada em developers.mercadolivre.com.br e o envia como
 * Bearer na busca. Se o ML rejeitar o grant ou o token não destravar a
 * busca, o job registra o erro e cai para a busca sem autenticação.
 *
 * Alternativa (não implementada): authorization_code + offline_access gera
 * um refresh_token de 6 meses, mas cada refresh devolve um refresh_token
 * novo e o workflow teria de persistir o novo valor em segredo — o que
 * exige um PAT com acesso a secrets. Só vale a pena se client_credentials
 * não funcionar para a busca.
 */

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface MlTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/** Emite um access_token com grant_type=client_credentials. */
export async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`ML token falhou (${res.status})`);
  }
  const data = (await res.json()) as MlTokenResponse;
  if (!data.access_token) {
    throw new Error("ML token: resposta sem access_token");
  }
  return data.access_token;
}
