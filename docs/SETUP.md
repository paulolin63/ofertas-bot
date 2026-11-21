# Setup — do zero ao primeiro post

## 1. Criar o bot no Telegram (2 min, no celular)

1. No Telegram, abra **@BotFather** → `/newbot` → dê um nome e um username (tem que terminar em `bot`, ex.: `OfertasDoLongBot`).
2. Copie o **token** que o BotFather devolve. Ele é uma credencial: guarde no cofre, nunca cole no chat nem no código.

## 2. Criar o canal e dar poder ao bot

1. Telegram → novo **canal** (recomendado: canal, não grupo — o feed fica limpo; crie um grupo de discussão separado e linke se quiser).
2. Adicione o bot como **administrador** do canal (permissão de postar mensagens).
3. Anote o identificador do canal: se for público, é `@nomedocanal`; se for privado, use o ID numérico (`-100...`, que aparece ao encaminhar uma mensagem do canal para o @userinfobot ou similar).

## 3. Credenciais da Shopee (só se for usar a Shopee já no v1)

No portal do Afiliado Shopee → acesso à API: anote `app_id` e `secret_key`. A liberação pode levar até 2 semanas. **Sem isso, rode só com ML** (`DEAL_STORES=ml`) e ligue a Shopee depois.

## 3b. Amazon — plano B (lista curada, sem PA-API)

1. No portal do Associates, confirme o seu tracking ID (o mesmo do Peleia é `lin63-20`) e guarde-o como secret `AMAZON_AFFILIATE_TAG`.
2. As ofertas ficam em `data/amazon-deals.json`: cada item tem `asin`, `title`, `price`, `originalPrice` e `imageUrl` opcional. O formato aceita um array direto ou `{ "checkedAt": "2026-11-17", "deals": [...] }`.
3. **Como refrescar**: no navegador, abra a amazon.com.br, busque as palavras-chave do bot e anote os produtos com desconto real (preço "de" riscado ≥ 20%). O ASIN é o código de 10 caracteres na URL (`/dp/B0...`). Substitua os itens do arquivo e commite.
4. Plano A (futuro): Product Advertising API 5.0 — em Associates Central → Tools → Product Advertising API, crie Access Key + Secret Key. Exige 3 vendas qualificadas em 180 dias para devolver dados; as chaves levam 48–72 h para ativar.

## 4. Validar o link de afiliado do ML (obrigatório antes de ir ao ar)

O bot anexa a sua etiqueta (`matt_tool`) ao permalink do produto. Antes de automatizar, confirme que esse é mesmo o mecanismo:

1. No navegador, logado na sua conta do ML, abra o gerador oficial: `mercadolivre.com.br/afiliados/linkbuilder`.
2. Gere o link de **um** produto qualquer e copie o resultado.
3. Confira: o link gerado contém `matt_tool=SUA_ETIQUETA`? E contém algum outro parâmetro de afiliado além de `matt_tool` e `matt_word`?
4. Se houver parâmetro extra, me avise — eu ajusto o `buildAffiliateUrl` antes do primeiro post real.

A etiqueta oficial do Mercado Livre é `35439858` (pauloclark) — o bot anexa `matt_tool=35439858`.

## 5. Subir o repositório

```bash
# criar o repo paulolin63/ofertas-bot no GitHub (via navegador) e depois:
git init && git add . && git commit -m "feat: ofertas-bot v0.1"
git remote add origin https://github.com/paulolin63/ofertas-bot.git
git push -u origin main
```

## 6. Segredos no GitHub (Settings → Secrets and variables → Actions)

Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ML_AFFILIATE_TAG`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `SHOPEE_API_APP_ID`, `SHOPEE_API_SECRET`, `AMAZON_AFFILIATE_TAG`.
Variables (opcional): `DEAL_KEYWORDS`, `DEAL_MIN_DISCOUNT_PCT`, `DEAL_MAX_POSTS_PER_RUN`, `DEAL_STORES`, `ML_AFFILIATE_LABEL`.

### Aplicação do ML (ML_CLIENT_ID / ML_CLIENT_SECRET)

A busca pública do ML devolve 403 em IPs de datacenter — testado na VM e nos runners do GitHub (2026-11-16). A tentativa B é buscar autenticado:

1. Em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br/), logado na sua conta do ML, crie uma aplicação `ofertas-bot` (Redirect URL: `https://localhost:8080/callback`; scopes: read + offline_access).
2. Anote o Client ID e o Secret Key e guarde-os como secrets `ML_CLIENT_ID` / `ML_CLIENT_SECRET` no repositório.
3. Cada execução do bot emite um access_token (client_credentials, válido 6h) e o envia como Bearer na busca — ver `src/ml/auth.ts`.
4. Se o log mostrar que o token foi emitido mas a busca continua 403, a tentativa B falhou: o plano C é buscar as ofertas pelo navegador (que abre o ML normalmente) em vez da API.

## 7. Testar antes de automatizar

1. Crie um **canal de teste privado** com só você, ponha o bot como admin.
2. Rode o workflow manualmente (Actions → post-deals → Run workflow) com `TELEGRAM_CHAT_ID` do canal de teste, ou rode local com `--dry-run` para ver o texto sem postar.
3. Confira o primeiro post: desconto real? Link abre o produto certo? O clique aparece no painel de afiliado como seu?
4. Só então aponte para o canal oficial e deixe o agendamento ligado.

## Limites que o bot respeita

- Máx. 5 posts por execução, 4 execuções/dia = até 20 posts/dia.
- Intervalo de 1,5 s entre posts.
- Deduplicação de 30 dias por oferta.
- Só produtos novos no ML (usados não entram no programa de afiliados).
- Cada post carrega o selo "Link de afiliado — você paga o mesmo preço."
