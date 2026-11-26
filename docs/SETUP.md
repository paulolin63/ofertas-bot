# Setup — do zero ao primeiro post

## 1. Criar o bot no Telegram (2 min, no celular)

1. No Telegram, abra **@BotFather** → `/newbot` → dê um nome e um username (tem que terminar em `bot`, ex.: `OfertasDoLongBot`).
2. Copie o **token** que o BotFather devolve. Ele é uma credencial: guarde no cofre, nunca cole no chat nem no código.

## 2. Criar o canal e dar poder ao bot

1. Telegram → novo **canal** (recomendado: canal, não grupo — o feed fica limpo; crie um grupo de discussão separado e linke se quiser).
2. Adicione o bot como **administrador** do canal (permissão de postar mensagens).
3. Anote o identificador do canal: se for público, é `@nomedocanal`; se for privado, use o ID numérico (`-100...`, que aparece ao encaminhar uma mensagem do canal para o @userinfobot ou similar).

## 3. Credenciais da Shopee (só se for usar a Shopee já no v1)

No portal do Afiliado Shopee → acesso à API: anote `app_id` e `secret_key`. A liberação pode levar até 2 semanas. **Sem isso, rode só com ML/Amazon** (`DEAL_STORES=ml,amazon`) e ligue a Shopee depois.

## 3b. Amazon — plano C (Firecrawl com cache diário) e plano B (lista curada)

1. No portal do Associates, confirme o seu tracking ID (o mesmo do Peleia é `lin63-20`) e guarde-o como secret `AMAZON_AFFILIATE_TAG`.
2. **Plano C (recomendado, automático)**: crie uma conta gratuita em `firecrawl.dev`, copie a chave e salve como secret `FIRECRAWL_API_KEY`. O bot raspa as buscas da `amazon.com.br` e grava o resultado do dia em `data/amazon-cache.json` (cache por data BRT e keyword), consumindo ~5 créditos/dia (~110/mês) mesmo rodando 4× ao dia.
3. **Plano B (fallback sem `FIRECRAWL_API_KEY`)**: as ofertas ficam em `data/amazon-deals.json`: cada item tem `asin`, `title`, `price`, `originalPrice` e `imageUrl` opcional. O formato aceita um array direto ou `{ "checkedAt": "2026-11-17", "deals": [...] }`.
4. **Plano A (futuro)**: Product Advertising API 5.0 — em Associates Central → Tools → Product Advertising API, crie Access Key + Secret Key quando a conta atingir o requisito de vendas qualificadas.

## 4. Validar o link de afiliado do ML (obrigatório antes de ir ao ar)

O bot anexa a sua etiqueta (`matt_tool`) ao permalink do produto. Antes de automatizar, confirme que esse é mesmo o mecanismo:

1. No navegador, logado na sua conta do ML, abra o gerador oficial: `mercadolivre.com.br/afiliados/linkbuilder`.
2. Gere o link de **um** produto qualquer e copie o resultado.
3. Confira: o link gerado contém `matt_tool=SUA_ETIQUETA`? E contém algum outro parâmetro de afiliado além de `matt_tool` e `matt_word`?
4. Se houver parâmetro extra, me avise — eu ajusto o `buildAffiliateUrl` antes do primeiro post real.

A etiqueta de afiliado verificada no linkbuilder (2026-11-21) é `35439858` (matt_word=pauloclark). A antiga `97951676` (vista nos cards do Peleia) NÃO é do dono da conta — não usar.

## 5. Subir o repositório

```bash
# criar o repo paulolin63/ofertas-bot no GitHub (via navegador) e depois:
git init && git add . && git commit -m "feat: ofertas-bot v0.1"
git remote add origin https://github.com/paulolin63/ofertas-bot.git
git push -u origin main
```

