/**
 * Mercado Livre — tokens OAuth.
 *
 * Contexto: a busca pública do ML (GET /sites/MLB/search) devolve 403 tanto
 * desta VM quanto dos runners do GitHub Actions (IPs de datacenter). Um
 * access_token de client_credentials (só da aplicação) é emitido, mas a
 * busca continua 403 com ele (testado 2026-11-26, dry-run #42) — o
 * endpoint exige um token autorizado por um usuário. Por isso o caminho
 * principal agora é o refresh_token do usuário PAULOCLARK (autorizado em
 * 2026-11-26, com o fluxo Refresh Token habilitado no DevCenter).
 *
 * Comportamento do refresh_token (docs oficiais do OAuth da plataforma,
 * developers — Mercado Pago Developers, mesma plataforma OAuth do ML:
 * https://www.mercadopago.com.br/developers/en/docs/security/oauth/introduction
 * e https://www.mercadopago.com.br/developers/en/docs/additional-content/security/oauth/renewal
 * — consultadas em 2026-11-26; as páginas do DevCenter do ML não puderam
 * ser lidas aqui por bloqueio de acesso):
 * - authorization_code: 10 minutos, uso único.
 * - refresh_token: 6 meses e PODE SER REUTILIZADO (não é uso único).
 * - Cada refresh devolve um access_token novo (6h no ML, expires_in
 *   21600 — confirmado na troca real de 2026-11-26) E um refresh_token
 *   novo; a documentação orienta a armazenar o novo valor a cada vez
 *   ("every time you refresh the access_token, the refresh_token will
 *   also be refreshed, so you will need to store it again").
 * - O fluxo exige scope offline_access e autorização prévia do usuário
 *   via Authorization Code (ambos já existem para este app).
 *
 * Consequência para o bot: o workflow NÃO consegue persistir o novo
 * refresh_token (atualizar um secret exige um PAT; o bot não tem um).
 * Por isso getRefreshTokenAccess apenas DETECTA a rotação e o job avisa
 * no log para o operador atualizar o secret ML_REFRESH_TOKEN — o valor
 * novo NUNCA é escrito em log, arquivo ou repositório. Enquanto o secret
 * não for atualizado, o refresh_token antigo segue reutilizável (docs),
 * então o bot continua funcionando; se um dia ele parar, o job cai para
 * client_credentials e depois para a busca sem autenticação.
 */

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface MlTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
}

export interface MlTokenResult {
  accessToken: string;
  /**
   * True quando o endpoint devolveu um refresh_token diferente do usado
   * para emitir o access_token — ou seja, o ML rotacionou o token e o
   * secret ML_REFRESH_TOKEN precisa ser atualizado (ver aviso no job).
   */
  refreshTokenRotated: boolean;
}

async function postToken(
  params: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<MlTokenResponse> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    throw new Error(`ML token falhou (${res.status})`);
  }
  const data = (await res.json()) as MlTokenResponse;
  if (!data.access_token) {
    throw new Error("ML token: resposta sem access_token");
  }
  return data;
}

/** Emite um access_token com grant_type=client_credentials. */
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

/**
 * Emite um access_token de usuário com grant_type=refresh_token.
 * O refresh_token é enviado SOMENTE ao token endpoint do ML — nunca é
 * registrado em log nem devolvido fora desta função (só o booleano de
 * rotação sai daqui; o valor novo não é exposto).
 */
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
  return {
    accessToken: data.access_token,
    refreshTokenRotated:
      typeof data.refresh_token === "string" &&
      data.refresh_token.length > 0 &&
      data.refresh_token !== refreshToken,
  };
}
