const BOT_TOKEN = Deno.env.get('BOT_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://spokum.github.io/spokum/';
const OWNER_ID = Deno.env.get('OWNER_ID') ?? '';

const PLANS = [
  { id: 'd1', days: 1, stars: 10, title: 'Один день', note: 'попробовать' },
  { id: 'd2', days: 2, stars: 20, title: 'Два дня', note: '' },
  { id: 'd3', days: 3, stars: 30, title: 'Три дня', note: '' },
  { id: 'w1', days: 7, stars: 70, title: 'Неделя', note: '' },
  { id: 'm1', days: 30, stars: 200, title: 'Месяц', note: 'выгоднее' },
  { id: 'm3', days: 90, stars: 550, title: 'Три месяца', note: '' },
  { id: 'm6', days: 180, stars: 500, title: 'Полгода', note: 'лучшая цена' },
  { id: 'y1', days: 365, stars: 1000, title: 'Год', note: 'всё и сразу' }
];

const PERKS = [
  'корона рядом с ником',
  'истории на 24 часа',
  'свои стикеры в чатах',
  'пины и статус у имени',
  'закрытые темы и акценты',
  'свечение аватара',
  'посты до 5000 символов',
  'фото и видео без потерь',
  'до восьми юзернеймов'
];

async function tg(method: string, payload: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

async function rpc(name: string, args: unknown) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify(args)
  });
  if (!response.ok) return null;
  return response.json();
}

function planKeyboard() {
  const rows = [];
  for (let i = 0; i < PLANS.length; i += 2) {
    rows.push(
      PLANS.slice(i, i + 2).map((plan) => ({
        text: `${plan.title} — ${plan.stars} ⭐`,
        callback_data: `buy:${plan.id}`
      }))
    );
  }
  rows.push([{ text: 'Что даёт премиум', callback_data: 'perks' }]);
  return { inline_keyboard: rows };
}

function priceList() {
  return PLANS.map((plan) => `${plan.title} — ${plan.stars} ⭐${plan.note ? ` · ${plan.note}` : ''}`).join('\n');
}

