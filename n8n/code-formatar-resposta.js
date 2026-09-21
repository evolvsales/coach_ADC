/*
 * Código do nó "Formatar Resposta" (Code node, modo "Run Once for All Items").
 * Fica logo depois do nó HTTP Request que chama a API da Anthropic.
 *
 * O nó HTTP Request deve estar configurado com Options → Response →
 * "Full Response" = true e "Never Error" = true. Isso faz o item chegar aqui como
 * { statusCode, headers, body } SEMPRE (sucesso ou erro da Anthropic), sem o node
 * lançar exceção — mais estável entre versões do n8n do que depender de "Continue On Fail".
 *
 * Para manter o "Respond to Webhook" simples (sempre responde HTTP 200, sem precisar de
 * código de status dinâmico), erro e sucesso são diferenciados pelo CONTEÚDO do JSON:
 *   sucesso  -> { text: "..." }
 *   erro     -> { error: "..." }
 * O front-end (app.js) já está preparado pra checar a presença do campo "error".
 */

const item = $input.first().json;
const statusCode = item.statusCode;
const body = item.body || {};

if (statusCode >= 400) {
  const message = (body.error && body.error.message) || `Erro ${statusCode} na API da Anthropic.`;
  return [{ json: { error: message } }];
}

const text = (body.content && body.content[0] && body.content[0].text) || '';
return [{ json: { text } }];
