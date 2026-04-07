import { Telegraf } from 'telegraf';
import { BOT_TOKEN } from './config.js';
import { isAdmin } from './handlers/admin.js';
import * as userHandlers from './handlers/user.js';
import * as adminHandlers from './handlers/admin.js';
import { getSession } from './session.js';

const bot = new Telegraf(BOT_TOKEN);

// Получаем username бота для реферальных ссылок
let botUsername = 'YourBot';
bot.telegram.getMe().then(me => { botUsername = me.username; });

// ─── Команды ──────────────────────────────────────────────────────────────────

bot.start((ctx) => userHandlers.handleStart(ctx, bot));

bot.command('admin', (ctx) => {
  if (isAdmin(ctx.from.id)) return adminHandlers.handleAdminCmd(ctx);
});

bot.command('db', (ctx) => {
  if (isAdmin(ctx.from.id)) return adminHandlers.handleDbCmd(ctx);
});

bot.hears(/^\/dbu_(\d+)$/, (ctx) => {
  if (isAdmin(ctx.from.id)) return adminHandlers.handleDbUser(ctx);
});

// ─── Текстовые сообщения (FSM роутер) ────────────────────────────────────────

bot.on('text', (ctx) => userHandlers.handleTextMessage(ctx, bot, botUsername));

// ─── Фото (верификация) ───────────────────────────────────────────────────────

bot.on('photo', (ctx) => {
  const session = getSession(ctx.from.id);
  if (session.state === 'verification') {
    return userHandlers.handleVerificationPhoto(ctx);
  }
});

// ─── Коллбэки пользователя ────────────────────────────────────────────────────

bot.action('sites_back',       (ctx) => userHandlers.handleSitesBack(ctx));
bot.action(/^site:(\d+)$/,     (ctx) => userHandlers.handleSiteDetail(ctx));
bot.action(/^done:(\d+)$/,     (ctx) => userHandlers.handleSiteDone(ctx, bot));
bot.action('wallet_edit',      (ctx) => userHandlers.handleWalletEdit(ctx));

// Adult
bot.action('adult_back',           (ctx) => userHandlers.handleAdultBack(ctx));
bot.action(/^adult_site:(\d+)$/,   (ctx) => userHandlers.handleAdultSiteDetail(ctx));
bot.action(/^adult_done:(\d+)$/,   (ctx) => userHandlers.handleAdultDone(ctx, bot));

// ─── Коллбэки администратора ──────────────────────────────────────────────────

// Хелпер — проверка прав
const ag = (fn) => (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('⛔ Нет доступа', { show_alert: true });
  return fn(ctx);
};

