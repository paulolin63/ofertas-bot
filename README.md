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
| `DEAL_KEYWORDS` | não | Palavras-chave separadas por vírgula (fallback — nos dias de tema valem as keywords do tema; ver Calendário semanal) |
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

## Calendário semanal de temas

Cada dia tem um tema (código em `src/theme.ts`, dia calculado no fuso America/Sao_Paulo):

- segunda 💄 Cosméticos · terça 🚗 Automóveis · quarta 📱 Eletrônicos · quinta 🚴 Esporte e ciclismo · sexta 🏠 Casa e cozinha
- sábado 🎮 só jogos grátis (sem ofertas pagas) · domingo 🤖 só IA grátis (sem ofertas, sem jogos)

Na primeira execução do dia o bot anuncia o tema no canal ("🎯 Hoje é quarta-feira — dia de ELETRÔNICOS! 📱") — uma vez por dia, com dedup pela chave `theme:YYYY-MM-DD` em `data/posted.json`. Domingo ainda não tem coletor automático de IA grátis: o bot só anuncia o tema; a dica de IA é postada manualmente a partir da lista de recursos gratuitos.

## ⚠️ Verificar antes de ir ao ar

O link de afiliado do ML **precisa ser validado** contra um link gerado pelo gerador oficial (`mercadolivre.com.br/afiliados/linkbuilder`). Um link comum copiado da barra do navegador não carrega a sua identificação. Veja o passo 4 em [docs/SETUP.md](docs/SETUP.md).

**Cupons**: a API da Shopee (`productOfferV2`) não expõe campo de cupom/voucher nos SDKs e na documentação pública consultados (2026-11-18) — por isso o bot ainda não anexa cupons aos posts. A confirmação definitiva exige uma introspecção do schema GraphQL com as credenciais da Shopee (pendente).

## Execução agendada

Workflow `.github/workflows/post-deals.yml`: roda 4× ao dia (10h, 13h, 16h, 19h BRT) no GitHub Actions, sem servidor. O `data/posted.json` é commitado de volta a cada run para não repostar a mesma oferta.


## Digest diário de AI/tecnologia (Telegram privado)

O workflow separado `.github/workflows/ai-news-digest.yml` envia um digest por dia às **08:07, horário de São Paulo**. Ele acompanha os feeds abertos do OpenAI News, Hugging Face Blog, TechCrunch AI, GitHub Blog e Hacker News; filtra posts do GitHub para temas de AI/desenvolvimento e traduz títulos e trechos curtos para chinês tradicional via MyMemory, mantendo o link original. Se a tradução falhar, envia o texto original. É um resumo de manchetes e trechos — não usa LLM nem exige uma chave de IA, e não precisa manter um servidor RSSHub ligado.

O destino é independente: `TELEGRAM_NEWS_CHAT_ID` é usado somente pelo digest. O `TELEGRAM_CHAT_ID` existente continua apontando para o canal/grupo de ofertas. Para ativar o privado, use Actions → `ai-news-digest` → Run workflow:

1. Execute `identify_bot` para ver o username do bot já configurado.
2. Abra o bot no Telegram, toque em Start e envie `/start digestsetup`.
3. Execute `capture_private_chat_id`; o bot envia o ID privado somente para aquela conversa. O ID não é exibido nos logs da execução.
4. Salve esse número no repositório como secret `TELEGRAM_NEWS_CHAT_ID` em Settings → Secrets and variables → Actions.
5. Selecione `preview` para conferir sem publicar, ou `send_digest` para testar o envio privado.

A deduplicação é gravada em `data/news-digest-posted.json`, separada do histórico de ofertas.
