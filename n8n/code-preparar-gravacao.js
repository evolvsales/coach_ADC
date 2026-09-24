/*
 * Código do nó "Preparar Gravação" (Code node, modo "Run Once for All Items").
 * Fica logo depois do nó "Formatar Resposta".
 *
 * Decide se esta resposta deve ser gravada na tabela training_sessions (só avaliações
 * bem-sucedidas do modo "evaluate", com notas estruturadas extraíveis) e, se sim, já
 * deixa os campos prontos no formato que o nó Postgres vai usar.
 *
 * Sempre preserva o "text" (ou "error") original em todo caso, pra quem vier depois
 * (o nó "Restaurar Resposta" ou o "Respond to Webhook" direto) conseguir devolver a
 * resposta certa ao vendedor independente de ter gravado no banco ou não. Também sempre
 * inclui "saved" (true/false) — o front-end usa isso pra avisar na tela quando uma
 * sessão NÃO entrou no dashboard, em vez de falhar calado.
 */

const resp = $json; // { text } ou { error }, vindo de "Formatar Resposta"
const webhookBody = $('Webhook').item.json.body || {};

if (resp.error || webhookBody.mode !== 'evaluate') {
  return [{ json: { shouldSave: false, saved: false, text: resp.text, error: resp.error } }];
}

const rawText = resp.text || '';

// Tenta várias estratégias, da mais específica pra mais genérica, porque a IA nem sempre
// segue o formato pedido à risca (às vezes esquece o "json" no cercado, às vezes deixa uma
// vírgula sobrando). Só desiste de verdade se nenhuma delas encontrar algo com "notaGeral".
function extrairNotas(texto) {
  const candidatos = [];

  for (const m of texto.matchAll(/```json\s*([\s\S]*?)\s*```/gi)) candidatos.push(m[1]);
  for (const m of texto.matchAll(/```\s*([\s\S]*?)\s*```/g)) candidatos.push(m[1]);
  const solto = texto.match(/\{[^{}]*"notaGeral"[^{}]*\}/);
  if (solto) candidatos.push(solto[0]);

  // Testa do último candidato pro primeiro — o bloco de notas é sempre a última coisa da
  // resposta, então se tiver mais de um "```...```" no texto (raro, mas acontece), o de notas
  // costuma ser o mais recente.
  for (const raw of candidatos.reverse()) {
    const limpo = raw
      .trim()
      .replace(/,\s*}/g, '}')
      .replace(/[“”]/g, '"');
    try {
      const parsed = JSON.parse(limpo);
      if (parsed && typeof parsed.notaGeral !== 'undefined') return parsed;
    } catch (e) {
      // tenta o próximo candidato
    }
  }
  return null;
}

const scores = extrairNotas(rawText);

// Tira o bloco ```json (e um eventual "## Dados..." logo antes dele) do texto que o vendedor vê
// na tela — esse bloco é só pra gente extrair as notas, não deve aparecer cru na interface.
function removerBlocoJson(texto) {
  const idx = texto.search(/```(json)?/i);
  if (idx === -1) return texto.trim();
  return texto.slice(0, idx).replace(/\n{0,2}#{1,3}[^\n]*\n*$/, '').trim();
}
const textoLimpo = removerBlocoJson(rawText);

if (!scores) {
  // Não conseguiu extrair o bloco de notas estruturadas mesmo tentando várias formas — a
  // avaliação em texto ainda vai normalmente pro vendedor, só não entra no dashboard desta vez.
  return [{ json: { shouldSave: false, saved: false, text: textoLimpo || rawText } }];
}

return [{
  json: {
    shouldSave: true,
    text: textoLimpo,
    vendedorNome: (webhookBody.vendedorNome || 'Não informado').toString().slice(0, 120),
    scenarioId: (webhookBody.scenarioId || '').toString(),
    abertura: Number(scores.abertura) || 0,
    diagnostico: Number(scores.diagnostico) || 0,
    quantificacao: Number(scores.quantificacao) || 0,
    autoridade: Number(scores.autoridade) || 0,
    valor: Number(scores.valor) || 0,
    objecoes: Number(scores.objecoes) || 0,
    proximoPasso: Number(scores.proximoPasso) || 0,
    notaGeral: Number(scores.notaGeral) || 0,
    faixa: (scores.faixa || '').toString(),
  },
}];
