import { Markup } from 'telegraf';
import { MANAGER_USERNAME, CHANNEL_URL } from './config.js';

// ─── Reply Keyboards ──────────────────────────────────────────────────────────

export const kbStartVerification = () =>
  Markup.keyboard([['🔐 Пройти верификацию']]).resize();

export const kbMainMenu = () =>
  Markup.keyboard([
    ['📋 Сайты для регистрации'],
    ['💰 Баланс', '👥 Реферальная программа'],
    ['💳 Кошелек', '💸 Вывод средств'],
    ['📢 Наш канал', '📞 Связаться с менеджером'],
  ]).resize();

export const kbCancel = () =>
  Markup.keyboard([['❌ Отмена']]).resize();

export const kbVerificationDone = () =>
  Markup.keyboard([
    ['✅ Я отправил(а) все фото'],
    ['❌ Отмена'],
  ]).resize();

// ─── Inline Keyboards ─────────────────────────────────────────────────────────

export const kbSitesList = (sites, regMap) => {
  const buttons = sites.map(site => {
    const status = regMap[site.id];
    const icon =
      status === 'pending'  ? '⏳' :
      status === 'approved' ? '✅' :
      status === 'rejected' ? '❌' : '🔘';
    return [Markup.button.callback(`${icon} ${site.name} — $${site.payment}`, `site:${site.id}`)];
  });
  return Markup.inlineKeyboard(buttons);
};

export const kbSiteDetail = (siteId, alreadySubmitted, siteUrl) => {
  const buttons = [
    [Markup.button.url('🔗 Перейти на сайт', siteUrl)],
  ];
  if (!alreadySubmitted) {
    buttons.push([Markup.button.callback('✅ Готово', `done:${siteId}`)]);
  }
  buttons.push([Markup.button.callback('◀️ Назад', 'sites_back')]);
  return Markup.inlineKeyboard(buttons);
};

export const kbAfterDone = () =>
  Markup.inlineKeyboard([
    [Markup.button.url('📞 Связаться с менеджером', `https://t.me/${MANAGER_USERNAME.replace('@', '')}`)],
    [Markup.button.callback('◀️ К списку сайтов', 'sites_back')],
  ]);

export const kbWalletActions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить кошелек', 'wallet_edit')],
  ]);

// ─── Admin Keyboards ──────────────────────────────────────────────────────────

export const kbAdminMain = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Управление сайтами',    'admin_sites')],
    [Markup.button.callback('📝 Проверить регистрации', 'admin_regs')],
    [Markup.button.callback('💸 Заявки на вывод',       'admin_withdrawals')],
    [Markup.button.callback('🔐 Верификации',           'admin_verifs')],
    [Markup.button.callback('🎟 Инвайт-коды',           'admin_codes')],
    [Markup.button.callback('👥 Все пользователи',      'admin_users')],
    [Markup.button.callback('💰 Пополнить баланс юзеру','admin_topup')],
    [Markup.button.callback('📊 Выгрузить в Excel',       'admin_export')],
  ]);

export const kbAdminSites = (sites) => {
  const buttons = sites.map(s => {
    const icon = s.is_active ? '✅' : '❌';
    return [Markup.button.callback(`${icon} ${s.name} — $${s.payment}`, `admin_site:${s.id}`)];
  });
  buttons.push([Markup.button.callback('➕ Добавить сайт', 'admin_site_add')]);
  buttons.push([Markup.button.callback('◀️ Назад', 'admin_back')]);
  return Markup.inlineKeyboard(buttons);
};

export const kbAdminSiteDetail = (siteId, isActive) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Редактировать', `admin_site_edit:${siteId}`)],
    [Markup.button.callback(isActive ? '🔴 Отключить' : '🟢 Включить', `admin_site_toggle:${siteId}`)],
    [Markup.button.callback('🗑 Удалить сайт', `admin_site_delete:${siteId}`)],
    [Markup.button.callback('◀️ Назад', 'admin_sites')],
  ]);

export const kbAdminReg = (regId) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Подтвердить', `admin_reg_ok:${regId}`),
      Markup.button.callback('❌ Отклонить',   `admin_reg_no:${regId}`),
    ],
    [Markup.button.callback('⏭ Следующая', 'admin_regs')],
  ]);

export const kbAdminWithdrawal = (wdId) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Выплачено',  `admin_wd_ok:${wdId}`),
      Markup.button.callback('❌ Отклонить',  `admin_wd_no:${wdId}`),
    ],
    [Markup.button.callback('⏭ Следующая', 'admin_withdrawals')],
  ]);

export const kbAdminVerif = (userDbId) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Одобрить',  `admin_verif_ok:${userDbId}`),
      Markup.button.callback('❌ Отклонить', `admin_verif_no:${userDbId}`),
    ],
    [Markup.button.callback('⏭ Следующий', 'admin_verifs')],
  ]);

export const kbAdminCodes = (codes) => {
  const buttons = codes.slice(0, 10).map(c => {
    const icon = c.is_active ? '✅' : '❌';
    return [Markup.button.callback(`${icon} ${c.code}`, `admin_code:${c.id}`)];
  });
  buttons.push([Markup.button.callback('➕ Создать код', 'admin_code_new')]);
  buttons.push([Markup.button.callback('◀️ Назад', 'admin_back')]);
  return Markup.inlineKeyboard(buttons);
};

export const kbBackToAdmin = () =>
  Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'admin_back')]]);
