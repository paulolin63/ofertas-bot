# ofertas-bot

Bot de ofertas para Telegram: busca promoções no **Mercado Livre**, na **Shopee** e na **Amazon**, gera links com a sua identificação de afiliado e posta num canal/grupo do Telegram — no automático, sem servidor (roda no GitHub Actions).

## Como funciona

1. **Busca**:
   - **Mercado Livre**: API pública (`api.mercadolibre.com/sites/MLB/search`) autenticada com `client_credentials` por execução (a busca sem auth devolve 403 em IPs de datacenter) + workflow semi-automático `.github/workflows/post-ml-deal.yml` para postar ofertas avulsas copiadas do navegador/app.
   - **Shopee**: Affiliate Open API GraphQL (`productOfferV2`).
   - **Amazon**: **plano C via Firecrawl Cloud** (`src/amazon/firecrawl.ts`) com **cache diário por keyword em `data/amazon-cache.json`** (`src/amazon/cache.ts`, raspando cada keyword 1× ao dia em vez de 4×); sem `FIRECRAWL_API_KEY`, volta ao **plano B** (lista curada em `data/amazon-deals.json`).
   - **Brindes grátis**: Epic Games (API pública em PT-BR) e GamerPower (API pública traduzida para PT-BR via MyMemory).
2. **Filtro, qualidade e deduplicação**:
   - Exige desconto entre `DEAL_MIN_DISCOUNT_PCT` (padrão 20%) e `DEAL_MAX_DISCOUNT_PCT` (padrão 85%, evitando descontos inflados), preço ≥ `DEAL_MIN_PRICE` (padrão R$ 10), avaliação ≥ `DEAL_MIN_RATING` (padrão 4.0, quando informada) e vendas ≥ `DEAL_MIN_SALES` (padrão 10, quando informadas).
   - Ofertas sem preço riscado (`discountUnknown`, comum na busca Amazon) são isentas do desconto mínimo e exibem o selo **OFERTA** em vez de `0% OFF`.
   - Deduplicação de 30 dias em `data/posted.json` por **chave do item**, **chave de título** e **similaridade de título** (Jaccard/contenção de tokens em `src/store/titleKey.ts`), bloqueando o mesmo produto de vendedores diferentes mesmo com palavras reordenadas ou prefixos como "Kit"/"Promoção".
3. **Rotação entre lojas**: as vagas de cada execução são intercaladas em round-robin entre ML, Shopee e Amazon, rotacionando a loja inicial por turno/dia (BRT) para nenhuma loja monopolizar o canal.
4. **Link de afiliado e post**: ML (`matt_tool`/`matt_word`), Shopee (`offerLink`), Amazon (`?tag=`). Foto + legenda HTML escapada no Telegram via Bot API, com timeout em todas as chamadas HTTP e selo "Link de afiliado".

## Uso local

```bash
cp .env.example .env   # preencha as credenciais
npm run typecheck      # checagem de tipos TypeScript
npm test               # testes (sem rede)
npm run dry-run        # mostra o que seria postado, sem postar
npm start              # executa e posta de verdade
```

## Configuração (`.env`)

