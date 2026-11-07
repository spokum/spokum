
const AI_API = "https://codex-relay.codes/v1/chat/completions";
const AI_KEY = "sk-O51FMMei5VmA4YTXDzoTdHEn6xriAtZ7Z4c5ZfTkFGFa3xat";
const AI_MODEL = "gpt-6.1-terra";

const REPORTS_KEY = "spokum.aiModeration.reports";
const SETTINGS_KEY = "spokum.aiModeration.enabled";
const STRIKES_KEY = "spokum.aiModeration.strikes";

export function isAiModerationEnabled() {
  return localStorage.getItem(SETTINGS_KEY) === "1";
}

export function setAiModerationEnabled(on) {
  localStorage.setItem(SETTINGS_KEY, on ? "1" : "0");
}

function getReports() {
  try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]") || []; } catch { return []; }
}

function addReport(report) {
  const reports = getReports();
  reports.unshift(report);
  if (reports.length > 300) reports.length = 300;
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

export function getAiReports() { return getReports(); }
export function removeReport(id) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(getReports().filter((r) => r.id !== id)));
}
export function clearAiReports() { localStorage.setItem(REPORTS_KEY, "[]"); }

function getStrikes(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(STRIKES_KEY) || "{}");
    return all[userId] || { count: 0, lastStrike: 0, muteUntil: 0 };
  } catch { return { count: 0, lastStrike: 0, muteUntil: 0 }; }
}

function addStrike(userId, username) {
  const all = (() => { try { return JSON.parse(localStorage.getItem(STRIKES_KEY) || "{}"); } catch { return {}; } })();
  const cur = all[userId] || { count: 0, lastStrike: 0, muteUntil: 0 };
  cur.count++;
  cur.lastStrike = Date.now();
  if (cur.count >= 10) cur.muteUntil = Date.now() + 3 * 24 * 3600 * 1000;
  else if (cur.count >= 5) cur.muteUntil = Date.now() + 24 * 3600 * 1000;
  else if (cur.count >= 3) cur.muteUntil = Date.now() + 3600 * 1000;
  all[userId] = cur;
  localStorage.setItem(STRIKES_KEY, JSON.stringify(all));
  return cur;
}

export function getAiStrikes(userId) { return getStrikes(userId); }

export function isUserAiMuted(userId) {
  const s = getStrikes(userId);
  return s.muteUntil > Date.now();
}

const RULES = {
  "Мат": "Нарушение правила 1: ненормативная лексика",
  "Оскорбление": "Нарушение правила 2: оскорбление участников",
  "Угроза": "Нарушение правила 3: угрозы",
  "Спам": "Нарушение правила 4: спам",
  "Реклама": "Нарушение правила 5: реклама без разрешения",
  "Насилие": "Нарушение правила 6: призывы к насилию",
  "Ненависть": "Нарушение правила 7: разжигание ненависти",
  "Провокация": "Нарушение правила 8: провокация конфликта",
  "Экстремизм": "Нарушение правила 9: экстремизм, нацизм, свастика",
  "Дискриминация": "Нарушение правила 10: дискриминация по любому признаку",
  "Шантаж": "Нарушение правила 11: шантаж и вымогательство",
  "Контент 18+": "Нарушение правила 12: контент 18+ в общей ленте",
};

