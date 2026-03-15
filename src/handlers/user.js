import { ADMIN_IDS, MANAGER_USERNAME, CHANNEL_URL } from '../config.js';
import { isAdmin } from './admin.js';
import * as db from '../database.js';
import {
  kbStartVerification, kbMainMenu, kbCancel, kbVerificationDone,
  kbSitesList, kbSiteDetail, kbAfterDone, kbWalletActions,
  kbAdminVerif, kbAdminReg, kbAdminWithdrawal,
} from '../keyboards.js';
import { getSession, setSession, clearSession, updateSession } from '../session.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isVerified = (telegramId) => {
  const user = db.getUser(telegramId);
  return user && user.is_verified;
};

const requireVerified = async (ctx) => {
  if (!isVerified(ctx.from.id)) {
    await ctx.reply('🔒 Доступ закрыт. Пройдите верификацию.', kbStartVerification());
    return false;
  }
  return true;
};

const notifyAdmins = async (bot, text, keyboard) => {
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, text, { parse_mode: 'HTML', ...keyboard });
    } catch {}
  }
};

const getSitesMap = (userDbId) => {
  const regs = db.getUserRegistrations(userDbId);
  return Object.fromEntries(regs.map(r => [r.site_id, r.status]));
};

// ─── /start ───────────────────────────────────────────────────────────────────

export const handleStart = async (ctx) => {
  clearSession(ctx.from.id);
  const payload = ctx.startPayload || '';
  const telegramId = ctx.from.id;
  let user = db.getUser(telegramId);

  let referrerDbId = null;
  let inviteValid = false;

  if (payload) {
    if (payload.startsWith('ref_')) {
      const refTgId = parseInt(payload.slice(4));
      if (!isNaN(refTgId) && refTgId !== telegramId) {
        const refUser = db.getUser(refTgId);
        if (refUser) { referrerDbId = refUser.id; inviteValid = true; }
      }
    } else {
      const codeRow = db.validateInviteCode(payload);
      if (codeRow) inviteValid = true;
    }
  }

  if (!user) {
    // Админы всегда могут войти без инвайта
    if (!inviteValid && !isAdmin(ctx.from.id)) {
      return ctx.reply(
        '🔒 <b>Доступ ограничен</b>\n\nБот доступен только по реферальной ссылке или инвайт-коду.\nОбратитесь к администратору.',
        { parse_mode: 'HTML' }
      );
    }
    db.createUser(telegramId, ctx.from.username, ctx.from.first_name, referrerDbId);
    if (payload && !payload.startsWith('ref_')) db.deactivateInviteCode(payload);
    user = db.getUser(telegramId);
  }

  if (user.is_verified) {
    return ctx.reply(
      `👋 С возвращением, <b>${ctx.from.first_name}</b>!\n\nВыберите раздел в меню ниже.`,
      { parse_mode: 'HTML', ...kbMainMenu() }
    );
  }

  return ctx.reply(
    `👋 Привет, <b>${ctx.from.first_name}</b>!\n\nДобро пожаловать! Чтобы получить доступ к боту, необходимо пройти <b>верификацию</b>.\n\nНажмите кнопку ниже, чтобы начать.`,
    { parse_mode: 'HTML', ...kbStartVerification() }
  );
};

// ─── Verification ─────────────────────────────────────────────────────────────

export const handleVerificationStart = async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user) return ctx.reply('Сначала напишите /start');
  if (user.is_verified) return ctx.reply('Вы уже верифицированы!', kbMainMenu());

  setSession(ctx.from.id, { state: 'verification', photos: [] });
  return ctx.reply(
    '📸 <b>Верификация</b>\n\nОтправьте ваши фотографии для подтверждения личности.\nМожно отправить несколько фото.\n\nКогда закончите — нажмите <b>«Я отправил(а) все фото»</b>.',
    { parse_mode: 'HTML', ...kbVerificationDone() }
  );
};

