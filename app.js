// URL de produção do webhook do n8n (nó "Webhook" do workflow em n8n/workflow.json).
// Troque pela URL real depois de importar e ativar o workflow no seu n8n
// (Settings do node Webhook -> aba "Production URL").
const N8N_WEBHOOK_URL = 'https://143.95.222.247.nip.io/webhook/coach-prospeccao';

// Lista pública dos cenários — mantenha sincronizada com n8n/code-montar-prompt.js no backend.
// Só o essencial fica aqui (nada sobre ceticismo/objeção), pra não entregar "cola" ao vendedor.
const PERSONA_LIST = [
  { id: '1', nome: 'Adriano Cella', cargo: 'Gerente de Manutenção', empresa: 'Indústria Bilu', teaser: 'Cético com fornecedores — já ouviu muita promessa vazia.' },
  { id: '2', nome: 'Diretor de Operações', cargo: 'Diretor', empresa: 'Papel & Celulose', teaser: 'Visão executiva, pouco técnico. Objeção: tempo e prioridade.' },
  { id: '3', nome: 'Coordenador jovem', cargo: 'Coordenador de Manutenção', empresa: 'Alimentos & Bebidas', teaser: 'Curioso, mas sem poder de decisão sozinho.' },
  { id: '4', nome: 'Gerente decepcionado', cargo: 'Gerente de Manutenção', empresa: 'Mineradora', teaser: 'Já tentou preditiva antes e não deu certo.' },
  { id: '5', nome: 'Orçamento apertado', cargo: 'Gerente de Manutenção', empresa: 'Metalúrgica média', teaser: 'Pergunta preço cedo demais.' },
  { id: '6', nome: 'Técnico pesado', cargo: 'Gerente de Manutenção Sênior', empresa: 'Mineração / Óleo e Gás', teaser: 'Testa com jargão técnico específico.' },
  { id: '7', nome: 'Já usa concorrente', cargo: 'Gerente de Manutenção', empresa: 'Indústria Química', teaser: '"Já temos um fornecedor, por que trocar?"' },
  { id: '8', nome: 'Gatekeeper', cargo: 'Recepção / Assistente', empresa: '—', teaser: 'A pessoa certa não está disponível.' },
];

const SCENES = {
  '1': 'Você está ligando para Adriano Cella, Gerente de Manutenção da Indústria Bilu. Ele te conectou no LinkedIn e recebeu um e-mail seu que ainda não abriu. O telefone está chamando...',
  '2': 'Você está ligando para o Diretor de Operações de uma planta de papel e celulose de médio porte. Contato frio, primeira ligação. O telefone está chamando...',
  '3': 'Você está ligando para um Coordenador de Manutenção de uma planta de alimentos e bebidas, que curtiu um post seu no LinkedIn sobre manutenção preditiva. O telefone está chamando...',
  '4': 'Você está ligando para o Gerente de Manutenção de uma mineradora de operação pesada. Contato frio. O telefone está chamando...',
  '5': 'Você está ligando para o Gerente de Manutenção de uma metalúrgica de médio porte, que também cuida de compras. Contato frio. O telefone está chamando...',
  '6': 'Você está ligando para um Gerente de Manutenção sênior de uma operação crítica 24/7 (mineração ou óleo e gás). Contato frio. O telefone está chamando...',
  '7': 'Você está ligando para o Gerente de Manutenção de uma indústria química que já contratou um concorrente há 6 meses. O telefone está chamando...',
  '8': 'Você está ligando para uma planta industrial. Quem atende é da recepção — o decisor não está disponível no momento. O telefone está chamando...',
};

let state = {
  activeTab: 'treino', // 'treino' | 'copiloto'

  // aba "Treinar"
  screen: 'select', // 'select' | 'chat' | 'eval'
  scenarioId: null,
  history: [], // {role: 'user'|'assistant', content: string} — só falas reais, sem a cena
  evaluation: '',

  // aba "Copiloto"
  copilotoScreen: 'form', // 'form' | 'result'
  copilotoConversationText: '',
  copilotoContext: '',
  copilotoResult: '',

  loading: false,
};

const app = document.getElementById('app');

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      render();
    });
  });
}

function render() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });

  if (state.activeTab === 'copiloto') {
    if (state.copilotoScreen === 'form') renderCopilotoForm();
    else renderCopilotoResult();
    return;
  }

  if (state.screen === 'select') renderSelect();
  else if (state.screen === 'chat') renderChat();
  else if (state.screen === 'eval') renderEval();
}

