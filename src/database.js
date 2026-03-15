import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';
import crypto from 'crypto';

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// ─── Init tables ──────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    referrer_id INTEGER,
    is_verified INTEGER DEFAULT 0,
    wallet TEXT,
    balance REAL DEFAULT 0,
    referral_balance REAL DEFAULT 0,
    registration_balance REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (referrer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    payment REAL NOT NULL,
    referral_percent REAL DEFAULT 10,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    site_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    submitted_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    UNIQUE(user_id, site_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (site_id) REFERENCES sites(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    wallet TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS verification_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_id TEXT NOT NULL,
    submitted_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Seed demo sites
const siteCount = db.prepare('SELECT COUNT(*) as c FROM sites').get().c;
if (siteCount === 0) {
  db.prepare('INSERT INTO sites (name, url, payment, referral_percent) VALUES (?,?,?,?)').run('Binance', 'https://binance.com/register', 3.0, 10);
  db.prepare('INSERT INTO sites (name, url, payment, referral_percent) VALUES (?,?,?,?)').run('Bybit', 'https://bybit.com/register', 2.0, 10);
  db.prepare('INSERT INTO sites (name, url, payment, referral_percent) VALUES (?,?,?,?)').run('Stake', 'https://stake.com/register', 5.0, 15);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const getUser = (telegramId) =>
  db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

export const getUserByDbId = (id) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export const createUser = (telegramId, username, firstName, referrerId = null) =>
  db.prepare(
    'INSERT OR IGNORE INTO users (telegram_id, username, first_name, referrer_id) VALUES (?,?,?,?)'
  ).run(telegramId, username || '', firstName || '', referrerId);

export const setVerified = (telegramId, verified) =>
  db.prepare('UPDATE users SET is_verified = ? WHERE telegram_id = ?').run(verified ? 1 : 0, telegramId);

export const updateWallet = (telegramId, wallet) =>
  db.prepare('UPDATE users SET wallet = ? WHERE telegram_id = ?').run(wallet, telegramId);

export const addBalance = (userDbId, amount, source = 'registration') => {
  if (source === 'referral') {
    db.prepare(
      'UPDATE users SET balance = balance + ?, referral_balance = referral_balance + ? WHERE id = ?'
    ).run(amount, amount, userDbId);
  } else {
    db.prepare(
      'UPDATE users SET balance = balance + ?, registration_balance = registration_balance + ? WHERE id = ?'
    ).run(amount, amount, userDbId);
  }
};

export const deductBalance = (userDbId, amount) =>
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, userDbId);

export const getAllUsers = () =>
  db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

export const getReferrals = (userDbId) =>
  db.prepare('SELECT * FROM users WHERE referrer_id = ?').all(userDbId);

// ─── Invite Codes ─────────────────────────────────────────────────────────────

const generateCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

export const createInviteCode = (createdBy = null) => {
  const code = generateCode();
  db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?,?)').run(code, createdBy);
  return code;
};

export const validateInviteCode = (code) =>
  db.prepare('SELECT * FROM invite_codes WHERE code = ? AND is_active = 1').get(code);

export const deactivateInviteCode = (code) =>
  db.prepare('UPDATE invite_codes SET is_active = 0 WHERE code = ?').run(code);

export const getAllInviteCodes = () =>
  db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all();

// ─── Sites ────────────────────────────────────────────────────────────────────

export const getSites = () =>
  db.prepare('SELECT * FROM sites WHERE is_active = 1 ORDER BY id').all();

export const getSite = (id) =>
  db.prepare('SELECT * FROM sites WHERE id = ?').get(id);

export const addSite = (name, url, payment, referralPercent) =>
  db.prepare('INSERT INTO sites (name, url, payment, referral_percent) VALUES (?,?,?,?)').run(name, url, payment, referralPercent);

export const updateSite = (id, name, url, payment, referralPercent) =>
  db.prepare('UPDATE sites SET name=?, url=?, payment=?, referral_percent=? WHERE id=?').run(name, url, payment, referralPercent, id);

export const toggleSite = (id, isActive) =>
  db.prepare('UPDATE sites SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);

export const getAllSitesAdmin = () =>
  db.prepare('SELECT * FROM sites ORDER BY id').all();

// ─── Registrations ────────────────────────────────────────────────────────────

export const getUserRegistration = (userDbId, siteId) =>
  db.prepare('SELECT * FROM registrations WHERE user_id = ? AND site_id = ?').get(userDbId, siteId);

export const createRegistration = (userDbId, siteId) =>
  db.prepare('INSERT OR IGNORE INTO registrations (user_id, site_id) VALUES (?,?)').run(userDbId, siteId);

export const resetRejectedRegistration = (userDbId, siteId) =>
  db.prepare(
    "UPDATE registrations SET status = 'pending', submitted_at = datetime('now'), reviewed_at = NULL WHERE user_id = ? AND site_id = ? AND status = 'rejected'"
  ).run(userDbId, siteId);

export const getExportData = () =>
  db.prepare(`
    SELECT
      u.telegram_id,
      u.username,
      u.first_name,
      u.balance,
      s.name AS site_name,
      r.status,
      r.submitted_at
    FROM registrations r
    JOIN users u ON r.user_id = u.id
    JOIN sites s ON r.site_id = s.id
    ORDER BY u.username, s.name
  `).all();


export const updateRegistrationStatus = (regId, status) =>
  db.prepare("UPDATE registrations SET status = ?, reviewed_at = datetime('now') WHERE id = ?").run(status, regId);

export const getPendingRegistrations = () =>
  db.prepare(`
    SELECT r.*, u.telegram_id, u.username, u.first_name,
           s.name AS site_name, s.payment
    FROM registrations r
    JOIN users u ON r.user_id = u.id
    JOIN sites s ON r.site_id = s.id
    WHERE r.status = 'pending'
    ORDER BY r.submitted_at
  `).all();

export const getRegistration = (regId) =>
  db.prepare(`
    SELECT r.*, u.telegram_id, u.username, u.first_name, u.referrer_id,
           s.name AS site_name, s.payment, s.referral_percent
    FROM registrations r
    JOIN users u ON r.user_id = u.id
    JOIN sites s ON r.site_id = s.id
    WHERE r.id = ?
  `).get(regId);

export const getUserRegistrations = (userDbId) =>
  db.prepare(`
    SELECT r.*, s.name AS site_name, s.payment
    FROM registrations r
    JOIN sites s ON r.site_id = s.id
    WHERE r.user_id = ?
  `).all(userDbId);

// ─── Withdrawals ──────────────────────────────────────────────────────────────

export const createWithdrawal = (userDbId, amount, wallet) => {
  const result = db.prepare('INSERT INTO withdrawals (user_id, amount, wallet) VALUES (?,?,?)').run(userDbId, amount, wallet);
  return result.lastInsertRowid;
};

export const getPendingWithdrawals = () =>
  db.prepare(`
    SELECT w.*, u.telegram_id, u.username, u.first_name, u.id AS user_db_id
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    WHERE w.status = 'pending'
    ORDER BY w.created_at
  `).all();

export const getWithdrawal = (id) =>
  db.prepare(`
    SELECT w.*, u.telegram_id, u.username, u.first_name, u.id AS user_db_id
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    WHERE w.id = ?
  `).get(id);

export const updateWithdrawalStatus = (id, status) =>
  db.prepare("UPDATE withdrawals SET status = ?, processed_at = datetime('now') WHERE id = ?").run(status, id);

// ─── Verification Photos ──────────────────────────────────────────────────────

export const saveVerificationPhoto = (userDbId, fileId) =>
  db.prepare('INSERT INTO verification_photos (user_id, file_id) VALUES (?,?)').run(userDbId, fileId);

export const getVerificationPhotos = (userDbId) =>
  db.prepare('SELECT * FROM verification_photos WHERE user_id = ? ORDER BY submitted_at').all(userDbId);

export const getUnverifiedUsers = () =>
  db.prepare(`
    SELECT DISTINCT u.*
    FROM users u
    JOIN verification_photos vp ON u.id = vp.user_id
    WHERE u.is_verified = 0
  `).all();

export const getUserByUsername = (username) =>
  db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.replace('@', ''));

export const deleteSite = (id) =>
  db.prepare('DELETE FROM sites WHERE id = ?').run(id);

export const getReferralEarnings = () =>
  db.prepare(`
    SELECT
      u.id AS referrer_id,
      u.username,
      u.first_name,
      u.referral_balance AS total_earned,
      COUNT(r.id) AS ref_count
    FROM users u
    LEFT JOIN users r ON r.referrer_id = u.id
    WHERE u.referral_balance > 0
    GROUP BY u.id
    ORDER BY u.referral_balance DESC
  `).all();