| Variável | Obrigatório | Descrição |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | sim | Token do bot criado no @BotFather |
| `TELEGRAM_CHAT_ID` | sim | `@seu_canal` ou ID `-100...` do canal/grupo |
| `TELEGRAM_NEWS_CHAT_ID` | p/ digest | ID do chat privado para o digest diário de AI/tecnologia |
| `ML_AFFILIATE_TAG` | p/ ML | Sua etiqueta de afiliado (`matt_tool`) |
| `ML_AFFILIATE_LABEL` | não | Rótulo de tracking (`matt_word`, padrão `ofertas-bot`) |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | p/ ML | Credenciais da aplicação em developers.mercadolivre.com.br (token por execução) |
| `SHOPEE_API_APP_ID` / `SHOPEE_API_SECRET` | p/ Shopee | Credenciais da Affiliate Open API |
| `AMAZON_AFFILIATE_TAG` | p/ Amazon | Tracking ID do Associates (ex.: `lin63-20`) |
| `FIRECRAWL_API_KEY` | p/ Amazon C | Chave do Firecrawl Cloud (plano C, com cache diário; sem ela usa `data/amazon-deals.json`) |
| `FREEBIE_SOURCES` | não | Fontes de brindes: `epic,gamerpower` (padrão: as duas) |
| `FREEBIE_MAX_PER_RUN` | não | Máx. de brindes por execução (padrão 3) |
| `MYMEMORY_EMAIL` | não | E-mail válido enviado no parâmetro `de` do MyMemory (eleva cota para 50 mil chars/dia) |
| `DEAL_KEYWORDS` | não | Palavras-chave separadas por vírgula (fallback — nos dias de tema valem as keywords do tema) |
| `DEAL_MIN_DISCOUNT_PCT` | não | Desconto mínimo em % (padrão 20) |
| `DEAL_MAX_DISCOUNT_PCT` | não | Desconto máximo aceito em % para barrar preços inflados (padrão 85) |
| `DEAL_MIN_PRICE` | não | Preço mínimo em R$ para filtrar iscas de variação (padrão 10) |
| `DEAL_MIN_RATING` | não | Avaliação mínima quando informada pela loja (padrão 4.0) |
| `DEAL_MIN_SALES` | não | Quantidade mínima de vendas quando informada (padrão 10) |
| `DEAL_MAX_POSTS_PER_RUN` | não | Máx. de posts de ofertas por execução (padrão 5) |
| `DEAL_STORES` | não | `ml,shopee,amazon` (padrão: as três) |

## Amazon — plano C (Firecrawl + cache diário) e plano B (lista curada)

A Amazon bloqueia busca direta a partir de datacenter, e a Product Advertising API (plano A) exige vendas qualificadas recentes.

- **Plano C (ativo com `FIRECRAWL_API_KEY`)**: o bot raspa a busca da `amazon.com.br` via Firecrawl Cloud e salva o resultado do dia em `data/amazon-cache.json` (por data BRT e keyword). Assim, nas 4 execuções diárias, cada keyword é raspada apenas **1 vez por dia** (~5 créditos/dia ≈ ~110/mês, 75% de economia).
- **Plano B (fallback sem chave)**: ofertas curadas em `data/amazon-deals.json` (ASIN, título, preço, preço original); o bot anexa `?tag=` e posta.
- **Plano A (futuro)**: PA-API 5.0 quando a conta for elegível.

## Mercado Livre — postagem semi-automática (`post-ml-deal.yml`)

Enquanto a busca automática do ML continuar bloqueada em IPs de datacenter (403) e com reCAPTCHA no Firecrawl, você pode publicar ofertas encontradas no navegador/app pelo workflow **Actions → `post-ml-deal` → Run workflow**:

- Informe `url` (link do produto no ML ou shortlink `/sec/...`), `title`, `price` (aceita `199,90` ou `199.90`), e opcionalmente `original_price`, `image_url`, `force` e `dry_run`.
- O script (`src/ml/postDeal.ts`) valida a URL, anexa `matt_tool`/`matt_word`, confere deduplicação em `data/posted.json`, posta no Telegram e commita o histórico de volta.

## Brindes grátis (Epic + GamerPower, em PT-BR)

Para o canal ter algo além de ofertas pagas, cada execução também busca **jogos grátis de verdade**:

- **Epic Games**: API pública `freeGamesPromotions` com `locale=pt-BR` — título e descrição já vêm em português, sem tradução. Só entra o jogo com promoção de 100% ativa no momento.
- **GamerPower**: API pública de giveaways (jogos e loot). Conteúdo em inglês → traduzido para PT-BR via MyMemory (gratuito). Sem e-mail, usa a cota anônima (~5 mil caracteres/dia por IP, instável em datacenter); com `MYMEMORY_EMAIL` (enviado via parâmetro `de`), 50 mil caracteres/dia. Se a tradução falhar, o item não é postado e tenta na próxima execução.
- Limite: `FREEBIE_MAX_PER_RUN` (padrão 3) por execução, com a mesma deduplicação de 30 dias. O post carrega o selo "Gratuito — sem link de afiliado".

