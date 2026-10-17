import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';

const AI_API = '/ai/v1/chat/completions';
const AI_KEY = 'sk-apx1cc634f9c54279f25b55b39e5e2e854e798d2782b24796e';
const AI_MODEL = 'free/glm-5.3-flash';
const STORAGE_KEY = 'spokum.ai_chat.history';
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `Ты - ИИ-помощник в приложении СпокУм. СпокУм - это социальная сеть про спокойствие и настроение. Твоя задача - поддерживать пользователей, обсуждать темы, помогать с эмоциями и просто общаться.

Правила:
- Ты НЕ можешь писать код, программировать или давать технические инструкции
- Ты НЕ можешь обсуждать политику, религию или спорные темы
- Ты НЕ можешь давать медицинские советы или ставить диагнозы
- Ты ДОЛЖЕН быть добрым, эмпатичным и спокойным
- Ты ДОЛЖЕН общаться на русском языке
- Ты МОЖЕШЬ обсуждать эмоции, настроение, отношения, хобби, книги, фильмы, музыку
- Ты МОЖЕШЬ поддержать в трудную минуту, выслушать, дать мягкий совет
- Ты ДОЛЖЕН помнить, что ты часть СпокУма - соцсети про спокойствие
- Если тебя просят написать код - вежливо откажись и предложи обсудить что-то другое
- Отвечай кратко и по делу, не более 3-4 предложений обычно`;

function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data.slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(msgs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY))); } catch {}
}

export async function openAIChat() {
  const host = el(`
    <div class="col" style="height:100%;gap:0;padding:0">
      <div style="padding:8px 12px;background:var(--bg-2);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center">${icon('spark', 16)}</div>
        <div class="grow">
          <div class="strong small">AI Помощник</div>
          <div class="tiny muted" id="ai-status">Онлайн</div>
        </div>
        <button class="btn btn-sm" id="ai-clear" style="padding:4px 8px;font-size:11px">Очистить</button>
      </div>
      <div id="ai-messages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:300px"></div>
      <div style="padding:8px 12px;background:var(--bg-2);border-top:1px solid var(--line);flex-shrink:0">
        <div class="row" style="gap:8px">
          <input class="input grow" id="ai-input" placeholder="Напишите сообщение..." maxlength="500" style="font-size:14px">
          <button class="btn btn-primary btn-icon" id="ai-send">${icon('send', 18)}</button>
        </div>
      </div>
    </div>
  `);
  const sheet = openSheet('AI чат', host, {});

  const messagesEl = host.querySelector('#ai-messages');
  const input = host.querySelector('#ai-input');
  const sendBtn = host.querySelector('#ai-send');
  const statusEl = host.querySelector('#ai-status');
  const clearBtn = host.querySelector('#ai-clear');

  let history = loadHistory();
  let busy = false;

  const addMessage = (role, text, animate = false) => {
    const isUser = role === 'user';
    const bubble = el(`<div style="display:flex;gap:8px;flex-direction:${isUser ? 'row-reverse' : 'row'}">
      <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;background:${isUser ? 'var(--bg-3)' : 'linear-gradient(135deg,var(--accent),var(--accent-2))'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${isUser ? 'var(--text)' : 'var(--accent-ink)'}">${isUser ? 'Я' : 'AI'}</div>
      <div style="max-width:75%;padding:10px 14px;border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isUser ? 'var(--bg-3)' : 'var(--bg-2)'};font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word"></div>
    </div>`);
    const textEl = bubble.querySelector('div:last-child');
    if (animate) {
      let i = 0;
      const interval = setInterval(() => {
        if (i >= text.length) { clearInterval(interval); return; }
        textEl.textContent = text.slice(0, i + 2);
        i += 2;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }, 20);
    } else {
      textEl.textContent = text;
    }
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const renderHistory = () => {
    messagesEl.innerHTML = '';
    if (history.length === 0) {
      addMessage('assistant', 'Привет! Я AI-помощник СпокУма. Могу поддержать, обсудить что-то или просто поговорить. Чем могу помочь?');
    } else {
      history.forEach(m => addMessage(m.role, m.content));
    }
  };

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    saveHistory(history);
    statusEl.textContent = 'Печатает...';
    statusEl.style.color = 'var(--accent)';

    const loading = el(`<div style="display:flex;gap:8px" id="ai-loading"><div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent-ink)">AI</div><div style="padding:10px 14px;border-radius:16px 16px 16px 4px;background:var(--bg-2);font-size:14px;color:var(--muted)">...</div></div>`);
    messagesEl.appendChild(loading);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const response = await fetch(AI_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history.slice(-10)]
        })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
      }
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'Не удалось получить ответ';
      loading.remove();
      addMessage('assistant', reply, true);
      history.push({ role: 'assistant', content: reply });
      saveHistory(history);
      statusEl.textContent = 'Онлайн';
      statusEl.style.color = 'var(--muted)';
    } catch (e) {
      loading.remove();
      const errMsg = e.message.includes('Failed to fetch') ? 'Ошибка сети. Проверьте подключение.' : 'Ошибка: ' + e.message;
      addMessage('assistant', errMsg);
      statusEl.textContent = 'Ошибка';
      statusEl.style.color = '#c98b8b';
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  };

  sendBtn.onclick = sendMessage;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  clearBtn.onclick = () => {
    history = [];
    saveHistory(history);
    renderHistory();
    toast('История очищена');
  };

  renderHistory();
  setTimeout(() => input.focus(), 200);

  return sheet;
}
