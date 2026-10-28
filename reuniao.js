// Aba "Reunião": capta o áudio da reunião (aba ou tela compartilhada), corta em trechos nas pausas
// da fala, manda cada trecho pro n8n (que transcreve e sugere o que dizer) e mostra tudo ao vivo.
// Depende de app.js (app, state, escapeHtml, simpleMarkdown, N8N_WEBHOOK_URL) — carregado depois dele.

const REUNIAO_THRESH = 0.01; // volume mínimo (RMS) pra considerar que alguém está falando
const REUNIAO_END_SILENCE_BUFS = 4; // ~1s de silêncio encerra o trecho
const REUNIAO_MAX_BUFS = 86; // ~22s: corta trecho muito longo mesmo sem pausa
const REUNIAO_MIN_VOICED_BUFS = 4; // trechos com menos de ~1s de fala são descartados (ruído)
const REUNIAO_PRE_ROLL = 3; // guarda ~0,75s antes da fala começar, pra não cortar a primeira sílaba
const REUNIAO_MAX_QUEUE = 4;

const TIPO_LABEL = {
  resposta_concreta: 'Resposta concreta',
  resposta_generica: 'Resposta genérica',
  dor_ou_impacto: 'Dor ou impacto',
  decisao_e_processo: 'Decisão e processo',
  objecao: 'Objeção',
  pergunta_do_cliente: 'Pergunta do cliente',
  transicao: 'Cliente falou',
};

const ETAPA_LABEL = {
  abertura: 'Abertura',
  operacao_criticidade: 'Bloco 1 · Operação e criticidade',
  como_funciona: 'Bloco 2 · Como a manutenção funciona',
  condicao_falhas: 'Bloco 3 · Condição e falhas',
  gestao_equipe: 'Bloco 4 · Gestão e equipe',
  dor_prioritaria: 'Bloco 5 · Dor prioritária',
  microdiagnostico: 'Microdiagnóstico',
  fechamento: 'Fechamento',
};

const reuniao = {
  screen: 'setup', // 'setup' | 'live' | 'summary'
  context: '',
  consent: false,
  lines: [], // { who: 'cliente' | 'vendedor', text }
  cards: [], // { tipo, fala, sugestao, insight, perguntas }
  pending: 0,
  status: '',
  error: '',
  summary: '',
  summaryLoading: false,
};

const reuniaoEngine = {
  stream: null,
  ctx: null,
  processor: null,
  running: false,
  sampleRate: 16000,
  pre: [],
  seg: null,
  queue: [],
  busy: false,
};

function renderReuniao() {
  if (reuniao.screen === 'live') return renderReuniaoLive();
  if (reuniao.screen === 'summary') return renderReuniaoSummary();
  renderReuniaoSetup();
}

function renderReuniaoSetup() {
  app.innerHTML = `
    <p class="intro">Copiloto de reunião — acompanha a reunião diagnóstica ao vivo</p>
    <div class="reuniao-steps">
      <strong>Como usar (computador, Chrome ou Edge):</strong>
      <ol>
        <li>Abra o Coach numa <strong>janela separada</strong>, ao lado da reunião.</li>
        <li>Clique em <strong>Iniciar escuta</strong>. Na janela do navegador, escolha <strong>Tela inteira</strong> (Teams instalado no computador) ou a <strong>aba</strong> do Teams (Teams no navegador).</li>
        <li><strong>Marque "Compartilhar áudio do sistema"</strong> (ou "da guia") antes de confirmar. Sem isso o app não ouve o cliente.</li>
      </ol>
      <p class="copiloto-hint">O app escuta só o áudio que sai da reunião (a voz do cliente). A sua voz não é captada: se quiser que ela entre no contexto, registre num campo durante a reunião.</p>
    </div>
    <div class="copiloto-form">
      <label for="reuniaoContext">Contexto da reunião (opcional)</label>
      <input type="text" id="reuniaoContext" placeholder="ex: Gerente de manutenção da Metalúrgica X, 1ª demo, quer reduzir paradas" value="${escapeHtml(reuniao.context)}" />
      <label class="reuniao-consent"><input type="checkbox" id="reuniaoConsent" ${reuniao.consent ? 'checked' : ''} /> Avisei os participantes que a reunião está sendo transcrita por IA.</label>
      ${reuniao.error ? `<p class="save-status save-fail">${escapeHtml(reuniao.error)}</p>` : ''}
      <button id="reuniaoStartBtn" class="primary-btn" type="button">Iniciar escuta</button>
    </div>
  `;
  document.getElementById('reuniaoContext').addEventListener('input', (e) => { reuniao.context = e.target.value; });
  document.getElementById('reuniaoConsent').addEventListener('change', (e) => { reuniao.consent = e.target.checked; });
  document.getElementById('reuniaoStartBtn').addEventListener('click', startReuniao);
}

