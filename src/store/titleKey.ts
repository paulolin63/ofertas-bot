/**
 * Chave de deduplicação por título normalizado.
 *
 * O mesmo produto genérico vendido por lojas diferentes tem
 * shopId/itemId diferentes na Shopee, então a chave por item não
 * segura a repetição: o mesmo item voltava todo dia (reclamação do
 * usuário em 2026-11-22, forma de silicone para air fryer).
 * Os títulos da Shopee são longos e cheios de keywords, então as
 * primeiras palavras normalizadas identificam o produto bem o
 * suficiente para dedup.
 */
export function titleDedupKey(title: string): string {
  const normalized = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return `title:${normalized}`;
}
