// ИИ-модерация СпокУм через codex-relay API (gpt-6.1-terra)
// Проверяет посты и комментарии на плохие слова, оскорбления, спам.
// Включается/выключается через localStorage spokum.aiModeration.enabled
// Отчёты в админ-панели во вкладке "ИИ-модерация".

const AI_API = "https://codex-relay.codes/v1/chat/completions";
const AI_KEY = "sk-O51FMMei5VmA4YTXDzoTdHEn6xriAtZ7Z4c5ZfTkFGFa3xat";
const AI_MODEL = "gpt-6.1-terra";

const REPORTS_KEY = "spokum.aiModeration.reports";
const SETTINGS_KEY = "spokum.aiModeration.enabled";

export function isAiModerationEnabled() {
  return localStorage.getItem(SETTINGS_KEY) === "1";
}

export function setAiModerationEnabled(on) {
  localStorage.setItem(SETTINGS_KEY, on ? "1" : "0");
}

function getReports() {
  try {
    const data = JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function addReport(report) {
  const reports = getReports();
  reports.unshift(report);
  // Keep last 200 reports
  if (reports.length > 200) reports.length = 200;
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

export function getAiReports() {
  return getReports();
}

export function removeReport(id) {
  const reports = getReports();
  const filtered = reports.filter((r) => r.id !== id);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(filtered));
}

export function clearAiReports() {
  localStorage.setItem(REPORTS_KEY, "[]");
}

/**
 * Moderate text content using AI.
 * Returns { action: "allow" | "remove", reason: string, confidence: number }
 */
export async function moderateContent(text, context) {
  if (!isAiModerationEnabled()) {
    return { action: "allow", reason: "Модерация выключена" };
  }

  if (!text || text.trim().length < 2) {
    return { action: "allow", reason: "Слишком короткий текст" };
  }

  const systemPrompt = `Ты модератор соцсети СпокУм. Проверяешь текст на нарушение правил.
Правила: нельзя мат, оскорбления, угрозы, спам, реклама, призывы к насилию, разжигание ненависти.
Ответь строго в формате JSON:
{"action":"allow"} если текст нормальный
{"action":"remove","reason":"краткая причина"} если нужно удалить
Не пиши ничего кроме JSON.`;

  const userPrompt = `Контекст: ${context || "пост"}
Текст: "${text.slice(0, 500)}"`;

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 80,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return { action: "allow", reason: "AI недоступен" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const match = content.match(/\{[^}]+\}/);
    if (!match) {
      return { action: "allow", reason: "AI не дал ответ" };
    }

    const result = JSON.parse(match[0]);

    // Add report if removed
    if (result.action === "remove") {
      addReport({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text: text.slice(0, 200),
        context: context || "пост",
        reason: result.reason || "Нарушение правил",
        timestamp: Date.now(),
        action: "removed",
      });
    }

    return result;
  } catch (error) {
    return { action: "allow", reason: "Ошибка AI: " + error.message };
  }
}

/**
 * Moderate a post before publishing.
 * If removed, returns { removed: true, reason }.
 * If allowed, returns { removed: false }.
 */
export async function moderatePost(text) {
  const result = await moderateContent(text, "пост");
  return {
    removed: result.action === "remove",
    reason: result.reason || "",
  };
}

/**
 * Moderate a comment before publishing.
 */
export async function moderateComment(text) {
  const result = await moderateContent(text, "комментарий");
  return {
    removed: result.action === "remove",
    reason: result.reason || "",
  };
}

/**
 * Moderate a chat message before sending.
 */
export async function moderateMessage(text) {
  const result = await moderateContent(text, "сообщение в чате");
  return {
    removed: result.action === "remove",
    reason: result.reason || "",
  };
}
