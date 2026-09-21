// Função serverless (Vercel). Guarda a chave de API no servidor — NUNCA fica exposta ao navegador.
const { PERSONAS } = require('../lib/personas');
const { buildRoleplaySystemPrompt, buildEvaluationSystemPrompt } = require('../lib/prompts');

const MODEL = 'claude-sonnet-5';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada no servidor. Veja o README para configurar a variável de ambiente.',
    });
    return;
  }

  const { mode, scenarioId, history } = req.body || {};

  const persona = PERSONAS[scenarioId];
  if (!persona) {
    res.status(400).json({ error: 'Cenário inválido.' });
    return;
  }
  if (!Array.isArray(history)) {
    res.status(400).json({ error: 'Histórico da conversa ausente ou inválido.' });
    return;
  }

  let systemPrompt;
  let messages;

  if (mode === 'chat') {
    if (history.length === 0) {
      res.status(400).json({ error: 'Histórico vazio no modo chat.' });
      return;
    }
    systemPrompt = buildRoleplaySystemPrompt(persona);
    messages = history;
  } else if (mode === 'evaluate') {
    systemPrompt = buildEvaluationSystemPrompt(persona);
    messages = history.length > 0
      ? [...history, { role: 'user', content: 'Encerre a simulação e faça a avaliação completa agora, seguindo exatamente o formato pedido.' }]
      : [{ role: 'user', content: 'A ligação terminou sem nenhuma fala do vendedor — avalie isso mesmo assim, apontando que não houve tentativa de abordagem.' }];
  } else {
    res.status(400).json({ error: 'Modo inválido.' });
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === 'evaluate' ? 2200 : 350,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data?.error?.message || 'Erro na API da Anthropic.' });
      return;
    }

    const text = data?.content?.[0]?.text || '';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: `Falha ao chamar a API: ${err.message}` });
  }
};
