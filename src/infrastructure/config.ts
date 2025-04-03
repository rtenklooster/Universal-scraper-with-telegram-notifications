import dotenv from 'dotenv';
import path from 'path';

// Laad .env bestand
dotenv.config();

const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  scraping: {
    defaultIntervalMinutes: parseInt(process.env.DEFAULT_SCRAPE_INTERVAL_MINUTES || '60', 10),
  },
  database: {
    type: process.env.DATABASE_TYPE || 'sqlite',
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/multiscraper.db'),
    // MSSQL specific configuration
    server: process.env.DATABASE_SERVER,
    name: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    port: parseInt(process.env.DATABASE_PORT || '1433', 10),
    options: {
      encrypt: true,
      trustServerCertificate: false,
    }
  },
  proxy: {
    useRotatingProxy: process.env.USE_ROTATING_PROXY === 'true',
    url: process.env.PROXY_URL || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  web: {
    url: process.env.WEB_URL || 'http://localhost:3000',
    tokenExpiryHours: parseInt(process.env.WEB_TOKEN_EXPIRY_HOURS || '24', 10),
    adminToken: process.env.ADMIN_TOKEN
  },
};

export default config;