import { api, state } from '../store.js';
import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, emptyState } from '../ui.js';

const AI_API = 'https://api.apinex.bond/v1/chat/completions';
const AI_KEY = 'sk-apx1cc634f9c54279f25b55b39e5e2e854e798d2782b24796e';
const AI_MODEL = 'free/glm-5.3-flash';
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

export async function openAIChat() {
  const host = el(`
    <div class="col" style="height:100%;gap:0">
      <div style="padding:8px 12px;background:var(--bg-2);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center">${icon('spark', 16)}</div>
        <div class="grow">
          <div class="strong small">AI Помощник</div>
          <div class="tiny muted" id="ai-status">Готов к общению</div>
        </div>
        <div class="tiny muted" id="ai-tokens">0/100k</div>
      </div>
      <div id="ai-messages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px"></div>
      <div style="padding:8px 12px;background:var(--bg-2);border-top:1px solid var(--line)">
        <div class="row" style="gap:8px">
          <input class="input grow" id="ai-input" placeholder="Напишите сообщение..." maxlength="500" style="font-size:14px">
          <button class="btn btn-primary btn-icon" id="ai-send">${icon('send', 18)}</button>
        </div>
      </div>
    </div>
  `);
  const sheet = openSheet('AI чат', host, {});
  sheet.querySelector('.sheet').style.maxHeight = '90vh';
  sheet.querySelector('.sheet').style.height = '90vh';
  sheet.querySelector('.sheet').style.display = 'flex';
  sheet.querySelector('.sheet').style.flexDirection = 'column';
  sheet.querySelector('.sheet > div:last-child').style.flex = '1';
  sheet.querySelector('.sheet > div:last-child').style.overflow = 'hidden';

  const messagesEl = host.querySelector('#ai-messages');
  const input = host.querySelector('#ai-input');
  const sendBtn = host.querySelector('#ai-send');
  const statusEl = host.querySelector('#ai-status');
  const tokensEl = host.querySelector('#ai-tokens');

  let messages = [];
  let busy = false;

  const addMessage = (role, text) => {
    const isUser = role === 'user';
    const bubble = el(`<div style="display:flex;gap:8px;flex-direction:${isUser ? 'row-reverse' : 'row'}">
      <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;background:${isUser ? 'var(--bg-3)' : 'linear-gradient(135deg,var(--accent),var(--accent-2))'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${isUser ? 'Я' : 'AI'}</div>
      <div style="max-width:75%;padding:10px 14px;border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isUser ? 'var(--bg-3)' : 'var(--bg-2)'};font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(text)}</div>
    </div>`);
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    addMessage('user', text);
    messages.push({ role: 'user', content: text });
    statusEl.textContent = 'Печатает...';
    statusEl.style.color = 'var(--accent)';

    const loadingBubble = el(`<div style="display:flex;gap:8px"><div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">AI</div><div style="padding:10px 14px;border-radius:16px 16px 16px 4px;background:var(--bg-2);font-size:14px;color:var(--muted)">...</div></div>`);
    messagesEl.appendChild(loadingBubble);
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
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
        })
      });

      if (!response.ok) throw new Error('Ошибка API: ' + response.status);
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'Не удалось получить ответ';
      loadingBubble.remove();
      addMessage('assistant', reply);
      messages.push({ role: 'assistant', content: reply });

      const tokens = data.usage?.total_tokens || 0;
      tokensEl.textContent = `${tokens} токенов`;
      statusEl.textContent = 'Готов к общению';
      statusEl.style.color = 'var(--muted)';
    } catch (e) {
      loadingBubble.remove();
      addMessage('assistant', 'Произошла ошибка. Попробуйте позже.');
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

  addMessage('assistant', 'Привет! Я AI-помощник СпокУма. Могу поддержать, обсудить что-то или просто поговорить. Чем могу помочь?');

  return sheet;
}