function until(value: string | null) {
  if (!value) return 'нет';
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function greet(chat: number, linked: { username?: string; premium_until?: string | null } | null) {
  if (!linked?.username) {
    await tg('sendMessage', {
      chat_id: chat,
      parse_mode: 'HTML',
      text:
        '<b>СпокУм Премиум</b>\n\n' +
        'Здесь оформляется подписка. Оплата — звёздами Telegram, премиум включается сразу.\n\n' +
        'Сначала нужно понять, какому аккаунту его выдавать:\n\n' +
        '1. Откройте СпокУм → <b>Настройки</b>\n' +
        '2. Карточка <b>СпокУм Премиум</b> → кнопка <b>Оформить премиум</b>\n' +
        '3. Вы вернётесь сюда уже привязанными\n\n' +
        `Приложение: ${APP_URL}`
    });
    return;
  }
  await tg('sendMessage', {
    chat_id: chat,
    parse_mode: 'HTML',
    reply_markup: planKeyboard(),
    text:
      `Аккаунт: <b>@${linked.username}</b>\n` +
      `Премиум: <b>${until(linked.premium_until ?? null)}</b>\n\n` +
      '<b>Выберите срок</b>\n' +
      'Оплата звёздами Telegram. Срок прибавляется к текущему.\n\n' +
      priceList()
  });
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function moment(value: string | null) {
  if (!value) return 'ещё не было';
  const passed = Date.now() - new Date(value).getTime();
  const hours = Math.floor(passed / 3600000);
  if (hours < 1) return `${Math.max(1, Math.floor(passed / 60000))} мин назад`;
  if (hours < 24) return `${plural(hours, 'час', 'часа', 'часов')} назад`;
  return `${plural(Math.floor(hours / 24), 'день', 'дня', 'дней')} назад`;
}

async function starBalance() {
  const direct = await tg('getMyStarBalance', {});
  const lines: string[] = [];
  let total: number | null = null;
  if (direct?.ok && typeof direct.result?.amount === 'number') {
    total = direct.result.amount;
  }

  let earned = 0;
  let spent = 0;
  let ready = 0;
  let held = 0;
  let count = 0;
  const border = Date.now() - 21 * 24 * 3600 * 1000;

  const history = await tg('getStarTransactions', { offset: 0, limit: 100 });
  if (history?.ok) {
    for (const item of history.result?.transactions ?? []) {
      const amount = Number(item.amount) || 0;
      const stamp = Number(item.date) * 1000;
      if (item.source) {
        earned += amount;
        count += 1;
        if (stamp < border) ready += amount;
        else held += amount;
      } else {
        spent += amount;
      }
    }
  } else {
    lines.push('История операций недоступна — обновите Telegram или проверьте токен.');
  }

  if (total === null) total = earned - spent;

  return [
    '<b>Баланс бота</b>',
    '',
    `Сейчас на балансе: <b>${total} ⭐</b>`,
    `Можно выводить: <b>${ready} ⭐</b>`,
    `Ждёт разморозки: <b>${held} ⭐</b>`,
    '',
    `Всего получено: ${earned} ⭐ за ${plural(count, 'платёж', 'платежа', 'платежей')}`,
    spent ? `Потрачено или возвращено: ${spent} ⭐` : '',
    '',
    'Звёзды размораживаются через 21 день после оплаты — это окно на возврат.',
    'Вывод: fragment.com, вход через Telegram, деньги приходят в TON.',
    ...lines
  ]
    .filter(Boolean)
    .join('\n');
}

async function networkStats() {
  const data = await rpc('bot_stats', {});
  if (!data) return 'База не ответила. Загляните в отчёт функции — адрес открывается в браузере.';
  const row = (label: string, value: unknown) => `${label}: <b>${value}</b>`;
  return [
    '<b>СпокУм в цифрах</b>',
    '',
    '<u>Люди</u>',
    row('Всего аккаунтов', data.users),
    row('Новых за сутки', data.users_today),
    row('Новых за неделю', data.users_week),
    row('Онлайн сейчас', data.online),
    row('Заходили за сутки', data.active_day),
    row('Заходили за неделю', data.active_week),
    row('С премиумом', data.premium),
    row('Привязали Telegram', data.linked),
    '',
    '<u>Заказы</u>',
    row('Всего оплат', data.orders),
    row('За сутки', data.orders_today),
    row('За неделю', data.orders_week),
    row('Звёзд получено', `${data.stars} ⭐`),
    row('За сутки', `${data.stars_today} ⭐`),
    row('За неделю', `${data.stars_week} ⭐`),
    data.refunded ? row('Возвратов', data.refunded) : '',
    row('Последняя оплата', moment(data.last_order)),
    '',
    '<u>Контент</u>',
    row('Постов в ленте', data.posts),
    row('Роликов и альбомов', data.reels),
    row('Новых записей за сутки', data.posts_today),
    row('Комментариев', data.comments),
    row('Сообщений', data.messages),
    row('Чатов', data.chats),
    '',
    '<u>Порядок</u>',
    row('Модераторов', data.moderators),
    row('В блокировке', data.banned),
    row('В муте', data.muted),
    row('Открытых жалоб', data.reports_open)
  ]
    .filter(Boolean)
    .join('\n');
}

async function handleUpdate(update: Record<string, any>) {
  if (update.pre_checkout_query) {
    await tg('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
    return;
  }

  if (update.callback_query) {
    const query = update.callback_query;
    const chat = query.message?.chat?.id;
    const from = query.from?.id;
    await tg('answerCallbackQuery', { callback_query_id: query.id });

    if (query.data === 'perks') {
      await tg('sendMessage', {
        chat_id: chat,
        parse_mode: 'HTML',
        reply_markup: planKeyboard(),
        text: '<b>Что даёт премиум</b>\n\n' + PERKS.map((perk) => `• ${perk}`).join('\n')
      });
      return;
    }

    if (String(query.data || '').startsWith('buy:')) {
      const plan = PLANS.find((item) => item.id === query.data.slice(4));
      if (!plan) return;
      const linked = await rpc('bot_whoami', { tg: from });
      if (!linked?.username) {
        await greet(chat, null);
        return;
      }
      await tg('sendInvoice', {
        chat_id: chat,
        title: `СпокУм Премиум — ${plan.title.toLowerCase()}`,
        description: `Премиум для @${linked.username} на ${plan.days} ${plan.days === 1 ? 'день' : plan.days < 5 ? 'дня' : 'дней'}. Включится сразу после оплаты.`,
        payload: `${plan.id}:${plan.days}`,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: plan.title, amount: plan.stars }]
      });
      return;
    }
    return;
  }

  const message = update.message;
  if (!message) return;
  const chat = message.chat?.id;
  const from = message.from?.id;
  const name = message.from?.username || message.from?.first_name || '';

  if (message.successful_payment) {
    const payment = message.successful_payment;
    const days = Number(String(payment.invoice_payload || '').split(':')[1] || 0);
    const result = await rpc('bot_grant_premium', {
      tg: from,
      days,
      stars: payment.total_amount,
      charge: payment.telegram_payment_charge_id
    });
    if (result?.ok) {
      await tg('sendMessage', {
        chat_id: chat,
        parse_mode: 'HTML',
        text:
          '<b>Премиум включён</b>\n\n' +
          `Аккаунт: @${result.username ?? ''}\n` +
          `Действует до: <b>${until(result.until)}</b>\n\n` +
          'Откройте приложение — корона уже на месте. Если нет, обновите ленту.\n\n' +
          `Чек: <code>${payment.telegram_payment_charge_id}</code>`
      });
    } else {
      await tg('sendMessage', {
        chat_id: chat,
        text:
          'Оплата прошла, но аккаунт не привязан, поэтому премиум не выдался. ' +
          'Привяжите аккаунт кнопкой в настройках приложения и напишите сюда — разберёмся, деньги не пропадут.\n\n' +
          `Чек: ${payment.telegram_payment_charge_id}`
      });
    }
    return;
  }

  const text = String(message.text || '').trim();

  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    if (code) {
      const bound = await rpc('bot_bind', { code, tg: from, tg_name: name });
      if (bound?.ok) {
        await tg('sendMessage', {
          chat_id: chat,
          parse_mode: 'HTML',
          text: `Аккаунт <b>@${bound.username}</b> привязан. Теперь выберите срок.`
        });
        await greet(chat, await rpc('bot_whoami', { tg: from }));
        return;
      }
      await tg('sendMessage', {
        chat_id: chat,
        text: 'Код не подошёл — он живёт двадцать минут. Нажмите «Оформить премиум» в настройках приложения ещё раз.'
      });
      return;
    }
    await greet(chat, await rpc('bot_whoami', { tg: from }));
    return;
  }

  if (text.startsWith('/buy') || text.startsWith('/premium')) {
    await greet(chat, await rpc('bot_whoami', { tg: from }));
    return;
  }

  if (text.startsWith('/status')) {
    const linked = await rpc('bot_whoami', { tg: from });
    await tg('sendMessage', {
      chat_id: chat,
      parse_mode: 'HTML',
      text: linked?.username
        ? `Аккаунт: <b>@${linked.username}</b>\nПремиум: <b>${until(linked.premium_until ?? null)}</b>`
        : 'Аккаунт не привязан. Откройте Настройки в приложении и нажмите «Оформить премиум».'
    });
    return;
  }

  if (text.startsWith('/unlink')) {
    await rpc('bot_unbind', { tg: from });
    await tg('sendMessage', { chat_id: chat, text: 'Аккаунт отвязан. Привязать заново можно из настроек приложения.' });
    return;
  }

  if (text.startsWith('/balance')) {
    if (OWNER_ID && String(from) !== OWNER_ID) {
      await tg('sendMessage', { chat_id: chat, text: 'Эта команда не для вас.' });
      return;
    }
    await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: await starBalance() });
    return;
  }

  if (text.startsWith('/anv')) {
    if (OWNER_ID && String(from) !== OWNER_ID) {
      await tg('sendMessage', { chat_id: chat, text: 'Эта команда не для вас.' });
      return;
    }
    await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: await networkStats() });
    return;
  }

  if (text.startsWith('/help')) {
    await tg('sendMessage', {
      chat_id: chat,
      parse_mode: 'HTML',
      text:
        '<b>Команды</b>\n\n' +
        '/buy — выбрать срок и оплатить\n' +
        '/status — какой аккаунт привязан и до какого числа премиум\n' +
        '/unlink — отвязать аккаунт\n\n' +
        'Возврат звёзд — по чеку из сообщения об оплате, напишите админу в приложении.'
    });
    return;
  }

  await greet(chat, await rpc('bot_whoami', { tg: from }));
}

