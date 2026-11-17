/**
 * Amazon Associates (Brasil) — plano B (sem PA-API).
 *
 * O link de afiliado da Amazon é qualquer URL da amazon.com.br com o
 * parâmetro `tag=<tracking-id>` (ex.: lin63-20). Não existe shortlink
 * oficial gerado por fora do SiteStripe; o rastreamento é o próprio
 * parâmetro na URL. Cookie de atribuição: 24h (90 dias se o item entrar
 * no carrinho nessa janela).
 *
 * Plano A (futuro): Product Advertising API 5.0 — busca oficial por
 * keyword, mas exige 3 vendas qualificadas em 180 dias para devolver
 * dados, além de Access Key + Secret Key com assinatura AWS SigV4.
 */
export function buildAmazonAffiliateUrl(rawUrl: string, tag: string): string {
  const url = new URL(rawUrl);
  if (!url.hostname.endsWith("amazon.com.br")) {
    throw new Error(`URL fora da amazon.com.br: ${rawUrl}`);
  }
  if (!tag) throw new Error("AMAZON_AFFILIATE_TAG vazia.");
  url.searchParams.set("tag", tag);
  return url.toString();
}
