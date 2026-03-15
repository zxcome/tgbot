import 'dotenv/config';

export const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
export const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => Number(id.trim()))
  : [];
export const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@manager';
export const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/yourchannel';
export const DB_PATH = './bot.db';
