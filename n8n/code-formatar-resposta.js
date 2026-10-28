// Nó "Formatar Resposta" (Code, "Run Once for All Items"), logo depois do HTTP Request do Gemini.
// O HTTP Request precisa de "Include Response Headers and Status" e "Never Error" ligados.
// Sucesso -> { text }  |  Erro -> { error }. Partes "thought" (raciocínio interno) são ignoradas.

const item = $input.first().json;
const statusCode = item.statusCode;
const body = item.body || {};

if (statusCode >= 400) {
  const message = (body.error && body.error.message) || `Erro ${statusCode} na API do Gemini.`;
  return [{ json: { error: message } }];
}

const candidate = Array.isArray(body.candidates) ? body.candidates[0] : null;
const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
const text = parts
  .filter((p) => typeof p.text === 'string' && !p.thought)
  .map((p) => p.text)
  .join('');

if (!text) {
  const motivo =
    (candidate && candidate.finishReason) ||
    (body.promptFeedback && body.promptFeedback.blockReason) ||
    'resposta vazia';
  return [{ json: { error: `O Gemini não retornou texto (${motivo}). Tente de novo.` } }];
}

return [{ json: { text } }];
