import { ADMIN_IDS } from '../config.js';
import * as db from '../database.js';
import {
  kbAdminMain, kbAdminSites, kbAdminSiteDetail,
  kbAdminReg, kbAdminWithdrawal, kbAdminVerif,
  kbAdminCodes, kbMainMenu, kbStartVerification, kbCancel,
} from '../keyboards.js';
import { setSession, clearSession, getSession, updateSession } from '../session.js';

export const isAdmin = (id) => ADMIN_IDS.includes(id);

// ─── /admin ───────────────────────────────────────────────────────────────────

export const handleAdminCmd = async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  return ctx.reply('🛠 <b>Панель администратора</b>', { parse_mode: 'HTML', ...kbAdminMain() });
};

export const handleAdminBack = async (ctx) => {
  await ctx.editMessageText('🛠 <b>Панель администратора</b>', { parse_mode: 'HTML', ...kbAdminMain() });
  return ctx.answerCbQuery();
};

// ─── Verifications ────────────────────────────────────────────────────────────

export const handleAdminVerifs = async (ctx) => {
  const users = db.getUnverifiedUsers();
  if (!users.length) return ctx.answerCbQuery('✅ Нет пендинг верификаций', { show_alert: true });

  const user = users[0];
  const photos = db.getVerificationPhotos(user.id);

  await ctx.answerCbQuery();
  await ctx.reply(
    `🔐 <b>Верификация пользователя</b>\n\n` +
    `Имя: ${user.first_name}\n` +
    `Username: @${user.username || '—'}\n` +
    `ID: <code>${user.telegram_id}</code>\n` +
    `Фото: ${photos.length} шт.\n` +
    `Ожидают: ${users.length} чел.`,
    { parse_mode: 'HTML', ...kbAdminVerif(user.id) }
  );
  for (const photo of photos) {
    try { await ctx.replyWithPhoto(photo.file_id); } catch {}
  }
};

export const handleVerifApprove = async (ctx, bot) => {
  const userDbId = parseInt(ctx.match[1]);
  const user = db.getUserByDbId(userDbId);
  if (!user) return ctx.answerCbQuery('Пользователь не найден', { show_alert: true });

  db.setVerified(user.telegram_id, true);
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('✅ Верифицирован!');

  try {
    await bot.telegram.sendMessage(
      user.telegram_id,
      '🎉 <b>Верификация пройдена!</b>\n\nТеперь вам доступно полное меню бота.',
      { parse_mode: 'HTML', ...kbMainMenu() }
    );
  } catch {}
};

export const handleVerifReject = async (ctx, bot) => {
  const userDbId = parseInt(ctx.match[1]);
  const user = db.getUserByDbId(userDbId);
  if (!user) return ctx.answerCbQuery('Пользователь не найден', { show_alert: true });

  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('❌ Отклонено');

  try {
    await bot.telegram.sendMessage(
      user.telegram_id,
      '❌ <b>Верификация отклонена.</b>\n\nПожалуйста, попробуйте снова или свяжитесь с менеджером.',
      { parse_mode: 'HTML', ...kbStartVerification() }
    );
  } catch {}
};

// ─── Sites ────────────────────────────────────────────────────────────────────

export const handleAdminSites = async (ctx) => {
  const sites = db.getAllSitesAdmin();
  await ctx.editMessageText('🌐 <b>Управление сайтами</b>', { parse_mode: 'HTML', ...kbAdminSites(sites) });
  return ctx.answerCbQuery();
};

export const handleAdminSiteDetail = async (ctx) => {
  const siteId = parseInt(ctx.match[1]);
  const site = db.getSite(siteId);
  if (!site) return ctx.answerCbQuery('Сайт не найден', { show_alert: true });

  await ctx.editMessageText(
    `🌐 <b>${site.name}</b>\n\n` +
    `🔗 URL: ${site.url}\n` +
    `💰 Оплата: $${site.payment}\n` +
    `👥 Реф. %: ${site.referral_percent}%\n` +
    `Статус: ${site.is_active ? '✅ Активен' : '❌ Отключён'}`,
    { parse_mode: 'HTML', ...kbAdminSiteDetail(siteId, !!site.is_active) }
  );
  return ctx.answerCbQuery();
};