## 6. Segredos no GitHub (Settings → Secrets and variables → Actions)

Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_NEWS_CHAT_ID` (p/ digest privado), `ML_AFFILIATE_TAG`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `SHOPEE_API_APP_ID`, `SHOPEE_API_SECRET`, `AMAZON_AFFILIATE_TAG`, `FIRECRAWL_API_KEY`, `MYMEMORY_EMAIL` (qualquer e-mail válido, enviado via parâmetro `de` do MyMemory para liberar 50 mil caracteres/dia).

Variables (opcional): `DEAL_KEYWORDS`, `DEAL_MIN_DISCOUNT_PCT`, `DEAL_MAX_DISCOUNT_PCT`, `DEAL_MIN_PRICE`, `DEAL_MIN_RATING`, `DEAL_MIN_SALES`, `DEAL_MAX_POSTS_PER_RUN`, `DEAL_STORES`, `ML_AFFILIATE_LABEL`, `FREEBIE_SOURCES`, `FREEBIE_MAX_PER_RUN`.

### Aplicação do ML (`ML_CLIENT_ID` / `ML_CLIENT_SECRET`) e fluxo semi-automático

A busca pública do ML devolve 403 em IPs de datacenter — testado na VM e nos runners do GitHub (2026-11-16) — e o Firecrawl recebe reCAPTCHA na busca do ML.

1. Em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br/), logado na sua conta do ML, crie uma aplicação `ofertas-bot` (Redirect URL: `https://localhost:8080/callback`; scopes: read + offline_access).
2. Anote o Client ID e o Secret Key e guarde-os como secrets `ML_CLIENT_ID` / `ML_CLIENT_SECRET` no repositório.
3. Cada execução do bot emite um access_token (`client_credentials`, válido 6h) e o envia como Bearer na busca — ver `src/ml/auth.ts`.
4. **Fluxo semi-automático (quando a busca via API continuar 403)**: em **Actions → `post-ml-deal` → Run workflow**, cole o link do produto (ou shortlink `/sec/...`), título, preço (ex.: `199,90`), preço original opcional e URL da foto opcional. O workflow gera o link de afiliado, checa duplicidade em `data/posted.json`, posta no Telegram e commita o histórico com `git pull --rebase`. Use `dry_run: true` para conferir a prévia antes de publicar.

## 7. Testar antes de automatizar

1. Crie um **canal de teste privado** com só você, ponha o bot como admin.
2. Rode o workflow manualmente (Actions → `post-deals` → Run workflow) com `dry_run: true` ou apontando `TELEGRAM_CHAT_ID` para o canal de teste, ou rode local com `npm run dry-run`.
3. Confira o primeiro post: desconto real? Link abre o produto certo? O clique aparece no painel de afiliado como seu?
4. Só então aponte para o canal oficial e deixe o agendamento ligado.
5. O workflow `.github/workflows/ci.yml` roda `npm run typecheck` e `npm test` automaticamente em pushes na `main` e em pull requests.

## Limites que o bot respeita

- Máx. 5 posts por execução, 4 execuções/dia = até 20 posts/dia.
- Intervalo de 1,5 s entre posts e timeout em todas as chamadas HTTP externas.
- Deduplicação de 30 dias por chave do item e por similaridade de título (evita repetir o mesmo produto de vendedores diferentes).
- Filtro de qualidade: preço mínimo (R$ 10), teto de desconto (85%), avaliação mínima (4.0) e vendas mínimas (10) quando informados.
- Rotação entre lojas (round-robin) para equilibrar ML, Shopee e Amazon.
- Só produtos novos no ML (usados não entram no programa de afiliados).
- Cada post de oferta carrega o selo "Link de afiliado — você paga o mesmo preço."

## 8. Digest diário de AI/tecnologia no Telegram privado

O workflow `.github/workflows/ai-news-digest.yml` roda diariamente às 08:07 em `America/Sao_Paulo`. Ele acompanha OpenAI News, Hugging Face Blog, TechCrunch AI, GitHub Blog e Hacker News; no feed geral do GitHub, mantém somente tópicos de AI/desenvolvimento. Traduz títulos e pequenos trechos para chinês tradicional pelo MyMemory (parâmetro `de=MYMEMORY_EMAIL`) e inclui os links originais. É um digest de manchetes e trechos, não uma síntese por LLM; não requer uma chave de IA nem servidor RSSHub autohospedado. Se a tradução estiver indisponível, o conteúdo original é mantido.

O envio fica separado do canal/grupo de ofertas. Não altere `TELEGRAM_CHAT_ID`; o digest usa o secret `TELEGRAM_NEWS_CHAT_ID`.

1. Em **Actions → ai-news-digest → Run workflow**, execute `identify_bot` para descobrir o username do bot existente.
2. No Telegram, abra esse bot, toque em **Start** e envie `/start digestsetup`. O Telegram exige que a pessoa inicie a conversa antes de um bot poder enviar mensagens privadas.
3. Execute `capture_private_chat_id`. O próprio bot envia o chat ID de volta nessa conversa privada; esse valor não aparece nos logs do GitHub Actions.
4. Em **Settings → Secrets and variables → Actions**, crie o repository secret `TELEGRAM_NEWS_CHAT_ID` com o número recebido.
5. Execute `preview` para conferir o texto sem enviar, ou `send_digest` para fazer o primeiro envio.

A rotina diária, quando ativada pelo secret, envia somente para esse chat privado. O histórico de links enviados fica em `data/news-digest-posted.json` (persistido com `git pull --rebase`), sem modificar `data/posted.json` ou o workflow das ofertas.
