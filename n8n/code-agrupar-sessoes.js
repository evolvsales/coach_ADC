/*
 * Código do nó "Agrupar Sessões" (Code node, modo "Run Once for All Items").
 * Fica logo depois do nó Postgres "Buscar Sessões" (operação Select).
 *
 * O Postgres devolve uma linha do banco por item do n8n. O "Respond to Webhook" só olha
 * pro primeiro item quando usa expressão — então aqui juntamos tudo num item só, com um
 * array "sessions", que é o formato que o front-end (app.js) espera.
 */

return [{ json: { sessions: items.map((item) => item.json) } }];