export const handleAdminSiteToggle = async (ctx) => {
  const siteId = parseInt(ctx.match[1]);
  const site = db.getSite(siteId);
  db.toggleSite(siteId, !site.is_active);
  const updated = db.getSite(siteId);
  await ctx.editMessageText(
    `🌐 <b>${updated.name}</b>\n\n` +
    `🔗 URL: ${updated.url}\n` +
    `💰 Оплата: $${updated.payment}\n` +
    `👥 Реф. %: ${updated.referral_percent}%\n` +
    `Статус: ${updated.is_active ? '✅ Активен' : '❌ Отключён'}`,
    { parse_mode: 'HTML', ...kbAdminSiteDetail(siteId, !!updated.is_active) }
  );
  return ctx.answerCbQuery('Обновлено!');
};

export const handleAdminSiteAdd = async (ctx) => {
  setSession(ctx.from.id, { state: 'admin_site_name' });
  await ctx.answerCbQuery();
  return ctx.reply('➕ <b>Добавление сайта</b>\n\nВведите название сайта:', { parse_mode: 'HTML', ...kbCancel() });
};

export const handleAdminSiteEdit = async (ctx) => {
  const siteId = parseInt(ctx.match[1]);
  const site = db.getSite(siteId);
  setSession(ctx.from.id, { state: 'admin_site_name', editingSiteId: siteId });
  await ctx.answerCbQuery();
  return ctx.reply(
    `✏️ Редактирование <b>${site.name}</b>\n\nВведите новое название:`,
    { parse_mode: 'HTML', ...kbCancel() }
  );
};

export const handleAdminSiteDelete = async (ctx) => {
  const siteId = parseInt(ctx.match[1]);
  const site = db.getSite(siteId);
  if (!site) return ctx.answerCbQuery('Сайт не найден', { show_alert: true });

  db.deleteSite(siteId);
  await ctx.answerCbQuery(`🗑 Сайт "${site.name}" удалён`, { show_alert: true });

  const sites = db.getAllSitesAdmin();
  await ctx.editMessageText('🌐 <b>Управление сайтами</b>', {
    parse_mode: 'HTML',
    ...kbAdminSites(sites),
  });
};

// ─── Registrations ────────────────────────────────────────────────────────────

const sendRegCard = async (ctx, regs, index, edit = false) => {
  const reg = regs[index];
  const text =
    `📝 <b>Регистрация #${reg.id}</b>\n\n` +
    `Пользователь: ${reg.first_name} (@${reg.username || '—'})\n` +
    `ID: <code>${reg.telegram_id}</code>\n` +
    `Сайт: <b>${reg.site_name}</b>\n` +
    `Оплата: <b>$${reg.payment}</b>`;

  const kb = kbAdminReg(reg.id, index, regs.length);

  if (edit) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
};

export const handleAdminRegs = async (ctx) => {
  const regs = db.getPendingRegistrations();
  if (!regs.length) return ctx.answerCbQuery('✅ Нет регистраций на проверке', { show_alert: true });
  await ctx.answerCbQuery();
  await sendRegCard(ctx, regs, 0, false);
};

export const handleAdminRegNav = async (ctx, direction) => {
  const regs = db.getPendingRegistrations();
  if (!regs.length) return ctx.answerCbQuery('✅ Больше нет заявок', { show_alert: true });

  const currentIndex = parseInt(ctx.match[1]);
  let newIndex;
  if (direction === 'next') {
    newIndex = currentIndex + 1 >= regs.length ? 0 : currentIndex + 1;
  } else {
    newIndex = currentIndex - 1 < 0 ? regs.length - 1 : currentIndex - 1;
  }

  await ctx.answerCbQuery();
  await sendRegCard(ctx, regs, newIndex, true);
};