async function probeDatabase() {
  if (!SUPABASE_URL || !SERVICE_KEY) return 'нечем проверить, нет PROJECT_URL или SERVICE_KEY';
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  try {
    const table = await fetch(`${SUPABASE_URL}/rest/v1/tg_links?select=tg_id&limit=1`, { headers });
    if (table.status === 401 || table.status === 403) {
      return 'ключ не подошёл: в SERVICE_KEY нужен service_role, а не anon';
    }
    if (table.status === 404) {
      return 'нет таблицы tg_links — прогоните schema.sql заново';
    }
    if (!table.ok) {
      return `база ответила ${table.status}: ${(await table.text()).slice(0, 200)}`;
    }
    const call = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bot_whoami`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tg: 0 })
    });
    if (call.status === 404) {
      return 'таблицы есть, а функций бота нет — прогоните schema.sql целиком, до самого конца';
    }
    if (!call.ok) {
      return `функция bot_whoami ответила ${call.status}: ${(await call.text()).slice(0, 200)}`;
    }
    return 'на связи, таблицы и функции бота на месте';
  } catch (error) {
    return `нет связи с базой: ${String(error).slice(0, 200)}`;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    const report = {
      ok: true,
      note: 'Функция запущена. Ниже видно, какие секреты найдены. Значения не показываются.',
      BOT_TOKEN: BOT_TOKEN ? 'есть' : 'НЕ ЗАДАН',
      SERVICE_KEY: SERVICE_KEY ? 'есть' : 'НЕ ЗАДАН',
      PROJECT_URL: SUPABASE_URL || 'НЕ ЗАДАН',
      WEBHOOK_SECRET: WEBHOOK_SECRET ? 'есть' : 'не задан, проверка отключена',
      database: 'проверяем...'
    };
    report.database = await probeDatabase();
    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  if (WEBHOOK_SECRET && request.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('no', { status: 401 });
  }
  try {
    const update = await request.json();
    await handleUpdate(update);
  } catch (error) {
    console.error(error);
  }
  return new Response('ok', { status: 200 });
});
