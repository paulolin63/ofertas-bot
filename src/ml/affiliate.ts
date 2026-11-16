/**
 * Mercado Livre — construção do link de afiliado.
 *
 * Como funciona: o link gerado pelo Gerador de Links do programa
 * (mercadolivre.com.br/afiliados/linkbuilder) ou pela Barra de Afiliados
 * carrega a identificação do afiliado como parâmetros na URL — a etiqueta
 * (`matt_tool`) é o identificador. Ferramentas de terceiros fazem o mesmo:
 * extraem a identificação de UM link gerado e a reaplicam a outros
 * produtos, sem senha nem cookies.
 *
 * ⚠️ ANTES DE IR AO AR: gere UM link no linkbuilder com a sua conta e
 * confira que os parâmetros aqui aplicados são os mesmos que o gerador
 * produz (veja docs/SETUP.md). Um link comum copiado da barra do navegador
 * NÃO carrega a sua identificação e a venda não conta para você.
 */

export interface MlAffiliateParams {
  tag: string;
  /** Rótulo de tracking (matt_word). Opcional. */
  label?: string;
}

/** Anexa a identificação de afiliado a um permalink de produto do ML. */
export function buildAffiliateUrl(permalink: string, params: MlAffiliateParams): string {
  const url = new URL(permalink);
  url.searchParams.set("matt_tool", params.tag);
  if (params.label) url.searchParams.set("matt_word", params.label);
  return url.toString();
}

/** Extrai a etiqueta de um link já gerado pelo linkbuilder (para conferência). */
export function extractTagFromGeneratedLink(generatedUrl: string): string | null {
  try {
    return new URL(generatedUrl).searchParams.get("matt_tool");
  } catch {
    return null;
  }
}
