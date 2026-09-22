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
 * resposta certa ao vendedor independente de ter gravado no banco ou não.
 */

const resp = $json; // { text } ou { error }, vindo de "Formatar Resposta"
const webhookBody = $('Webhook').item.json.body || {};

if (resp.error || webhookBody.mode !== 'evaluate') {
  return [{ json: { shouldSave: false, text: resp.text, error: resp.error } }];
}

const match = (resp.text || '').match(/```json\s*([\s\S]*?)\s*```/);
let scores = null;
if (match) {
  try {
    scores = JSON.parse(match[1]);
  } catch (e) {
    scores = null;
  }
}

// Tira o bloco ```json (e um eventual "## Dados..." logo antes dele) do texto que o vendedor vê
// na tela — esse bloco é só pra gente extrair as notas, não deve aparecer cru na interface.
function removerBlocoJson(texto) {
  if (!texto) return texto;
  const idx = texto.indexOf('```json');
  if (idx === -1) return texto.trim();
  return texto.slice(0, idx).replace(/\n{0,2}#{1,3}[^\n]*\n*$/, '').trim();
}
const textoLimpo = removerBlocoJson(resp.text);

if (!scores) {
  // Não conseguiu extrair o bloco de notas estruturadas — a avaliação em texto ainda
  // vai normalmente pro vendedor, só não entra no dashboard desta vez.
  return [{ json: { shouldSave: false, text: textoLimpo || resp.text } }];
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