export const handleRegApprove = async (ctx, bot) => {
  const regId = parseInt(ctx.match[1]);
  const reg = db.getRegistration(regId);
  if (!reg || reg.status !== 'pending') return ctx.answerCbQuery('Уже обработано!', { show_alert: true });

  db.updateRegistrationStatus(regId, 'approved');
  db.addBalance(reg.user_id, reg.payment, 'registration');

  if (reg.referrer_id) {
    const refAmount = reg.payment * reg.referral_percent / 100;
    db.addBalance(reg.referrer_id, refAmount, 'referral');
    const referrer = db.getUserByDbId(reg.referrer_id);
    if (referrer) {
      try {
        await bot.telegram.sendMessage(
          referrer.telegram_id,
          `🎉 Ваш реферал выполнил регистрацию на <b>${reg.site_name}</b>!\nВам начислено: <b>$${refAmount.toFixed(2)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch {}
    }
  }

  await ctx.answerCbQuery('✅ Подтверждено!');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  // Show next pending reg if any
  const remaining = db.getPendingRegistrations();
  if (remaining.length) {
    await sendRegCard(ctx, remaining, 0, false);
  }

  try {
    await bot.telegram.sendMessage(
      reg.telegram_id,
      `✅ <b>Регистрация подтверждена!</b>\n\nСайт: <b>${reg.site_name}</b>\nНачислено: <b>$${reg.payment.toFixed(2)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch {}
};

export const handleRegReject = async (ctx, bot) => {
  const regId = parseInt(ctx.match[1]);
  const reg = db.getRegistration(regId);
  if (!reg || reg.status !== 'pending') return ctx.answerCbQuery('Уже обработано!', { show_alert: true });

  db.updateRegistrationStatus(regId, 'rejected');
  await ctx.answerCbQuery('❌ Отклонено');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

  // Show next pending reg if any
  const remaining = db.getPendingRegistrations();
  if (remaining.length) {
    await sendRegCard(ctx, remaining, 0, false);
  }

  try {
    await bot.telegram.sendMessage(
      reg.telegram_id,
      `❌ <b>Регистрация отклонена</b>\n\nСайт: <b>${reg.site_name}</b>\n\nЕсли есть вопросы — обратитесь к менеджеру.`,
      { parse_mode: 'HTML' }
    );
  } catch {}
};

// ─── Withdrawals ──────────────────────────────────────────────────────────────

export const handleAdminWithdrawals = async (ctx) => {
  const wds = db.getPendingWithdrawals();
  if (!wds.length) return ctx.answerCbQuery('✅ Нет заявок на вывод', { show_alert: true });

  const wd = wds[0];
  await ctx.answerCbQuery();
  return ctx.reply(
    `💸 <b>Заявка на вывод #${wd.id}</b>\n\n` +
    `Пользователь: ${wd.first_name} (@${wd.username || '—'})\n` +
    `Сумма: <b>$${wd.amount.toFixed(2)}</b>\n` +
    `Кошелек: <code>${wd.wallet}</code>\n` +
    `Ожидают: ${wds.length} шт.`,
    { parse_mode: 'HTML', ...kbAdminWithdrawal(wd.id) }
  );
};

export const handleWdApprove = async (ctx, bot) => {
  const wdId = parseInt(ctx.match[1]);
  const wd = db.getWithdrawal(wdId);
  if (!wd || wd.status !== 'pending') return ctx.answerCbQuery('Уже обработано!', { show_alert: true });

  db.updateWithdrawalStatus(wdId, 'approved');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('✅ Подтверждено!');

  try {
    await bot.telegram.sendMessage(
      wd.telegram_id,
      `✅ <b>Выплата подтверждена!</b>\n\nСумма: <b>$${wd.amount.toFixed(2)}</b>\nКошелек: <code>${wd.wallet}</code>\n\nСредства отправлены!`,
      { parse_mode: 'HTML' }
    );
  } catch {}
};

export const handleWdReject = async (ctx, bot) => {
  const wdId = parseInt(ctx.match[1]);
  const wd = db.getWithdrawal(wdId);
  if (!wd || wd.status !== 'pending') return ctx.answerCbQuery('Уже обработано!', { show_alert: true });

  db.updateWithdrawalStatus(wdId, 'rejected');
  db.addBalance(wd.user_db_id, wd.amount, 'registration');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('❌ Отклонено, баланс возвращён');

  try {
    await bot.telegram.sendMessage(
      wd.telegram_id,
      `❌ <b>Заявка на вывод отклонена.</b>\n\nСумма $${wd.amount.toFixed(2)} возвращена на баланс.`,
      { parse_mode: 'HTML' }
    );
  } catch {}
};

// ─── Invite Codes ─────────────────────────────────────────────────────────────

export const handleAdminCodes = async (ctx) => {
  const codes = db.getAllInviteCodes();
  await ctx.editMessageText('🎟 <b>Инвайт-коды</b>', { parse_mode: 'HTML', ...kbAdminCodes(codes) });
  return ctx.answerCbQuery();
};

export const handleAdminCodeNew = async (ctx) => {
  const code = db.createInviteCode(ctx.from.id);
  const codes = db.getAllInviteCodes();
  await ctx.editMessageText(
    `🎟 <b>Инвайт-коды</b>\n\n✅ Создан новый код: <code>${code}</code>`,
    { parse_mode: 'HTML', ...kbAdminCodes(codes) }
  );
  return ctx.answerCbQuery(`✅ Код: ${code}`, { show_alert: true });
};

// ─── Users List ───────────────────────────────────────────────────────────────

export const handleAdminUsers = async (ctx, page = 0) => {
  const { Markup } = await import('telegraf');
  const PAGE_SIZE = 20;
  const users = db.getAllUsers();
  const total = users.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pageUsers = users.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  let text = `👥 <b>Пользователи (${total})</b> — страница ${page + 1}/${totalPages}\n\n`;
  for (const u of pageUsers) {
    const v = u.is_verified ? '✅' : '⏳';
    text += `${v} ${u.first_name} (@${u.username || '—'}) — $${u.balance.toFixed(2)}\n`;
  }

  const navButtons = [];
  if (page > 0) navButtons.push(Markup.button.callback('◀️ Назад', `admin_users_page:${page - 1}`));
  navButtons.push(Markup.button.callback(`${page + 1} / ${totalPages}`, 'admin_reg_noop'));
  if (page + 1 < totalPages) navButtons.push(Markup.button.callback('▶️ Вперёд', `admin_users_page:${page + 1}`));

  const kb = Markup.inlineKeyboard([
    navButtons,
    [Markup.button.callback('◀️ В меню', 'admin_back')],
  ]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
  return ctx.answerCbQuery();
};

// ─── Manual Top-Up ────────────────────────────────────────────────────────────

export const handleAdminTopup = async (ctx) => {
  setSession(ctx.from.id, { state: 'admin_topup_id' });
  await ctx.answerCbQuery();
  return ctx.reply(
    '💰 <b>Пополнение баланса</b>\n\nВведите <b>@username</b> или <b>Telegram ID</b> пользователя:',
    { parse_mode: 'HTML', ...kbCancel() }
  );
};

// ─── Export to Excel ──────────────────────────────────────────────────────────

export const handleAdminExport = async (ctx) => {
  const { default: XLSX } = await import('xlsx');

  const users = db.getAllUsers();
  const sites = db.getAllSitesAdmin();
  const allRegs = db.getExportData();

  if (!users.length) {
    await ctx.answerCbQuery('Нет пользователей для экспорта', { show_alert: true });
    return;
  }

  // Map telegram_id -> user for referrer lookup
  const userById = {};
  for (const u of users) userById[u.id] = u;

  // Build reg map: { telegramId_siteName: status }
  const regMap = {};
  for (const r of allRegs) {
    regMap[`${r.telegram_id}_${r.site_name}`] = r.status;
  }

  // Build referral earnings map: { referrerId: totalEarned }
  const refEarnings = db.getReferralEarnings();
  const refEarningsMap = {};
  for (const r of refEarnings) {
    refEarningsMap[r.referrer_id] = r.total_earned;
  }

  const statusIcon = (status) => {
    if (status === 'approved') return '✅';
    if (status === 'pending')  return '⏳';
    if (status === 'rejected') return '❌';
    return '';
  };

  // ── Лист 1: Пользователи + сайты ──────────────────────────────────────────
  const siteNames = sites.map(s => s.name);
  const header1 = [
    'Username', 'Имя', 'Telegram ID', 'Баланс ($)',
    'Кто пригласил', 'Заработано с рефералов ($)',
    ...siteNames,
  ];
  const wsData1 = [header1];

  for (const u of users) {
    const referrer = u.referrer_id ? userById[u.referrer_id] : null;
    const referrerStr = referrer
      ? (referrer.username ? `@${referrer.username}` : referrer.first_name)
      : '—';

    const row = [
      u.username ? `@${u.username}` : '—',
      u.first_name || '—',
      u.telegram_id,
      u.balance,
      referrerStr,
      u.referral_balance,
    ];
    for (const site of sites) {
      const status = regMap[`${u.telegram_id}_${site.name}`];
      row.push(statusIcon(status));
    }
    wsData1.push(row);
  }

  // ── Лист 2: Реферальная статистика ────────────────────────────────────────
  const wsData2 = [
    ['Реферер (username)', 'Реферер (имя)', 'Telegram ID', 'Кол-во рефералов', 'Всего заработано ($)'],
  ];

  for (const u of users) {
    const refs = users.filter(r => r.referrer_id === u.id);
    if (refs.length > 0) {
      wsData2.push([
        u.username ? `@${u.username}` : '—',
        u.first_name || '—',
        u.telegram_id,
        refs.length,
        u.referral_balance,
      ]);
    }
  }
  // Sort by earnings desc
  const refRows = wsData2.slice(1).sort((a, b) => b[4] - a[4]);
  const wsData2Final = [wsData2[0], ...refRows];

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet(wsData1);
  const cols1 = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 24 }];
  for (const _ of sites) cols1.push({ wch: 14 });
  ws1['!cols'] = cols1;
  XLSX.utils.book_append_sheet(wb, ws1, 'Пользователи');

  const ws2 = XLSX.utils.aoa_to_sheet(wsData2Final);
  ws2['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Рефералы');

  const filePath = './export.xlsx';
  XLSX.writeFile(wb, filePath);

  await ctx.answerCbQuery();
  await ctx.replyWithDocument(
    { source: filePath, filename: `export_${new Date().toISOString().slice(0,10)}.xlsx` },
    { caption: `📊 Экспорт данных\nПользователей: ${users.length} | Сайтов: ${sites.length}\n\n📋 Лист 1: Пользователи + регистрации\n👥 Лист 2: Реферальная статистика` }
  );
};

// ─── /db command ──────────────────────────────────────────────────────────────

export const handleDbCmd = async (ctx) => {
  return showDbPage(ctx, 0, false);
};

const showDbPage = async (ctx, page, edit = true) => {
  const { Markup } = await import('telegraf');
  const PAGE_SIZE = 10;
  const { users, total } = db.getUsersPage(page, PAGE_SIZE);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  let text = `🗄 <b>База данных</b> — ${total} пользователей\n`;
  text += `Страница ${page + 1}/${totalPages}\n\n`;

  for (const u of users) {
    const v = u.is_verified ? '✅' : '❌';
    text += `${v} <b>${u.first_name}</b> (@${u.username || '—'}) | $${u.balance.toFixed(2)} | /dbu_${u.id}\n`;
  }

  text += `\n<i>Нажмите /dbu_ID для редактирования пользователя</i>`;

  const navButtons = [];
  if (page > 0) navButtons.push(Markup.button.callback('◀️', `db_page:${page - 1}`));
  navButtons.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'admin_reg_noop'));
  if (page + 1 < totalPages) navButtons.push(Markup.button.callback('▶️', `db_page:${page + 1}`));

  const kb = Markup.inlineKeyboard([navButtons]);

  if (edit) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    return ctx.answerCbQuery();
  } else {
    return ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
};

export const handleDbPage = async (ctx) => {
  const page = parseInt(ctx.match[1]);
  return showDbPage(ctx, page, true);
};

export const handleDbUser = async (ctx) => {
  const { Markup } = await import('telegraf');
  const userId = parseInt(ctx.match[1]);
  const u = db.getUserByDbId(userId);
  if (!u) return ctx.reply('❗ Пользователь не найден');

  const regs = db.getUserRegistrations(userId);
  const regText = regs.length
    ? regs.map(r => {
        const icon = r.status === 'approved' ? '✅' : r.status === 'pending' ? '⏳' : '❌';
        return `  ${icon} ${r.site_name}`;
      }).join('\n')
    : '  Нет регистраций';

  const text =
    `👤 <b>Пользователь #${u.id}</b>\n\n` +
    `Имя: <b>${u.first_name}</b>\n` +
    `Username: @${u.username || '—'}\n` +
    `Telegram ID: <code>${u.telegram_id}</code>\n` +
    `Верифицирован: ${u.is_verified ? '✅ Да' : '❌ Нет'}\n` +
    `Кошелёк: ${u.wallet || '—'}\n\n` +
    `💰 Баланс: <b>$${u.balance.toFixed(2)}</b>\n` +
    `📋 С регистраций: $${u.registration_balance.toFixed(2)}\n` +
    `👥 С рефералов: $${u.referral_balance.toFixed(2)}\n\n` +
    `📋 Регистрации:\n${regText}`;

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Изменить баланс', `dbu_setbal:${u.id}`),
      Markup.button.callback('🔄 Обнулить баланс', `dbu_zeroval:${u.id}`),
    ],
    [
      Markup.button.callback(u.is_verified ? '🔒 Снять верификацию' : '✅ Верифицировать', `dbu_toggleverif:${u.id}`),
      Markup.button.callback('🗑 Удалить юзера', `dbu_delete:${u.id}`),
    ],
    [Markup.button.callback('◀️ К списку', 'db_back')],
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...kb });
};

