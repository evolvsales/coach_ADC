// Script auxiliar: monta n8n/workflow.json a partir dos arquivos .js desta pasta,
// garantindo que os Code nodes fiquem com o texto corretamente "escapado" dentro do JSON.
// Rode: node n8n/build-workflow.js
// (não precisa rodar de novo, a menos que edite os scripts .js desta pasta)

const fs = require('fs');
const path = require('path');

const montarPrompt = fs.readFileSync(path.join(__dirname, 'code-montar-prompt.js'), 'utf8');
const formatarResposta = fs.readFileSync(path.join(__dirname, 'code-formatar-resposta.js'), 'utf8');
const formatarErro = fs.readFileSync(path.join(__dirname, 'code-formatar-erro-validacao.js'), 'utf8');

const workflow = {
  name: 'Coach de Prospecção - Backend',
  nodes: [
    {
      id: 'webhook1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [240, 300],
      webhookId: 'coach-prospeccao',
      parameters: {
        httpMethod: 'POST',
        path: 'coach-prospeccao',
        responseMode: 'responseNode',
        options: {
          allowedOrigins: '*',
        },
      },
    },
    {
      id: 'code1',
      name: 'Montar Prompt',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [460, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: montarPrompt,
      },
    },
    {
      id: 'if1',
      name: 'Erro de validação?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [680, 300],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
          },
          conditions: [
            {
              id: 'cond1',
              leftValue: '={{ $json.error }}',
              rightValue: true,
              operator: {
                type: 'boolean',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    },
    {
      id: 'code2',
      name: 'Formatar Erro de Validação',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [900, 180],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: formatarErro,
      },
    },
    {
      id: 'http1',
      name: 'Chamar Anthropic',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [900, 420],
      parameters: {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'content-type', value: 'application/json' },
            { name: 'anthropic-version', value: '2023-06-01' },
            { name: 'x-api-key', value: '={{ $vars.ANTHROPIC_API_KEY }}' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ { "model": "claude-sonnet-5", "max_tokens": $json.maxTokens, "system": $json.systemPrompt, "messages": $json.messages } }}',
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
            },
          },
        },
      },
    },
    {
      id: 'code3',
      name: 'Formatar Resposta',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1120, 420],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: formatarResposta,
      },
    },
    {
      id: 'respond1',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1340, 300],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ $json }}',
        options: {
          responseCode: 200,
        },
      },
    },
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'Montar Prompt', type: 'main', index: 0 }]],
    },
    'Montar Prompt': {
      main: [[{ node: 'Erro de validação?', type: 'main', index: 0 }]],
    },
    'Erro de validação?': {
      main: [
        [{ node: 'Formatar Erro de Validação', type: 'main', index: 0 }],
        [{ node: 'Chamar Anthropic', type: 'main', index: 0 }],
      ],
    },
    'Formatar Erro de Validação': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
    'Chamar Anthropic': {
      main: [[{ node: 'Formatar Resposta', type: 'main', index: 0 }]],
    },
    'Formatar Resposta': {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
    },
  },
  active: false,
  settings: {
    executionOrder: 'v1',
  },
  pinData: {},
};

const outPath = path.join(__dirname, 'workflow.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log(`Escrito: ${outPath}`);

// Sanity check: reler e validar que é JSON válido e que os jsCode batem com os arquivos-fonte.
const reparsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const code1 = reparsed.nodes.find((n) => n.id === 'code1').parameters.jsCode;
console.log('jsCode do node "Montar Prompt" bate com o arquivo-fonte:', code1 === montarPrompt);