export const handleVerificationPhoto = async (ctx) => {
  const session = getSession(ctx.from.id);
  if (session.state !== 'verification') return;

  const user = db.getUser(ctx.from.id);
  const fileId = ctx.message.photo.at(-1).file_id;
  db.saveVerificationPhoto(user.id, fileId);

  const photos = session.photos || [];
  photos.push(fileId);
  updateSession(ctx.from.id, { photos });

  return ctx.reply(`✅ Фото #${photos.length} получено. Можете отправить ещё или нажмите «Я отправил(а) все фото».`);
};

export const handleVerificationDone = async (ctx, bot) => {
  const session = getSession(ctx.from.id);
  const photos = session.photos || [];

  if (!photos.length) return ctx.reply('❗ Пожалуйста, сначала отправьте хотя бы одно фото.');

  clearSession(ctx.from.id);
  const user = db.getUser(ctx.from.id);

  await ctx.reply(
    '⏳ <b>Фото отправлены на проверку!</b>\n\nАдминистратор рассмотрит вашу заявку и откроет доступ к боту.\nОжидайте уведомления.',
    { parse_mode: 'HTML', ...kbStartVerification() }
  );

  const adminText =
    `🔐 <b>Новая верификация</b>\n\n` +
    `Имя: ${ctx.from.first_name}\n` +
    `Username: @${ctx.from.username || '—'}\n` +
    `ID: <code>${ctx.from.id}</code>\n` +
    `Фото: ${photos.length} шт.`;

  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, adminText, { parse_mode: 'HTML', ...kbAdminVerif(user.id) });
      for (const fid of photos) await bot.telegram.sendPhoto(adminId, fid);
    } catch {}
  }
};

// ─── Balance ──────────────────────────────────────────────────────────────────

export const handleBalance = async (ctx) => {
  if (!await requireVerified(ctx)) return;
  const u = db.getUser(ctx.from.id);
  return ctx.reply(
    `💰 <b>Ваш баланс</b>\n\n` +
    `💵 Общий баланс: <b>$${u.balance.toFixed(2)}</b>\n` +
    `📋 Доход с регистраций: <b>$${u.registration_balance.toFixed(2)}</b>\n` +
    `👥 Доход с рефералов: <b>$${u.referral_balance.toFixed(2)}</b>`,
    { parse_mode: 'HTML' }
  );
};

// ─── Referral ─────────────────────────────────────────────────────────────────

export const handleReferral = async (ctx, botUsername) => {
  if (!await requireVerified(ctx)) return;
  const u = db.getUser(ctx.from.id);
  const link = `https://t.me/${botUsername}?start=ref_${ctx.from.id}`;
  const refs = db.getReferrals(u.id);
  return ctx.reply(
    `👥 <b>Реферальная программа</b>\n\n` +
    `Приглашайте друзей и получайте % от их подтверждённых регистраций.\n\n` +
    `🔗 Ваша ссылка:\n<code>${link}</code>\n\n` +
    `👤 Рефералов: <b>${refs.length}</b>\n` +
    `💰 Заработано с рефералов: <b>$${u.referral_balance.toFixed(2)}</b>`,
    { parse_mode: 'HTML' }
  );
};

// ─── Contact Manager ──────────────────────────────────────────────────────────

export const handleContactManager = async (ctx) => {
  if (!await requireVerified(ctx)) return;
  return ctx.reply(`📞 Свяжитесь с нашим менеджером:\n${MANAGER_USERNAME}`);
};

// ─── Channel ──────────────────────────────────────────────────────────────────

export const handleChannel = async (ctx) => {
  if (!await requireVerified(ctx)) return;
  return ctx.reply(`📢 Наш канал:\n${CHANNEL_URL}`);
};

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const handleWallet = async (ctx) => {
  if (!await requireVerified(ctx)) return;
  const u = db.getUser(ctx.from.id);
  if (u.wallet) {
    return ctx.reply(
      `💳 <b>Ваш кошелек</b>\n\n<code>${u.wallet}</code>`,
      { parse_mode: 'HTML', ...kbWalletActions() }
    );
  }
  setSession(ctx.from.id, { state: 'wallet' });
  return ctx.reply(
    '💳 <b>Кошелек не привязан</b>\n\nВведите адрес USDT-кошелька (TRC20):',
    { parse_mode: 'HTML', ...kbCancel() }
  );
};

