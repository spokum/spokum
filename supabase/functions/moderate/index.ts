import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const AI_API_URL = Deno.env.get('AI_API_URL') || 'https://codex-relay.codes/v1/chat/completions';
const AI_MODEL = Deno.env.get('AI_MODEL') || 'gpt-6.1-terra';
const AI_API_KEY = Deno.env.get('AI_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CONTEXTS = new Set(['post', 'comment', 'message', 'repost', 'share']);
const RULES = {
  'Мат': 'Нарушение правила 1: ненормативная лексика',
  'Оскорбление': 'Нарушение правила 2: оскорбление участников',
  'Угроза': 'Нарушение правила 3: угрозы',
  'Спам': 'Нарушение правила 4: спам',
  'Реклама': 'Нарушение правила 5: реклама без разрешения',
  'Насилие': 'Нарушение правила 6: призывы к насилию',
  'Ненависть': 'Нарушение правила 7: разжигание ненависти',
  'Провокация': 'Нарушение правила 8: провокация конфликта',
  'Экстремизм': 'Нарушение правила 9: экстремизм, нацизм, свастика',
  'Дискриминация': 'Нарушение правила 10: дискриминация по любому признаку',
  'Шантаж': 'Нарушение правила 11: шантаж и вымогательство',
  'Контент 18+': 'Нарушение правила 12: контент 18+ в общей ленте'
};
const PUNISHMENTS = new Set(['предупреждение', 'снятие', 'мут']);
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

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

function reply(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers });
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function issueApproval(service, userId, context, text, verified) {
  const token = crypto.randomUUID();
  const { error } = await service.from('ai_moderation_approvals').insert({
    token,
    user_id: userId,
    context,
    text_hash: await sha256(text),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  });
  if (error) throw new Error(`Approval insert failed: ${error.message}`);
  return {
    enabled: true,
    allowed: true,
    removed: false,
    reason: '',
    rule: '',
    punishment: '',
    muted: false,
    muteUntil: 0,
    verified,
    approvalToken: token
  };
}

function parseVerdict(content) {
  const match = String(content || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned no JSON');
  const result = JSON.parse(match[0]);
  if (result.ok === true || result.ok === 'true') return { ok: true };
  if (result.ok !== false && result.ok !== 'false') throw new Error('AI returned an invalid verdict');
  const rule = Object.hasOwn(RULES, result.rule) ? result.rule : 'Нарушение';
  const punishment = PUNISHMENTS.has(result.punishment) ? result.punishment : 'снятие';
  return { ok: false, rule, punishment };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return reply({ error: 'Функция модерации не настроена' }, 503);
  }

  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'Нужен вход' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return reply({ error: 'Сессия недействительна' }, 401);

    let input;
    try { input = await request.json(); } catch { return reply({ error: 'Некорректный JSON' }, 400); }
    const text = typeof input?.text === 'string' ? input.text : '';
    const context = String(input?.context || '');
    if (!CONTEXTS.has(context)) return reply({ error: 'Неизвестный тип контента' }, 400);
    if (text.length > 5000) return reply({ error: 'Текст слишком длинный' }, 400);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: settings, error: settingsError } = await service
      .from('ai_moderation_settings')
      .select('enabled, fail_open')
      .eq('singleton', true)
      .maybeSingle();
    if (settingsError) return reply({ error: 'Настройки модерации недоступны' }, 503);
    if (!settings?.enabled) {
      return reply({
        enabled: false, allowed: true, removed: false, reason: '', rule: '', punishment: '',
        muted: false, muteUntil: 0, verified: false, approvalToken: null
      });
    }
    if (!text.trim()) {
      return reply({
        enabled: true, allowed: true, removed: false, reason: '', rule: '', punishment: '',
        muted: false, muteUntil: 0, verified: false, approvalToken: null
      });
    }

    const { data: strike, error: strikeError } = await service
      .from('ai_moderation_strikes')
      .select('mute_until')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (strikeError) return reply({ error: 'Статус модерации недоступен' }, 503);
    const muteUntil = strike?.mute_until ? Date.parse(strike.mute_until) : 0;
    if (muteUntil > Date.now()) {
      return reply({
        enabled: true,
        allowed: false,
        removed: true,
        reason: 'Снял: ИИ-модератор | Пользователь в муте | Наказание: мут',
        rule: 'Мут',
        punishment: 'мут',
        muted: true,
        muteUntil,
        approvalToken: null
      });
    }

    let verdict;
    try {
      if (!AI_API_KEY) throw new Error('AI_API_KEY is not configured');
      const aiResponse = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text }
          ],
          max_tokens: 100,
          temperature: 0
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (!aiResponse.ok) throw new Error(`AI HTTP ${aiResponse.status}`);
      const aiData = await aiResponse.json();
      verdict = parseVerdict(aiData.choices?.[0]?.message?.content);
    } catch (error) {
      console.error('AI moderation provider failed:', error.message);
      if (!settings.fail_open) {
        return reply({
          enabled: true,
          allowed: false,
          removed: false,
          error: 'Проверка текста временно недоступна. Попробуйте позже',
          approvalToken: null
        }, 503);
      }
      await service.from('ai_moderation_approvals').delete().lt('expires_at', new Date().toISOString());
      return reply(await issueApproval(service, userData.user.id, context, text, false));
    }

    if (verdict.ok) {
      await service.from('ai_moderation_approvals').delete().lt('expires_at', new Date().toISOString());
      return reply(await issueApproval(service, userData.user.id, context, text, true));
    }

    const description = RULES[verdict.rule] || 'Нарушение правил СпокУма';
    const reason = `Снял: ИИ-модератор | ${description} | Наказание: ${verdict.punishment}`;
    const { data: punishment, error: punishmentError } = await service.rpc('ai_moderation_record_violation', {
      p_user_id: userData.user.id,
      p_body: text,
      p_context: context,
      p_rule: verdict.rule,
      p_reason: reason,
      p_punishment: verdict.punishment
    });
    if (punishmentError) return reply({ error: 'Не удалось сохранить решение модерации' }, 503);
    return reply({
      enabled: true,
      allowed: false,
      removed: true,
      reason,
      rule: verdict.rule,
      punishment: verdict.punishment,
      muted: !!punishment?.muted,
      muteUntil: punishment?.muteUntil || 0,
      strikes: punishment?.strikes || 0,
      approvalToken: null
    });
  } catch (error) {
    console.error('Moderation function failed:', error.message);
    return reply({ error: 'Ошибка серверной модерации. Попробуйте ещё раз' }, 500);
  }
});