function renderReuniaoLive() {
  app.innerHTML = `
    <div class="reuniao-bar">
      <span class="reuniao-live"><span class="reuniao-dot"></span> Escutando</span>
      <div class="reuniao-meter" title="Nível do áudio que está chegando"><div id="reuniaoMeterBar"></div></div>
      <span id="reuniaoStatus" class="reuniao-status"></span>
    </div>
    <div id="reuniaoCards"></div>
    <div class="reuniao-actions">
      <button id="reuniaoAskBtn" class="secondary-btn" type="button">Pedir sugestão agora</button>
      <button id="reuniaoEndBtn" class="end-btn" type="button">Encerrar reunião</button>
    </div>
    <div class="reuniao-note">
      <input type="text" id="reuniaoNote" placeholder="Registrar o que eu falei / anotar (Enter)" />
    </div>
    <p class="intro" style="margin-top:14px;">Transcrição</p>
    <div id="reuniaoTranscript" class="reuniao-transcript"></div>
  `;
  document.getElementById('reuniaoAskBtn').addEventListener('click', pedirSugestaoAgora);
  document.getElementById('reuniaoEndBtn').addEventListener('click', encerrarReuniao);
  const note = document.getElementById('reuniaoNote');
  note.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const text = note.value.trim();
    if (!text) return;
    reuniao.lines.push({ who: 'vendedor', text });
    note.value = '';
    updateReuniaoUI();
  });
  updateReuniaoUI();
}

function updateReuniaoUI() {
  if (state.activeTab !== 'reuniao' || reuniao.screen !== 'live') return;

  const statusEl = document.getElementById('reuniaoStatus');
  if (statusEl) {
    const parts = [];
    if (reuniao.pending > 0) parts.push(`${reuniao.pending} trecho(s) processando`);
    if (reuniao.status) parts.push(reuniao.status);
    statusEl.textContent = parts.join(' · ');
  }

  const cardsEl = document.getElementById('reuniaoCards');
  if (cardsEl) {
    if (reuniao.cards.length === 0) {
      cardsEl.innerHTML = `<div class="reuniao-card empty">As sugestões aparecem aqui assim que o cliente falar.</div>`;
    } else {
      const [atual, ...anteriores] = reuniao.cards;
      cardsEl.innerHTML = reuniaoCardHtml(atual, true) +
        (anteriores.length ? `<p class="copiloto-hint" style="margin:10px 0 6px;">Anteriores</p>${anteriores.map((c) => reuniaoCardHtml(c, false)).join('')}` : '');
    }
  }

  const trEl = document.getElementById('reuniaoTranscript');
  if (trEl) {
    const stick = trEl.scrollTop + trEl.clientHeight >= trEl.scrollHeight - 20;
    trEl.innerHTML = reuniao.lines.length === 0
      ? `<p class="copiloto-hint">Ainda sem falas.</p>`
      : reuniao.lines.map((l) => `<p class="reuniao-line ${l.who}"><strong>${l.who === 'cliente' ? 'Cliente' : 'Vendedor'}:</strong> ${escapeHtml(l.text)}</p>`).join('');
    if (stick) trEl.scrollTop = trEl.scrollHeight;
  }
}

function reuniaoCardHtml(c, destaque) {
  return `
    <div class="reuniao-card ${destaque ? 'main' : ''}">
      <span class="reuniao-tag">${escapeHtml(TIPO_LABEL[c.tipo] || 'Cliente falou')}</span>
      ${ETAPA_LABEL[c.etapa] ? `<span class="reuniao-tag etapa">${escapeHtml(ETAPA_LABEL[c.etapa])}</span>` : ''}
      ${c.fala ? `<p class="reuniao-fala">“${escapeHtml(c.fala)}”</p>` : ''}
      ${c.alerta ? `<p class="reuniao-alerta">⚠️ ${escapeHtml(c.alerta)}</p>` : ''}
      ${c.sugestao ? `<p class="reuniao-sug"><strong>Diga:</strong> ${escapeHtml(c.sugestao)}</p>` : ''}
      ${c.proxima_pergunta ? `<p class="reuniao-pergunta"><strong>Pergunte:</strong> ${escapeHtml(c.proxima_pergunta)}</p>` : ''}
      ${c.insight ? `<p class="reuniao-insight">💡 ${escapeHtml(c.insight)}</p>` : ''}
    </div>`;
}