export const handleWalletEdit = async (ctx) => {
  setSession(ctx.from.id, { state: 'wallet' });
  await ctx.answerCbQuery();
  return ctx.reply('✏️ Введите новый адрес USDT-кошелька (TRC20):', kbCancel());
};

export const handleWalletInput = async (ctx) => {
  const addr = ctx.message.text.trim();
  if (addr.length < 10) return ctx.reply('❗ Введите корректный адрес кошелька.');
  db.updateWallet(ctx.from.id, addr);
  clearSession(ctx.from.id);
  return ctx.reply(
    `✅ Кошелек сохранён:\n<code>${addr}</code>`,
    { parse_mode: 'HTML', ...kbMainMenu() }
  );
};

// ─── Withdrawal ───────────────────────────────────────────────────────────────

export const handleWithdrawal = async (ctx) => {
  if (!await requireVerified(ctx)) return;
  const u = db.getUser(ctx.from.id);
  if (!u.wallet) return ctx.reply('❗ Сначала привяжите кошелек в разделе 💳 «Кошелек».', kbMainMenu());
  if (u.balance <= 0) return ctx.reply('❗ На вашем балансе нет средств для вывода.', kbMainMenu());

  setSession(ctx.from.id, { state: 'withdrawal' });
  return ctx.reply(
    `💸 <b>Вывод средств</b>\n\n` +
    `Ваш баланс: <b>$${u.balance.toFixed(2)}</b>\n` +
    `Кошелек: <code>${u.wallet}</code>\n\n` +
    `Введите сумму для вывода:`,
    { parse_mode: 'HTML', ...kbCancel() }
  );
};