export const handleDbSetBalance = async (ctx) => {
  const userId = parseInt(ctx.match[1]);
  const u = db.getUserByDbId(userId);
  setSession(ctx.from.id, { state: 'db_setbal', dbUserId: userId, dbUserName: u.first_name });
  await ctx.answerCbQuery();
  return ctx.reply(
    `💰 Введите новый баланс для <b>${u.first_name}</b>:`,
    { parse_mode: 'HTML', ...kbCancel() }
  );
};

export const handleDbZeroBalance = async (ctx) => {
  const userId = parseInt(ctx.match[1]);
  const u = db.getUserByDbId(userId);
  db.setBalance(userId, 0);
  await ctx.answerCbQuery('✅ Баланс обнулён!', { show_alert: true });
  return ctx.reply(`✅ Баланс <b>${u.first_name}</b> обнулён.`, { parse_mode: 'HTML' });
};

export const handleDbToggleVerif = async (ctx) => {
  const userId = parseInt(ctx.match[1]);
  const u = db.getUserByDbId(userId);
  db.setVerifiedById(userId, !u.is_verified);
  await ctx.answerCbQuery(u.is_verified ? '🔒 Верификация снята' : '✅ Верифицирован', { show_alert: true });
  return ctx.reply(
    u.is_verified
      ? `🔒 Верификация снята у <b>${u.first_name}</b>.`
      : `✅ <b>${u.first_name}</b> верифицирован.`,
    { parse_mode: 'HTML' }
  );
};

export const handleDbDelete = async (ctx, bot) => {
  const userId = parseInt(ctx.match[1]);
  const u = db.getUserByDbId(userId);
  db.deleteUser(userId);
  await ctx.answerCbQuery('🗑 Удалён!', { show_alert: true });
  await ctx.reply(`🗑 Пользователь <b>${u.first_name}</b> удалён.`, { parse_mode: 'HTML' });
  try {
    await bot.telegram.sendMessage(u.telegram_id, '❌ Ваш аккаунт был удалён администратором.');
  } catch {}
};

export const handleDbBack = async (ctx) => {
  return showDbPage(ctx, 0, true);
};