function renderSelect() {
  app.innerHTML = `
    <p class="intro">Escolha um cenário pra treinar:</p>
    <div class="persona-grid">
      ${PERSONA_LIST.map(p => `
        <button class="persona-card" data-id="${p.id}">
          <strong>${escapeHtml(p.nome)}</strong>
          <span class="cargo">${escapeHtml(p.cargo)} — ${escapeHtml(p.empresa)}</span>
          <span class="teaser">${escapeHtml(p.teaser)}</span>
        </button>
      `).join('')}
    </div>
  `;
  app.querySelectorAll('.persona-card').forEach(btn => {
    btn.addEventListener('click', () => startScenario(btn.dataset.id));
  });
}

function startScenario(id) {
  Object.assign(state, { screen: 'chat', scenarioId: id, history: [], evaluation: '', loading: false });
  render();
}

function renderChat() {
  app.innerHTML = `
    <button class="back-link" id="backBtn">‹ Trocar cenário</button>
    <div class="chat-log" id="chatLog"></div>
    <div class="chat-input">
      <textarea id="msgInput" placeholder="Digite ou toque no microfone para falar..." rows="2"></textarea>
      <div class="chat-actions">
        <button id="micBtn" class="icon-btn" type="button">🎙️</button>
        <button id="sendBtn" class="primary-btn" type="button">Enviar</button>
      </div>
      <button id="endBtn" class="end-btn" type="button">Encerrar e avaliar</button>
    </div>
  `;
  renderChatLog();
  document.getElementById('backBtn').addEventListener('click', () => {
    Object.assign(state, { screen: 'select', scenarioId: null, history: [], evaluation: '', loading: false });
    render();
  });
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('endBtn').addEventListener('click', endAndEvaluate);
  document.getElementById('msgInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  setupMic();
}

function renderChatLog() {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const sceneHtml = `<div class="msg scene">${escapeHtml(SCENES[state.scenarioId])}</div>`;
  const historyHtml = state.history.map(m => `<div class="msg ${m.role}">${escapeHtml(m.content)}</div>`).join('');
  const loadingHtml = state.loading ? `<div class="msg assistant loading">digitando...</div>` : '';
  log.innerHTML = sceneHtml + historyHtml + loadingHtml;
  log.scrollTop = log.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || state.loading) return;

  state.history.push({ role: 'user', content: text });
  input.value = '';
  state.loading = true;
  renderChatLog();

  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'chat', scenarioId: state.scenarioId, history: state.history }),
    });
    const data = await resp.json();
    state.loading = false;
    // O workflow do n8n sempre responde HTTP 200; erro/sucesso é diferenciado pelo
    // conteúdo do JSON ("error" vs "text") — mas ainda tratamos !resp.ok como rede de segurança
    // (ex: webhook não ativado no n8n, URL errada, etc.)
    if (!resp.ok || data.error) {
      state.history.push({ role: 'assistant', content: `⚠️ Erro: ${data.error || 'falha desconhecida'}` });
    } else {
      state.history.push({ role: 'assistant', content: data.text });
    }
  } catch (err) {
    state.loading = false;
    state.history.push({ role: 'assistant', content: `⚠️ Erro de conexão: ${err.message}` });
  }
  renderChatLog();
}

async function endAndEvaluate() {
  if (state.history.length === 0) {
    alert('Troque pelo menos uma mensagem antes de encerrar e avaliar.');
    return;
  }
  if (state.loading) return;

  state.loading = true;
  renderChatLog();

  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'evaluate', scenarioId: state.scenarioId, history: state.history }),
    });
    const data = await resp.json();
    state.loading = false;

    if (!resp.ok || data.error) {
      alert(`Erro ao avaliar: ${data.error || 'falha desconhecida'}`);
      renderChatLog();
      return;
    }
    state.evaluation = data.text;
    state.screen = 'eval';
    render();
  } catch (err) {
    state.loading = false;
    alert(`Erro de conexão: ${err.message}`);
    renderChatLog();
  }
}

function renderEval() {
  app.innerHTML = `
    <div class="eval-report">${simpleMarkdown(state.evaluation)}</div>
    <div class="eval-actions">
      <button id="newRunBtn" class="primary-btn" type="button">Nova simulação</button>
    </div>
  `;
  document.getElementById('newRunBtn').addEventListener('click', () => {
    Object.assign(state, { screen: 'select', scenarioId: null, history: [], evaluation: '', loading: false });
    render();
  });
}