function updateReuniaoMeter(rms) {
  const bar = document.getElementById('reuniaoMeterBar');
  if (bar) bar.style.width = `${Math.min(100, Math.round(rms * 600))}%`;
}

async function startReuniao() {
  reuniao.error = '';
  if (!reuniao.consent) {
    reuniao.error = 'Confirme que avisou os participantes sobre a transcrição antes de iniciar.';
    renderReuniao();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    reuniao.error = 'Este navegador não consegue captar o áudio da reunião. Use o Google Chrome ou o Microsoft Edge no computador.';
    renderReuniao();
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (err) {
    reuniao.error = 'O compartilhamento foi cancelado ou bloqueado. Clique em Iniciar escuta de novo e escolha o que compartilhar.';
    renderReuniao();
    return;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    reuniao.error = 'O compartilhamento veio sem áudio. Tente de novo e marque "Compartilhar áudio do sistema" (tela inteira) ou "da guia" (aba).';
    renderReuniao();
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  Object.assign(reuniaoEngine, { stream, ctx, processor, running: true, sampleRate: ctx.sampleRate, pre: [], seg: null, queue: [], busy: false });
  Object.assign(reuniao, { screen: 'live', lines: [], cards: [], pending: 0, status: '', summary: '', summaryLoading: false });

  processor.onaudioprocess = (e) => {
    if (!reuniaoEngine.running) return;
    const buf = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    updateReuniaoMeter(rms);
    const voiced = rms > REUNIAO_THRESH;
    const eng = reuniaoEngine;

    if (!eng.seg) {
      eng.pre.push(buf);
      if (eng.pre.length > REUNIAO_PRE_ROLL) eng.pre.shift();
      if (voiced) {
        eng.seg = { bufs: eng.pre.slice(), voiced: 1, silent: 0 };
        eng.pre = [];
      }
      return;
    }

    eng.seg.bufs.push(buf);
    if (voiced) { eng.seg.voiced++; eng.seg.silent = 0; } else { eng.seg.silent++; }
    if (eng.seg.silent >= REUNIAO_END_SILENCE_BUFS || eng.seg.bufs.length >= REUNIAO_MAX_BUFS) finishReuniaoSegment();
  };

  // Se a pessoa clicar em "Parar compartilhamento" na barra do navegador, encerra a reunião direito.
  stream.getTracks().forEach((t) => t.addEventListener('ended', () => {
    if (reuniaoEngine.running) encerrarReuniao();
  }));

  render();
}

function finishReuniaoSegment() {
  const eng = reuniaoEngine;
  const seg = eng.seg;
  eng.seg = null;
  if (!seg || seg.voiced < REUNIAO_MIN_VOICED_BUFS) return;
  const b64 = encodeWavBase64(seg.bufs, eng.sampleRate);
  eng.queue.push(b64);
  if (eng.queue.length > REUNIAO_MAX_QUEUE) eng.queue.shift();
  reuniao.pending = eng.queue.length + (eng.busy ? 1 : 0);
  updateReuniaoUI();
  processReuniaoQueue();
}

function encodeWavBase64(bufs, sampleRate) {
  let total = 0;
  bufs.forEach((b) => { total += b.length; });
  const pcm = new Int16Array(total);
  let offset = 0;
  bufs.forEach((b) => {
    for (let i = 0; i < b.length; i++) {
      const s = Math.max(-1, Math.min(1, b[i]));
      pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  });
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const write = (pos, str) => { for (let i = 0; i < str.length; i++) v.setUint8(pos + i, str.charCodeAt(i)); };
  write(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, 'data');
  v.setUint32(40, pcm.length * 2, true);

  const bytes = new Uint8Array(44 + pcm.length * 2);
  bytes.set(new Uint8Array(header), 0);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function reuniaoTranscriptText() {
  return reuniao.lines.slice(-40).map((l) => `${l.who === 'cliente' ? 'Cliente' : 'Vendedor'}: ${l.text}`).join('\n');
}

async function processReuniaoQueue() {
  const eng = reuniaoEngine;
  if (eng.busy) return;
  eng.busy = true;
  while (eng.queue.length > 0) {
    const b64 = eng.queue.shift();
    reuniao.pending = eng.queue.length + 1;
    updateReuniaoUI();
    try {
      await enviarReuniao({ audio: { data: b64, mimeType: 'audio/wav' } });
    } catch (err) {
      reuniao.status = `Falha num trecho: ${err.message}`;
    }
  }
  eng.busy = false;
  reuniao.pending = 0;
  updateReuniaoUI();
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (e) { /* tenta extrair o objeto */ }
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* cai no null */ } }
  return null;
}

async function enviarReuniao({ audio } = {}) {
  const resp = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'meeting', transcript: reuniaoTranscriptText(), audio, context: reuniao.context }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error || data.message || 'falha desconhecida');

  const r = parseJsonLoose(data.text);
  if (!r) throw new Error('resposta em formato inesperado');
  reuniao.status = '';

  const fala = (r.fala || '').toString().trim();
  if (fala) reuniao.lines.push({ who: 'cliente', text: fala });

  if (r.sugestao || r.insight || r.proxima_pergunta || r.alerta) {
    reuniao.cards.unshift({
      tipo: r.tipo,
      etapa: r.etapa,
      fala,
      sugestao: r.sugestao,
      proxima_pergunta: r.proxima_pergunta,
      insight: r.insight,
      alerta: r.alerta,
    });
    if (reuniao.cards.length > 8) reuniao.cards.pop();
  }
  updateReuniaoUI();
}