bot.action('admin_back',                ag((ctx) => adminHandlers.handleAdminBack(ctx)));
bot.action('admin_sites',               ag((ctx) => adminHandlers.handleAdminSites(ctx)));
bot.action('admin_regs',                ag((ctx) => adminHandlers.handleAdminRegs(ctx)));
bot.action('admin_withdrawals',         ag((ctx) => adminHandlers.handleAdminWithdrawals(ctx)));
bot.action('admin_verifs',              ag((ctx) => adminHandlers.handleAdminVerifs(ctx)));
bot.action('admin_codes',               ag((ctx) => adminHandlers.handleAdminCodes(ctx)));
bot.action('admin_code_new',            ag((ctx) => adminHandlers.handleAdminCodeNew(ctx)));
bot.action('admin_users',               ag((ctx) => adminHandlers.handleAdminUsers(ctx, 0)));
bot.action(/^admin_users_page:(\d+)$/,  ag((ctx) => adminHandlers.handleAdminUsers(ctx, parseInt(ctx.match[1]))));
bot.action('admin_site_add',            ag((ctx) => adminHandlers.handleAdminSiteAdd(ctx)));
bot.action('admin_topup',               ag((ctx) => adminHandlers.handleAdminTopup(ctx)));
bot.action(/^db_page:(\d+)$/,           ag((ctx) => adminHandlers.handleDbPage(ctx)));
bot.action('db_back',                    ag((ctx) => adminHandlers.handleDbBack(ctx)));
bot.action(/^dbu_setbal:(\d+)$/,        ag((ctx) => adminHandlers.handleDbSetBalance(ctx)));
bot.action(/^dbu_zeroval:(\d+)$/,       ag((ctx) => adminHandlers.handleDbZeroBalance(ctx)));
bot.action(/^dbu_toggleverif:(\d+)$/,   ag((ctx) => adminHandlers.handleDbToggleVerif(ctx)));
bot.action(/^dbu_delete:(\d+)$/,        ag((ctx) => adminHandlers.handleDbDelete(ctx, bot)));
bot.action('admin_export',              ag((ctx) => adminHandlers.handleAdminExport(ctx)));
bot.action('admin_broadcast',           ag((ctx) => adminHandlers.handleAdminBroadcast(ctx)));
bot.action(/^broadcast_(all|verified|unverified)$/, ag((ctx) => adminHandlers.handleBroadcastTarget(ctx)));
bot.action(/^admin_site:(\d+)$/,        ag((ctx) => adminHandlers.handleAdminSiteDetail(ctx)));
bot.action(/^admin_site_toggle:(\d+)$/, ag((ctx) => adminHandlers.handleAdminSiteToggle(ctx)));
bot.action(/^admin_site_edit:(\d+)$/,   ag((ctx) => adminHandlers.handleAdminSiteEdit(ctx)));
bot.action(/^admin_site_delete:(\d+)$/, ag((ctx) => adminHandlers.handleAdminSiteDelete(ctx)));
bot.action(/^admin_reg_ok:(\d+)$/,      ag((ctx) => adminHandlers.handleRegApprove(ctx, bot)));
bot.action(/^admin_reg_no:(\d+)$/,      ag((ctx) => adminHandlers.handleRegReject(ctx, bot)));
bot.action(/^admin_reg_next:(\d+)$/,    ag((ctx) => adminHandlers.handleAdminRegNav(ctx, 'next')));
bot.action(/^admin_reg_prev:(\d+)$/,    ag((ctx) => adminHandlers.handleAdminRegNav(ctx, 'prev')));
bot.action('admin_reg_noop',             ag((ctx) => ctx.answerCbQuery()));
bot.action(/^admin_wd_ok:(\d+)$/,       ag((ctx) => adminHandlers.handleWdApprove(ctx, bot)));
bot.action(/^admin_wd_no:(\d+)$/,       ag((ctx) => adminHandlers.handleWdReject(ctx, bot)));
bot.action(/^admin_verif_ok:(\d+)$/,    ag((ctx) => adminHandlers.handleVerifApprove(ctx, bot)));
bot.action(/^admin_verif_no:(\d+)$/,    ag((ctx) => adminHandlers.handleVerifReject(ctx, bot)));

// Adult admin actions
bot.action('admin_adult_sites',                ag((ctx) => adminHandlers.handleAdminAdultSites(ctx)));
bot.action('admin_adult_regs',                 ag((ctx) => adminHandlers.handleAdminAdultRegs(ctx)));
bot.action('admin_adult_site_add',             ag((ctx) => adminHandlers.handleAdminAdultSiteAdd(ctx)));
bot.action(/^admin_adult_site:(\d+)$/,         ag((ctx) => adminHandlers.handleAdminAdultSiteDetail(ctx)));
bot.action(/^admin_adult_site_toggle:(\d+)$/,  ag((ctx) => adminHandlers.handleAdminAdultSiteToggle(ctx)));
bot.action(/^admin_adult_site_edit:(\d+)$/,    ag((ctx) => adminHandlers.handleAdminAdultSiteEdit(ctx)));
bot.action(/^admin_adult_site_delete:(\d+)$/,  ag((ctx) => adminHandlers.handleAdminAdultSiteDelete(ctx)));
bot.action(/^admin_adult_reg_ok:(\d+)$/,       ag((ctx) => adminHandlers.handleAdultRegApprove(ctx, bot)));
bot.action(/^admin_adult_reg_no:(\d+)$/,       ag((ctx) => adminHandlers.handleAdultRegReject(ctx, bot)));
bot.action(/^admin_adult_reg_next:(\d+)$/,     ag((ctx) => adminHandlers.handleAdminAdultRegNav(ctx, 'next')));
bot.action(/^admin_adult_reg_prev:(\d+)$/,     ag((ctx) => adminHandlers.handleAdminAdultRegNav(ctx, 'prev')));

// ─── Обработка ошибок ─────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error(`[Error] ${ctx.updateType}:`, err.message);
});

// ─── Запуск ───────────────────────────────────────────────────────────────────

bot.launch({ dropPendingUpdates: true });
console.log('🤖 Бот запущен!');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));