export const handleWithdrawalAmount = async (ctx, bot) => {
  const amount = parseFloat(ctx.message.text.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return ctx.reply('❗ Введите корректную сумму (например: 5.00)');

  const u = db.getUser(ctx.from.id);
  if (amount > u.balance) return ctx.reply(`❗ Недостаточно средств. Ваш баланс: $${u.balance.toFixed(2)}`);

  db.deductBalance(u.id, amount);
  const wdId = db.createWithdrawal(u.id, amount, u.wallet);
  clearSession(ctx.from.id);

  await ctx.reply(
    `✅ Заявка на вывод <b>$${amount.toFixed(2)}</b> отправлена!\nОжидайте подтверждения от администратора.`,
    { parse_mode: 'HTML', ...kbMainMenu() }
  );

  const adminText =
    `💸 <b>Новая заявка на вывод #${wdId}</b>\n\n` +
    `Пользователь: ${u.first_name} (@${u.username || '—'})\n` +
    `Сумма: <b>$${amount.toFixed(2)}</b>\n` +
    `Кошелек: <code>${u.wallet}</code>`;
  await notifyAdmins(bot, adminText, kbAdminWithdrawal(wdId));
};

// ─── Sites ────────────────────────────────────────────────────────────────────

export const handleSites = async (ctx) => {
  if (!await requireVerified(ctx)) return;
  const user = db.getUser(ctx.from.id);
  const sites = db.getSites();
  if (!sites.length) return ctx.reply('Список сайтов пока пуст.');
  const regMap = getSitesMap(user.id);
  return ctx.reply(
    '📋 <b>Сайты для регистрации</b>\n\nВыберите сайт:',
    { parse_mode: 'HTML', ...kbSitesList(sites, regMap) }
  );
};

export const handleSitesBack = async (ctx) => {
  const user = db.getUser(ctx.from.id);
  const sites = db.getSites();
  const regMap = getSitesMap(user.id);
  await ctx.editMessageText(
    '📋 <b>Сайты для регистрации</b>\n\nВыберите сайт:',
    { parse_mode: 'HTML', ...kbSitesList(sites, regMap) }
  );
  return ctx.answerCbQuery();
};

export const handleSiteDetail = async (ctx) => {
  const siteId = parseInt(ctx.match[1]);
  const site = db.getSite(siteId);
  if (!site) return ctx.answerCbQuery('Сайт не найден', { show_alert: true });

  const user = db.getUser(ctx.from.id);
  const reg = db.getUserRegistration(user.id, siteId);

  const statusText =
    reg?.status === 'pending'  ? '\n\n⏳ <b>Статус:</b> На проверке' :
    reg?.status === 'approved' ? '\n\n✅ <b>Статус:</b> Подтверждено' :
    reg?.status === 'rejected' ? '\n\n❌ <b>Статус:</b> Отклонено' : '';

  const alreadySubmitted = reg && ['pending', 'approved'].includes(reg.status);

  await ctx.editMessageText(
    `🌐 <b>${site.name}</b>\n💰 Оплата: <b>$${site.payment}</b>\n🔗 Ссылка: ${site.url}${statusText}`,
    { parse_mode: 'HTML', ...kbSiteDetail(siteId, alreadySubmitted, site.url) }
  );
  return ctx.answerCbQuery();
};

export const handleSiteDone = async (ctx, bot) => {
  const siteId = parseInt(ctx.match[1]);
  const user = db.getUser(ctx.from.id);
  const site = db.getSite(siteId);

  const existing = db.getUserRegistration(user.id, siteId);

  if (existing) {
    if (existing.status === 'rejected') {
      // Повторная подача после отклонения
      db.resetRejectedRegistration(user.id, siteId);
    } else if (existing.status === 'pending' || existing.status === 'approved') {
      return ctx.answerCbQuery('Вы уже отправили заявку по этому сайту!', { show_alert: true });
    }
  } else {
    db.createRegistration(user.id, siteId);
  }

  const reg = db.getUserRegistration(user.id, siteId);

  await ctx.editMessageText(
    `⏳ <b>Регистрация отправлена на проверку</b>\n\n` +
    `Сайт: <b>${site.name}</b>\nОплата: <b>$${site.payment}</b>\n\n` +
    `Администратор проверит вашу регистрацию и начислит оплату.`,
    { parse_mode: 'HTML', ...kbAfterDone() }
  );
  await ctx.answerCbQuery('✅ Заявка отправлена на проверку!', { show_alert: true });

  const adminText =
    `📝 <b>Новая регистрация #${reg.id}</b>\n\n` +
    `Пользователь: ${user.first_name} (@${user.username || '—'})\n` +
    `ID: <code>${ctx.from.id}</code>\n` +
    `Сайт: <b>${site.name}</b>\n` +
    `Оплата: <b>$${site.payment}</b>`;
  await notifyAdmins(bot, adminText, kbAdminReg(reg.id));
};

// ─── Universal text router ────────────────────────────────────────────────────

export const handleTextMessage = async (ctx, bot, botUsername) => {
  const text = ctx.message.text;
  const session = getSession(ctx.from.id);

  // Cancel
  if (text === '❌ Отмена') {
    clearSession(ctx.from.id);
    return ctx.reply('Отменено.', kbMainMenu());
  }

  // FSM states
  if (session.state === 'verification') {
    if (text === '✅ Я отправил(а) все фото') return handleVerificationDone(ctx, bot);
    return ctx.reply('📸 Отправьте фото или нажмите «Я отправил(а) все фото».');
  }
  if (session.state === 'wallet')      return handleWalletInput(ctx);
  if (session.state === 'withdrawal')  return handleWithdrawalAmount(ctx, bot);

  // Admin site FSM
  if (session.state === 'admin_site_name') return handleAdminSiteName(ctx);
  if (session.state === 'admin_site_url')  return handleAdminSiteUrl(ctx);
  if (session.state === 'admin_site_pay')  return handleAdminSitePay(ctx);
  if (session.state === 'admin_site_ref')  return handleAdminSiteRef(ctx);

  // Admin top-up FSM
  if (session.state === 'admin_topup_id')     return handleAdminTopupId(ctx);
  if (session.state === 'admin_topup_amount') return handleAdminTopupAmount(ctx, bot);

  // Menu buttons
  switch (text) {
    case '🔐 Пройти верификацию':     return handleVerificationStart(ctx);
    case '📋 Сайты для регистрации':  return handleSites(ctx);
    case '💰 Баланс':                 return handleBalance(ctx);
    case '👥 Реферальная программа':  return handleReferral(ctx, botUsername);
    case '💳 Кошелек':                return handleWallet(ctx);
    case '💸 Вывод средств':          return handleWithdrawal(ctx);
    case '📞 Связаться с менеджером': return handleContactManager(ctx);
    case '📢 Наш канал':              return handleChannel(ctx);
  }
};

// ─── Admin site FSM ───────────────────────────────────────────────────────────

const handleAdminSiteName = async (ctx) => {
  updateSession(ctx.from.id, { state: 'admin_site_url', name: ctx.message.text.trim() });
  return ctx.reply('Введите URL сайта (ссылка для регистрации):');
};

const handleAdminSiteUrl = async (ctx) => {
  updateSession(ctx.from.id, { state: 'admin_site_pay', url: ctx.message.text.trim() });
  return ctx.reply('Введите сумму оплаты (в $, например: 3.5):');
};

const handleAdminSitePay = async (ctx) => {
  const payment = parseFloat(ctx.message.text.replace(',', '.'));
  if (isNaN(payment)) return ctx.reply('❗ Введите число, например: 3.5');
  updateSession(ctx.from.id, { state: 'admin_site_ref', payment });
  return ctx.reply('Введите реферальный % (например: 10):');
};

const handleAdminSiteRef = async (ctx) => {
  const refPercent = parseFloat(ctx.message.text.replace(',', '.'));
  if (isNaN(refPercent)) return ctx.reply('❗ Введите число, например: 10');

  const session = getSession(ctx.from.id);
  if (session.editingSiteId) {
    db.updateSite(session.editingSiteId, session.name, session.url, session.payment, refPercent);
    clearSession(ctx.from.id);
    return ctx.reply(`✅ Сайт <b>${session.name}</b> обновлён!`, { parse_mode: 'HTML', ...kbMainMenu() });
  } else {
    db.addSite(session.name, session.url, session.payment, refPercent);
    clearSession(ctx.from.id);
    return ctx.reply(
      `✅ Сайт <b>${session.name}</b> добавлен!\nОплата: $${session.payment} | Реф: ${refPercent}%`,
      { parse_mode: 'HTML' }
    );
  }
};

// ─── Admin top-up FSM ─────────────────────────────────────────────────────────

const handleAdminTopupId = async (ctx) => {
  const input = ctx.message.text.trim();

  let user = null;

  if (input.startsWith('@')) {
    user = db.getUserByUsername(input);
  } else {
    const telegramId = parseInt(input);
    if (!isNaN(telegramId)) user = db.getUser(telegramId);
  }

  if (!user) return ctx.reply(
    '❗ Пользователь не найден.\n\nПроверьте @username или ID — пользователь должен был хотя бы раз написать боту.'
  );

  updateSession(ctx.from.id, {
    state: 'admin_topup_amount',
    topupUserId: user.id,
    topupUserName: user.first_name,
    topupTgId: user.telegram_id,
  });
  return ctx.reply(
    `👤 Пользователь: <b>${user.first_name}</b> (@${user.username || '—'})\n` +
    `ID: <code>${user.telegram_id}</code>\n` +
    `Текущий баланс: <b>$${user.balance.toFixed(2)}</b>\n\n` +
    `Введите сумму пополнения:`,
    { parse_mode: 'HTML' }
  );
};

const handleAdminTopupAmount = async (ctx, bot) => {
  const amount = parseFloat(ctx.message.text.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return ctx.reply('❗ Введите корректную сумму (например: 10.00)');

  const session = getSession(ctx.from.id);
  db.addBalance(session.topupUserId, amount, 'registration');
  clearSession(ctx.from.id);

  await ctx.reply(
    `✅ Баланс пользователя <b>${session.topupUserName}</b> пополнен на <b>$${amount.toFixed(2)}</b>`,
    { parse_mode: 'HTML' }
  );

  try {
    await bot.telegram.sendMessage(
      session.topupTgId,
      `💰 <b>Баланс пополнен!</b>\n\nНа ваш счёт зачислено: <b>$${amount.toFixed(2)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch {}
};
