# ofertas-bot

Bot de ofertas para Telegram: busca promoções no **Mercado Livre** e na **Shopee**, gera links com a sua identificação de afiliado e posta num canal/grupo do Telegram — no automático, sem servidor (roda no GitHub Actions).

## Como funciona

1. **Busca**: ML via API pública de sites (`api.mercadolibre.com/sites/MLB/search`), autenticada com um access_token emitido por execução (client_credentials) — a busca sem auth devolve 403 em IPs de datacenter, testado na VM e nos runners do GitHub (2026-11-16); Shopee via Affiliate Open API GraphQL (`productOfferV2`).
2. **Filtro**: só entra oferta com desconto ≥ `DEAL_MIN_DISCOUNT_PCT` (padrão 20%), produto novo (ML), e que ainda não foi postada (`data/posted.json`).
3. **Link de afiliado**: ML — anexa a sua etiqueta (`matt_tool`); Shopee — usa o `offerLink` que a própria API devolve.
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
| `DEAL_KEYWORDS` | sim | Palavras-chave separadas por vírgula |
| `DEAL_MIN_DISCOUNT_PCT` | não | Desconto mínimo (padrão 20) |
| `DEAL_MAX_POSTS_PER_RUN` | não | Máx. de posts por execução (padrão 5) |
| `DEAL_STORES` | não | `ml,shopee` (padrão: as duas) |

Setup completo (BotFather, canal, segredos do GitHub, verificação do link ML): veja [docs/SETUP.md](docs/SETUP.md).

## ⚠️ Verificar antes de ir ao ar

O link de afiliado do ML **precisa ser validado** contra um link gerado pelo gerador oficial (`mercadolivre.com.br/afiliados/linkbuilder`). Um link comum copiado da barra do navegador não carrega a sua identificação. Veja o passo 4 em [docs/SETUP.md](docs/SETUP.md).

## Execução agendada

Workflow `.github/workflows/post-deals.yml`: roda 4× ao dia (10h, 13h, 16h, 19h BRT) no GitHub Actions, sem servidor. O `data/posted.json` é commitado de volta a cada run para não repostar a mesma oferta.
