import dotenv from 'dotenv';
import path from 'path';

// Laad .env bestand
dotenv.config();

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  scraping: {
    defaultIntervalMinutes: parseInt(process.env.DEFAULT_SCRAPE_INTERVAL_MINUTES || '60', 10),
  },
  database: {
    type: process.env.DATABASE_TYPE || 'sqlite',
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/multiscraper.db'),
  },
  proxy: {
    useRotatingProxy: process.env.USE_ROTATING_PROXY === 'true',
    url: process.env.PROXY_URL || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};

export default config;