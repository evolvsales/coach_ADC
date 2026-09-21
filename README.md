# Coach de Prospecção — Manutenção Preditiva (web app)

Página web onde o time de pré-vendas:

- **treina** ligações de prospecção — escolhe um perfil de cliente, conversa (digitando ou falando
  pelo microfone) com uma IA que interpreta o prospect de forma realista, e ao encerrar recebe uma
  avaliação com pontos positivos, pontos de melhoria e notas por critério;
- usa o **Copiloto** — cola uma conversa real que está tendo com um cliente de verdade e recebe
  diagnóstico, melhor caminho a seguir, uma sugestão de resposta pronta e perguntas pra avançar.

## Arquitetura

```
Navegador (index.html/app.js) → webhook do n8n → API da Anthropic
        ↑ hospedado estático              ↑ hospedado no VPS (Hostgator),
          na Vercel (grátis)                onde o n8n já roda outras automações
```

O front-end é só HTML/CSS/JS estático — **nenhuma chave de API fica nele**. Toda a inteligência
(escolher a persona certa, montar o prompt, chamar a Anthropic, formatar a avaliação) roda dentro
de um workflow do n8n, hospedado no VPS da empresa. Isso está detalhado em
[`n8n/GUIA-N8N.md`](n8n/GUIA-N8N.md) — comece por ali se ainda não importou o workflow.

## Publicando o front-end (Vercel, estático, grátis)

Como não há mais função serverless nem chave de API aqui, o deploy é bem simples — é só um site
estático.

1. Entre em vercel.com, crie conta/login.
2. Clique em "Add New" → "Project".
3. Suba esta pasta (`webapp-coach-prospeccao`) — upload direto, ou conectando um repositório Git.
4. Em "Framework Preset", deixe como **Other**. Não precisa comando de build, diretório de saída
   nem nenhuma variável de ambiente.
5. Clique em "Deploy". Em 1-2 minutos você recebe um link público (algo como
   `https://coach-prospeccao-xxxx.vercel.app`) — esse é o link que o time vai usar. HTTPS já vem
   pronto automaticamente, o que é importante: o botão de microfone só funciona em página segura
   (HTTPS).

Alternativa pelo terminal:

```bash
npm install -g vercel
cd webapp-coach-prospeccao
vercel --prod
```

Se um dia vocês quiserem um domínio próprio nisso (ex: `coach.suaempresa.com.br`), dá pra apontar
depois nas configurações do projeto na Vercel, sem custo extra e sem precisar mexer em mais nada.

## Antes de publicar: aponte pro webhook certo

Abra [`app.js`](app.js), linha 4:

```js
const N8N_WEBHOOK_URL = 'https://SEU-N8N.app.n8n.cloud/webhook/coach-prospeccao';
```

Troque pela **Production URL** do webhook do n8n (você pega isso depois de importar e ativar o
workflow — passo a passo em [`n8n/GUIA-N8N.md`](n8n/GUIA-N8N.md)). Publique de novo depois de
trocar (`vercel --prod`, ou push se estiver conectado a um repositório Git).

## Testar antes de liberar pro time

Abra o link publicado no celular, escolha um cenário, converse um pouco (o botão de microfone 🎙️
usa o reconhecimento de voz do navegador — funciona bem no Chrome/Android; em navegadores sem
suporte, o próprio microfone do teclado do celular funciona igual dentro do campo de texto). Clique
em "Encerrar e avaliar" e confira se a avaliação sai coerente. Teste também a aba "Copiloto",
colando uma conversa de exemplo.

## Como o projeto é organizado

```
webapp-coach-prospeccao/
  index.html, style.css, app.js   → todo o front-end (treino + copiloto)
  n8n/
    workflow.json                  → o workflow pronto pra importar no n8n
    GUIA-N8N.md                    → passo a passo de configuração no n8n
    code-*.js                      → código-fonte de cada Code node (referência/backup)
    build-workflow.js              → regenera o workflow.json se você editar os code-*.js

  # Legado — de quando o backend rodava na Vercel, antes da migração pro n8n.
  # Não é mais usado pelo front-end (app.js chama o webhook do n8n agora), mas
  # fica no repositório como referência. Pode remover quando quiser.
  api/roleplay.js, lib/, vercel.json, .env.example, dev-server.js
```

## Editando os cenários ou a rubrica

Como o backend agora é o n8n, os cenários (as 8 personas) e a rubrica de avaliação vivem dentro do
código do nó **"Montar Prompt"** do workflow — não mais em `lib/`.

Pra editar:
1. Altere `n8n/code-montar-prompt.js` (fonte de verdade das personas, regras de roleplay e rubrica).
2. Rode `node n8n/build-workflow.js` pra regenerar `n8n/workflow.json`.
3. Reimporte esse `workflow.json` no n8n (ou copie o novo conteúdo direto pro nó "Montar Prompt").
4. Se mudou nomes/descrições das personas, atualize também `PERSONA_LIST` e `SCENES` no topo de
   `app.js` (o que aparece na tela de escolha do front-end) — mantenha os dois em sincronia, sem
   revelar ali o campo `brief`, que é o "gabarito" de como o prospect reage.

## Sobre custo

Cada sessão de treino ou análise no Copiloto consome tokens de entrada e saída na API da Anthropic
— cobrança por uso, configurada como variável no n8n (`ANTHROPIC_API_KEY`), não no front-end. O
modelo usado por padrão é o `claude-sonnet-5`. Pra reduzir custo, dá pra trocar o `model` usado no
nó **Chamar Anthropic** (dentro do workflow do n8n) para `claude-haiku-4-5-20251001` — vale testar
se a qualidade continua boa o suficiente antes de trocar em produção. Valores exatos por token em
anthropic.com/pricing.

## Segurança

A chave de API só existe dentro do n8n (variável `ANTHROPIC_API_KEY` ou credencial "Header Auth" —
veja `n8n/GUIA-N8N.md`), nunca no front-end. O webhook do n8n fica publicamente acessível (a URL
aparece no código-fonte que o navegador baixa), então trate isso como um link de uso interno do
time, não algo pra divulgar publicamente — detalhes e uma opção de reforço com token estão no fim
do `n8n/GUIA-N8N.md`.