const SYSTEM_PROMPT = `Ты строгий модератор соцсети СпокУм. Проверяешь каждый текст.
ЗАПРЕЩЕНО абсолютно:
- Мат и ненормативная лексика (любые варианты, замены букв, звёздочки)
- Оскорбления, унижения, насмешки над человеком
- Угрозы любого вида
- Спам, повторяющиеся сообщения
- Реклама, ссылки на сторонние ресурсы без разрешения
- Призывы к насилию
- Разжигание ненависти по расе, нации, религии, полу, ориентации
- Провокации конфликтов
- Экстремизм, нацизм, фашизм, свастика, их символика и пропаганда
- Дискриминация любого вида
- Шантаж, вымогательство, угрозы раскрыть личные данные
- Контент 18+ в общем доступе
- Обход фильтров (замена букв цифрами, намеренные опечатки)

Будь максимально строгим. При любом сомнении — снимай.

Ответ ТОЛЬКО JSON, ничего больше:
{"ok":true} — текст чистый
{"ok":false,"rule":"Мат","punishment":"снятие"} — нарушение

rule строго из списка: Мат, Оскорбление, Угроза, Спам, Реклама, Насилие, Ненависть, Провокация, Экстремизм, Дискриминация, Шантаж, Контент 18+
punishment: предупреждение (первый раз), снятие (повтор), мут (систематически)`;

async function moderateContent(text, context, userInfo) {
  if (!isAiModerationEnabled()) return { action: "allow" };
  if (!text || text.trim().length < 2) return { action: "allow" };

  if (userInfo?.id && isUserAiMuted(userInfo.id)) {
    const strikes = getStrikes(userInfo.id);
    return {
      action: "remove",
      rule: "Мут",
      reason: "Снял: ИИ-модератор | Пользователь в муте | Наказание: мут",
      punishment: "мут",
      muteUntil: strikes.muteUntil,
    };
  }

  try {
    const response = await fetch(AI_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 400) },
        ],
        max_tokens: 60,
        temperature: 0,
      }),
    });

    if (!response.ok) return { action: "allow" };

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[^}]+\}/);
    if (!match) return { action: "allow" };

    const result = JSON.parse(match[0]);

    if (result.ok === false || result.ok === "false") {
      const rule = result.rule || "Нарушение";
      const punishment = result.punishment || "снятие";
      const ruleDescription = RULES[rule] || `Нарушение: ${rule}`;
      const fullReason = `Снял: ИИ-модератор | ${ruleDescription} | Наказание: ${punishment}`;

      let strikeInfo = null;
      if (userInfo?.id) {
        strikeInfo = addStrike(userInfo.id, userInfo.username);
      }

      addReport({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text: text.slice(0, 200),
        context: context || "пост",
        rule: rule,
        reason: fullReason,
        punishment: punishment,
        timestamp: Date.now(),
        userId: userInfo?.id || null,
        username: userInfo?.username || "аноним",
        action: "removed",
        strikes: strikeInfo?.count || 0,
        muted: strikeInfo?.muteUntil > Date.now() || false,
        muteUntil: strikeInfo?.muteUntil || 0,
      });

      return {
        action: "remove",
        rule: rule,
        reason: fullReason,
        punishment: punishment,
        muted: strikeInfo?.muteUntil > Date.now() || false,
        muteUntil: strikeInfo?.muteUntil || 0,
      };
    }

    return { action: "allow" };
  } catch (error) {
    console.warn("AI moderation error:", error.message);
    return { action: "allow" };
  }
}

export async function moderatePost(text, userInfo) {
  const result = await moderateContent(text, "пост", userInfo);
  return {
    removed: result.action === "remove",
    reason: result.reason || "",
    rule: result.rule || "",
    punishment: result.punishment || "",
    muted: result.muted || false,
    muteUntil: result.muteUntil || 0,
  };
}

export async function moderateComment(text, userInfo) {
  const result = await moderateContent(text, "комментарий", userInfo);
  return {
    removed: result.action === "remove",
    reason: result.reason || "",
    rule: result.rule || "",
    punishment: result.punishment || "",
    muted: result.muted || false,
    muteUntil: result.muteUntil || 0,
  };
}

export async function moderateMessage(text, userInfo) {
  const result = await moderateContent(text, "сообщение", userInfo);
  return {
    removed: result.action === "remove",
    reason: result.reason || "",
    rule: result.rule || "",
    punishment: result.punishment || "",
    muted: result.muted || false,
    muteUntil: result.muteUntil || 0,
  };
}
