const BOT_TOKEN = Deno.env.get('BOT_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://spokum.github.io/spokum/';

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
    if (SUPABASE_URL && SERVICE_KEY) {
      const probe = await rpc('bot_whoami', { tg: 0 });
      report.database = probe === null ? 'НЕ ОТВЕЧАЕТ, проверьте SERVICE_KEY и прогон schema.sql' : 'на связи';
    } else {
      report.database = 'нечем проверить, нет PROJECT_URL или SERVICE_KEY';
    }
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