function renderCopilotoForm() {
  app.innerHTML = `
    <p class="intro">Cole a conversa real com o cliente e receba sugestão de próximo passo:</p>
    <div class="copiloto-form">
      <label for="convoInput">Conversa até agora (a mensagem mais recente por último)</label>
      <textarea id="convoInput" rows="10" placeholder="Cole aqui o histórico do WhatsApp, e-mail ou LinkedIn...">${escapeHtml(state.copilotoConversationText)}</textarea>

      <label for="contextInput">Contexto adicional (opcional)</label>
      <input type="text" id="contextInput" placeholder="ex: metalúrgica pequena, já mandei e-mail semana passada..." value="${escapeHtml(state.copilotoContext)}" />
      <p class="copiloto-hint">O que você já sabe sobre a empresa/pessoa e que não está óbvio no texto colado.</p>

      <button id="analisarBtn" class="primary-btn" type="button">Analisar e sugerir</button>
    </div>
  `;
  document.getElementById('analisarBtn').addEventListener('click', analisarConversa);
}

async function analisarConversa() {
  const convoInput = document.getElementById('convoInput');
  const contextInput = document.getElementById('contextInput');
  const conversationText = convoInput.value.trim();
  const context = contextInput.value.trim();

  if (!conversationText) {
    alert('Cole a conversa antes de pedir a sugestão.');
    return;
  }
  if (state.loading) return;

  state.copilotoConversationText = conversationText;
  state.copilotoContext = context;
  state.loading = true;

  const btn = document.getElementById('analisarBtn');
  btn.disabled = true;
  btn.textContent = 'Analisando...';

  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'copilot', conversationText, context }),
    });
    const data = await resp.json();
    state.loading = false;

    if (!resp.ok || data.error) {
      alert(`Erro ao analisar: ${data.error || 'falha desconhecida'}`);
      btn.disabled = false;
      btn.textContent = 'Analisar e sugerir';
      return;
    }

    state.copilotoResult = data.text;
    state.copilotoScreen = 'result';
    render();
  } catch (err) {
    state.loading = false;
    alert(`Erro de conexão: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Analisar e sugerir';
  }
}

function renderCopilotoResult() {
  app.innerHTML = `
    <div class="eval-report">${simpleMarkdown(state.copilotoResult)}</div>
    <div class="copiloto-actions">
      <button id="copiarBtn" class="secondary-btn" type="button">Copiar tudo</button>
      <button id="novaAnaliseBtn" class="primary-btn" type="button">Nova análise</button>
    </div>
  `;
  document.getElementById('copiarBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.copilotoResult);
      const btn = document.getElementById('copiarBtn');
      const original = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch (err) {
      alert('Não foi possível copiar automaticamente — selecione o texto manualmente.');
    }
  });
  document.getElementById('novaAnaliseBtn').addEventListener('click', () => {
    Object.assign(state, {
      copilotoScreen: 'form',
      copilotoConversationText: '',
      copilotoContext: '',
      copilotoResult: '',
    });
    render();
  });
}

function setupMic() {
  const micBtn = document.getElementById('micBtn');
  const input = document.getElementById('msgInput');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.addEventListener('click', () => {
      alert('Seu navegador não suporta ditado por voz embutido. Use o microfone do próprio teclado do celular para falar direto no campo de texto.');
    });
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  recognition.continuous = false;

  let listening = false;
  micBtn.addEventListener('click', () => {
    if (listening) return;
    listening = true;
    micBtn.classList.add('listening');
    try {
      recognition.start();
    } catch (e) {
      listening = false;
      micBtn.classList.remove('listening');
    }
  });
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    input.value = (input.value ? input.value + ' ' : '') + transcript;
  };
  recognition.onerror = () => {
    listening = false;
    micBtn.classList.remove('listening');
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Conversor markdown -> html bem simples, suficiente pro formato de avaliação que o backend pede
// (títulos ##, negrito **, tabela, listas). Não é um parser markdown genérico.
function simpleMarkdown(md) {
  let html = escapeHtml(md);

  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (block) => {
    const lines = block.trim().split('\n').filter(r => !/^\|\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?$/.test(r));
    const rows = lines.map(r => r.split('|').slice(1, -1).map(c => c.trim()));
    if (rows.length === 0) return block;
    const [head, ...body] = rows;
    const thead = `<tr>${head.map(c => `<th>${c}</th>`).join('')}</tr>`;
    const tbody = body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<table>${thead}${tbody}</table>`;
  });

  html = html.replace(/((?:^- .*$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  html = html.replace(/((?:^\d+\. .*$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\.\s*/, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  html = html.split('\n\n').map(chunk => {
    const trimmed = chunk.trim();
    if (/^<h\d|^<ul|^<ol|^<table/.test(trimmed)) return chunk;
    if (!trimmed) return '';
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

initTabs();
render();