Setup completo (BotFather, canal, segredos do GitHub, verificação do link ML): veja [docs/SETUP.md](docs/SETUP.md).

## Calendário semanal de temas

Cada dia tem um tema (código em `src/theme.ts`, dia calculado no fuso `America/Sao_Paulo`):

- segunda 💄 Cosméticos · terça 🚗 Automóveis · quarta 📱 Eletrônicos · quinta 🚴 Esporte e ciclismo · sexta 🏠 Casa e cozinha
- sábado 🎮 jogos grátis (ofertas entram apenas como reserva quando não há jogo novo)
- domingo 🤖 IA grátis (dicas automáticas da lista curada em `src/aitips/tips.ts`; ofertas entram apenas como reserva quando a lista esgota na janela de 30 dias)

Na primeira execução do dia o bot anuncia o tema no canal ("🎯 Hoje é quarta-feira — dia de ELETRÔNICOS! 📱") — uma vez por dia, com dedup pela chave `theme:YYYY-MM-DD` em `data/posted.json`.

## ⚠️ Verificar antes de ir ao ar

O link de afiliado do ML **precisa ser validado** contra um link gerado pelo gerador oficial (`mercadolivre.com.br/afiliados/linkbuilder`). Um link comum copiado da barra do navegador não carrega a sua identificação. Veja o passo 4 em [docs/SETUP.md](docs/SETUP.md).

**Cupons**: a API da Shopee (`productOfferV2`) não expõe campo de cupom/voucher nos SDKs e na documentação pública consultados (2026-11-18) — por isso o bot ainda não anexa cupons aos posts. A confirmação definitiva exige uma introspecção do schema GraphQL com as credenciais da Shopee (pendente).

## Workflows no GitHub Actions

- **`.github/workflows/post-deals.yml`**: roda 4× ao dia (10h07, 13h07, 16h07, 19h07 BRT), com `concurrency` dedicado e `git pull --rebase` ao persistir `data/posted.json` e `data/amazon-cache.json`.
- **`.github/workflows/post-ml-deal.yml`**: disparo manual (`workflow_dispatch`) para publicar uma oferta específica do Mercado Livre com link de afiliado e dedup em `data/posted.json`.
- **`.github/workflows/ai-news-digest.yml`**: digest diário de AI/tecnologia no Telegram privado (ver abaixo), com `concurrency` e `git pull --rebase`.
- **`.github/workflows/ci.yml`**: executa `npm ci`, `npm run typecheck` e `npm test` em todo push na `main` e em pull requests.

## Digest diário de AI/tecnologia (Telegram privado)

O workflow separado `.github/workflows/ai-news-digest.yml` envia um digest por dia às **08:07, horário de São Paulo**. Ele acompanha os feeds abertos do OpenAI News, Hugging Face Blog, TechCrunch AI, GitHub Blog e Hacker News; filtra posts do GitHub para temas de AI/desenvolvimento e traduz títulos e trechos curtos para chinês tradicional via MyMemory (`de=MYMEMORY_EMAIL`), mantendo o link original. Se a tradução falhar, envia o texto original. É um resumo de manchetes e trechos — não usa LLM nem exige uma chave de IA, e não precisa manter um servidor RSSHub ligado.

O destino é independente: `TELEGRAM_NEWS_CHAT_ID` é usado somente pelo digest. O `TELEGRAM_CHAT_ID` existente continua apontando para o canal/grupo de ofertas. Para ativar o privado, use Actions → `ai-news-digest` → Run workflow:

1. Execute `identify_bot` para ver o username do bot já configurado.
2. Abra o bot no Telegram, toque em Start e envie `/start digestsetup`.
3. Execute `capture_private_chat_id`; o bot envia o ID privado somente para aquela conversa. O ID não é exibido nos logs da execução.
4. Salve esse número no repositório como secret `TELEGRAM_NEWS_CHAT_ID` em Settings → Secrets and variables → Actions.
5. Selecione `preview` para conferir sem publicar, ou `send_digest` para testar o envio privado.

A deduplicação é gravada em `data/news-digest-posted.json`, separada do histórico de ofertas.