async function pedirSugestaoAgora() {
  if (reuniao.lines.length === 0) {
    reuniao.status = 'Ainda não há conversa pra analisar.';
    updateReuniaoUI();
    return;
  }
  reuniao.status = 'Gerando sugestão...';
  updateReuniaoUI();
  try {
    await enviarReuniao({});
  } catch (err) {
    reuniao.status = `Falha ao gerar sugestão: ${err.message}`;
    updateReuniaoUI();
  }
}

async function encerrarReuniao() {
  const eng = reuniaoEngine;
  if (!eng.running) return;
  if (eng.seg) finishReuniaoSegment();
  eng.running = false;
  if (eng.processor) eng.processor.onaudioprocess = null;
  if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
  if (eng.ctx) { try { eng.ctx.close(); } catch (e) { /* já fechado */ } }

  reuniao.status = 'Finalizando os últimos trechos...';
  updateReuniaoUI();
  while (eng.busy || eng.queue.length > 0) {
    await new Promise((r) => setTimeout(r, 300));
  }

  if (reuniao.lines.length === 0) {
    Object.assign(reuniao, { screen: 'setup', status: '' });
    render();
    return;
  }

  Object.assign(reuniao, { screen: 'summary', summary: '', summaryLoading: true, status: '' });
  render();
  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'meeting_summary',
        transcript: reuniao.lines.map((l) => `${l.who === 'cliente' ? 'Cliente' : 'Vendedor'}: ${l.text}`).join('\n'),
        context: reuniao.context,
      }),
    });
    const data = await resp.json();
    reuniao.summary = (!resp.ok || data.error)
      ? `⚠️ Não consegui gerar o resumo: ${data.error || data.message || 'falha desconhecida'}`
      : data.text;
  } catch (err) {
    reuniao.summary = `⚠️ Erro de conexão ao gerar o resumo: ${err.message}`;
  }
  reuniao.summaryLoading = false;
  if (state.activeTab === 'reuniao') render();
}

function renderReuniaoSummary() {
  if (reuniao.summaryLoading) {
    app.innerHTML = `<p class="intro">Reunião encerrada. Gerando o resumo...</p>`;
    return;
  }
  app.innerHTML = `
    <div class="eval-report">${simpleMarkdown(reuniao.summary)}</div>
    <div class="copiloto-actions">
      <button id="reuniaoCopySummary" class="secondary-btn" type="button">Copiar resumo</button>
      <button id="reuniaoCopyTranscript" class="secondary-btn" type="button">Copiar transcrição</button>
      <button id="reuniaoNewBtn" class="primary-btn" type="button">Nova reunião</button>
    </div>
  `;
  const copiar = async (texto, btnId) => {
    try {
      await navigator.clipboard.writeText(texto);
      const btn = document.getElementById(btnId);
      const original = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch (err) {
      alert('Não foi possível copiar automaticamente — selecione o texto manualmente.');
    }
  };
  document.getElementById('reuniaoCopySummary').addEventListener('click', () => copiar(reuniao.summary, 'reuniaoCopySummary'));
  document.getElementById('reuniaoCopyTranscript').addEventListener('click', () => {
    copiar(reuniao.lines.map((l) => `${l.who === 'cliente' ? 'Cliente' : 'Vendedor'}: ${l.text}`).join('\n'), 'reuniaoCopyTranscript');
  });
  document.getElementById('reuniaoNewBtn').addEventListener('click', () => {
    Object.assign(reuniao, { screen: 'setup', lines: [], cards: [], summary: '', error: '', status: '' });
    render();
  });
}
