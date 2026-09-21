/*
 * Código do nó "Formatar Erro de Validação" (Code node, modo "Run Once for All Items").
 * Fica no ramo "true" do nó IF, quando "Montar Prompt" detectou um problema na requisição
 * (cenário inválido, histórico ausente, modo inválido) antes mesmo de chamar a Anthropic.
 *
 * Deixa a saída no mesmo formato que "Formatar Resposta" usa pro caso de erro, pra que os
 * dois ramos do workflow possam se conectar no mesmo nó "Respond to Webhook".
 */

const item = $input.first().json;
return [{ json: { error: item.message || 'Requisição inválida.' } }];
