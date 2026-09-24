/*
 * Código do nó "Restaurar Resposta" (Code node, modo "Run Once for All Items").
 * Fica logo depois do nó Postgres "Salvar Sessão".
 *
 * O nó Postgres substitui o $json pelo registro que acabou de inserir no banco — então
 * este nó só busca de volta o texto original (guardado no nó "Preparar Gravação") pra
 * devolver ao vendedor exatamente a mesma resposta que ele receberia se não gravássemos
 * nada no banco.
 */

const text = $('Preparar Gravação').item.json.text;
return [{ json: { text, saved: true } }];
