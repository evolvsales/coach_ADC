# Colocando o backend no n8n

Isso substitui a função serverless da Vercel (`api/roleplay.js`) por um workflow no seu n8n em
nuvem. O front-end (`index.html`, `style.css`, `app.js`) continua exatamente o mesmo — só muda pra
quem ele manda a pergunta.

## O que tem nesta pasta

- `workflow.json` — o workflow pronto pra importar no n8n (7 nós já conectados)
- `code-montar-prompt.js` — código-fonte do nó "Montar Prompt" (referência/backup — já está
  embutido dentro do `workflow.json`, não precisa colar de novo se importar o JSON)
- `code-formatar-resposta.js` e `code-formatar-erro-validacao.js` — idem, os outros dois Code nodes
- `build-workflow.js` — script que gerou o `workflow.json` a partir dos `.js` acima (só roda de
  novo se você editar os cenários/rubrica e quiser regenerar o JSON)

## Passo 1 — Importar o workflow

1. No n8n, vá em **Workflows** → menu "..." → **Import from File** (ou arraste o arquivo) e
   selecione `n8n/workflow.json`.
2. Confira se os 7 nós apareceram conectados assim:

   `Webhook → Montar Prompt → Erro de validação?` e daí se divide em dois caminhos que se
   encontram de novo no `Respond to Webhook`:
   - caminho do erro: `→ Formatar Erro de Validação → Respond to Webhook`
   - caminho normal: `→ Chamar Anthropic → Formatar Resposta → Respond to Webhook`

   Se algum nó vier com um aviso de "atualizar versão do node" (ícone amarelo), pode aceitar a
   atualização sugerida pelo próprio n8n — não deve quebrar nada aqui.

## Passo 2 — Guardar a chave de API

A chave da Anthropic é lida pelo nó **Chamar Anthropic** através de `{{ $vars.ANTHROPIC_API_KEY }}`.

1. Vá em **Settings → Variables** no seu n8n (recurso "Variables", disponível em contas Cloud com
   plano pago/trial — se você não encontrar essa seção, veja a alternativa abaixo).
2. Crie uma variável chamada exatamente `ANTHROPIC_API_KEY`, valor = sua chave (criada em
   console.anthropic.com → API Keys).

**Se seu n8n não tiver "Variables" disponível:** abra o nó **Chamar Anthropic**, vá nos
"Header Parameters", ache o header `x-api-key` e troque o valor `={{ $vars.ANTHROPIC_API_KEY }}`
por uma **Credential** do tipo "Header Auth" (mais seguro que colar a chave direto no campo) — crie
uma credencial nova com Header Name = `x-api-key` e Header Value = sua chave, e selecione essa
credencial na seção "Authentication" do nó.

## Passo 3 — Ativar e pegar a URL de produção

1. Abra o nó **Webhook** e confirme o método **POST** e o path `coach-prospeccao`.
2. Ative o workflow (toggle no canto superior direito do editor).
3. Ainda no nó Webhook, copie a **Production URL** (algo como
   `https://sua-instancia.app.n8n.cloud/webhook/coach-prospeccao`).

## Passo 4 — Apontar o front-end pra essa URL

Abra [`app.js`](../app.js), linha 4, e troque:

```js
const N8N_WEBHOOK_URL = 'https://SEU-N8N.app.n8n.cloud/webhook/coach-prospeccao';
```

pela Production URL que você copiou.

## Passo 5 — CORS (importante, senão o navegador bloqueia)

O front-end e o n8n ficam em domínios diferentes, então o navegador só deixa a página chamar o
webhook se o n8n permitir isso explicitamente (CORS). No `workflow.json` já deixamos o nó Webhook
com a opção **Allowed Origins (CORS)** = `*` (libera qualquer origem). Se depois de importar você
não achar esse campo nas Options do nó Webhook (isso varia entre versões do n8n), abra o nó
manualmente e procure por "Allowed Origins" dentro de "Options" — coloque `*`, ou o domínio exato
de onde o front-end vai rodar, se quiser restringir.

Se aparecer um erro de CORS no console do navegador (`Access-Control-Allow-Origin`), é sinal de que
essa opção não pegou — esse é o primeiro lugar a checar.

## Passo 6 — Testar

Antes de testar pela página, teste direto o webhook (troque a URL pela sua):

```bash
curl -X POST https://sua-instancia.app.n8n.cloud/webhook/coach-prospeccao \
  -H "content-type: application/json" \
  -d '{"mode":"chat","scenarioId":"1","history":[{"role":"user","content":"Boa tarde, tudo bem?"}]}'
```

Deve voltar algo como `{"text":"Boa tarde. Tudo bem, sim. Quem fala?"}`. Se voltar `{"error":
"..."}`, a mensagem já diz o que checar (chave ausente, cenário inválido etc.).

Depois disso, abra `index.html` no navegador (local mesmo, sem precisar hospedar em lugar nenhum
pra esse teste) e rode uma simulação completa.

## Sobre o webhook ser público

Assim como acontecia com a função da Vercel antes, esse endpoint do n8n fica acessível por
qualquer um que descubra a URL (ela aparece no código-fonte do `app.js` que o navegador baixa,
então não é secreta). A chave da Anthropic continua protegida (nunca sai do n8n), mas em teoria
alguém poderia chamar o webhook direto e gerar custo de uso. Pra um link de uso interno do time
isso costuma ser um risco baixo, mas se quiser reduzir: adicione um header fixo (ex:
`x-coach-token: <algum valor>`) no `fetch` do `app.js` e um nó **IF** logo após o Webhook checando
esse header antes de seguir pro resto do fluxo — é a mesma ideia da checagem de "Erro de
validação?" que já existe, só que verificando o header em vez do corpo da requisição.

## E a Vercel / api/roleplay.js?

Não são mais necessários se o backend passou a ser o n8n. `api/`, `vercel.json`, `.env.example` e
`dev-server.js` continuam no repositório como estavam (nada foi apagado), mas ficam sem uso — pode
manter como referência ou remover quando quiser, fica a seu critério. O front-end
(`index.html`, `style.css`, `app.js`) ainda precisa ficar hospedado em algum lugar (Vercel só como
site estático agora, sem função nenhuma e sem variável de ambiente — ou qualquer outro host
estático, tipo Netlify/GitHub Pages).
