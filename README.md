# ofertas-bot

Bot de ofertas para Telegram: busca promoções no **Mercado Livre**, na **Shopee** e na **Amazon**, gera links com a sua identificação de afiliado e posta num canal/grupo do Telegram — no automático, sem servidor (roda no GitHub Actions).

## Como funciona

1. **Busca**: ML via API pública de sites (`api.mercadolibre.com/sites/MLB/search`), autenticada com um access_token emitido por execução (client_credentials) — a busca sem auth devolve 403 em IPs de datacenter, testado na VM e nos runners do GitHub (2026-11-16); Shopee via Affiliate Open API GraphQL (`productOfferV2`); **Amazon via lista curada em `data/amazon-deals.json`** (plano B — ver abaixo); **brindes grátis via Epic Games (API pública, PT-BR) e GamerPower (API pública, traduzido para PT-BR)**.
2. **Filtro**: só entra oferta com desconto ≥ `DEAL_MIN_DISCOUNT_PCT` (padrão 20%), produto novo (ML), e que ainda não foi postada (`data/posted.json`).
3. **Link de afiliado**: ML — anexa a sua etiqueta (`matt_tool`); Shopee — usa o `offerLink` que a própria API devolve; **Amazon — anexa `?tag=` com o tracking ID (ex.: `lin63-20`)**.
4. **Post**: foto + legenda no Telegram via Bot API, com selo "Link de afiliado".

## Uso local

```bash
cp .env.example .env   # preencha as credenciais
npm test               # testes (sem rede)
npm run dry-run        # mostra o que seria postado, sem postar
npm start              # executa e posta de verdade
```

## Configuração (`.env`)

| Variável | Obrigatório | Descrição |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | sim | Token do bot criado no @BotFather |
| `TELEGRAM_CHAT_ID` | sim | `@seu_canal` ou ID `-100...` do canal/grupo |
| `ML_AFFILIATE_TAG` | p/ ML | Sua etiqueta de afiliado (`matt_tool`) |
| `ML_AFFILIATE_LABEL` | não | Rótulo de tracking (`matt_word`, padrão `ofertas-bot`) |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | p/ ML | Credenciais da aplicação em developers.mercadolivre.com.br (token por execução) |
| `SHOPEE_API_APP_ID` / `SHOPEE_API_SECRET` | p/ Shopee | Credenciais da Affiliate Open API |
| `AMAZON_AFFILIATE_TAG` | p/ Amazon | Tracking ID do Associates (ex.: `lin63-20`) — plano B, lista curada |
| `DEAL_KEYWORDS` | sim | Palavras-chave separadas por vírgula |
| `DEAL_MIN_DISCOUNT_PCT` | não | Desconto mínimo (padrão 20) |
| `DEAL_MAX_POSTS_PER_RUN` | não | Máx. de posts por execução (padrão 5) |
| `DEAL_STORES` | não | `ml,shopee,amazon` (padrão: as três) |

## Amazon — plano B (lista curada)

A Amazon não tem busca pública utilizável a partir de datacenter, e a Product Advertising API (plano A) só devolve dados depois de 3 vendas qualificadas em 180 dias. Enquanto isso, as ofertas da Amazon vêm de `data/amazon-deals.json`: uma lista de produtos reais conferidos no navegador na amazon.com.br (ASIN, título, preço e preço original). O bot só anexa `?tag=` e posta. **Refrescar a lista toda semana** — preço e oferta mudam; item postado não repete por 30 dias. Plano A (PA-API 5.0, Access Key + Secret + SigV4) fica para quando a conta tiver as 3 vendas.

## Brindes grátis (Epic + GamerPower, em PT-BR)

Para o canal ter algo além de ofertas pagas, cada execução também busca **jogos grátis de verdade**:

- **Epic Games**: API pública `freeGamesPromotions` com `locale=pt-BR` — título e descrição já vêm em português, sem tradução. Só entra o jogo com promoção de 100% ativa no momento.
- **GamerPower**: API pública de giveaways (jogos e loot). Conteúdo em inglês → traduzido para PT-BR via MyMemory (gratuito). Sem chave, usa a cota anônima (~5 mil caracteres/dia por IP, instável em datacenter); com `MYMEMORY_EMAIL` (chave gratuita por e-mail), 50 mil caracteres/dia. Se a tradução falhar, o item não é postado e tenta na próxima execução.
- Limite: `FREEBIE_MAX_PER_RUN` (padrão 3) por execução, com a mesma deduplicação de 30 dias. O post carrega o selo "Gratuito — sem link de afiliado".

Setup completo (BotFather, canal, segredos do GitHub, verificação do link ML): veja [docs/SETUP.md](docs/SETUP.md).

## ⚠️ Verificar antes de ir ao ar

O link de afiliado do ML **precisa ser validado** contra um link gerado pelo gerador oficial (`mercadolivre.com.br/afiliados/linkbuilder`). Um link comum copiado da barra do navegador não carrega a sua identificação. Veja o passo 4 em [docs/SETUP.md](docs/SETUP.md).

## Execução agendada

Workflow `.github/workflows/post-deals.yml`: roda 4× ao dia (10h, 13h, 16h, 19h BRT) no GitHub Actions, sem servidor. O `data/posted.json` é commitado de volta a cada run para não repostar a mesma oferta.
