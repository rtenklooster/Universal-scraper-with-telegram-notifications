import knex from 'knex';
import path from 'path';
import fs from 'fs';
import config from './config';
import logger from './logger';

// Zorg ervoor dat de data map bestaat
const dataDir = path.dirname(config.database.path);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Maak de logs map aan voor logging
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

// Configureer database verbinding
const db = knex({
  client: config.database.type,
  connection: {
    filename: config.database.path,
  },
  useNullAsDefault: true,
});

// Database migratie functie
async function migrateDatabase() {
  try {
    // Ensure the products table exists first
    const hasProductsTable = await db.schema.hasTable('products');
    if (!hasProductsTable) {
      logger.error('Products table does not exist, cannot run migrations');
      return;
    }

    // Check and add location column
    const hasLocationColumn = await db.schema.hasColumn('products', 'location');
    if (!hasLocationColumn) {
      await db.schema.table('products', (table) => {
        table.string('location');
      });
      logger.info('Location kolom toegevoegd aan products tabel');
    }

    // Check and add distanceMeters column
    const hasDistanceMetersColumn = await db.schema.hasColumn('products', 'distanceMeters');
    if (!hasDistanceMetersColumn) {
      await db.schema.table('products', (table) => {
        table.integer('distanceMeters');
      });
      logger.info('DistanceMeters kolom toegevoegd aan products tabel');
    }

    // Check and add priceType column
    const hasPriceTypeColumn = await db.schema.hasColumn('products', 'priceType');
    if (!hasPriceTypeColumn) {
      await db.schema.table('products', (table) => {
        table.string('priceType');
      });
      logger.info('PriceType kolom toegevoegd aan products tabel');
    }

    logger.info('Database migratie succesvol afgerond');
  } catch (error) {
    logger.error('Fout bij migreren van database:', error);
    throw error;
  }
}

// Database initialisatie functie
export async function initializeDatabase() {
  try {
    // Controleer of de database al bestaat
    const exists = await db.schema.hasTable('products');
    
    if (!exists) {
      logger.info('Database initialisatie gestart...');

      // Maak gebruikers tabel aan als deze nog niet bestaat
      const hasUsersTable = await db.schema.hasTable('users');
      if (!hasUsersTable) {
        await db.schema.createTable('users', (table) => {
          table.increments('id').primary();
          table.integer('telegramId').notNullable().unique();
          table.string('username');
          table.string('firstName');
          table.string('lastName');
          table.timestamp('joinedAt').defaultTo(db.fn.now());
          table.boolean('isActive').defaultTo(true);
        });
        logger.info('Gebruikers tabel aangemaakt');
      }

      // Maak retailers tabel aan als deze nog niet bestaat
      const hasRetailersTable = await db.schema.hasTable('retailers');
      if (!hasRetailersTable) {
        await db.schema.createTable('retailers', (table) => {
          table.increments('id').primary();
          table.string('name').notNullable();
          table.string('baseUrl').notNullable();
          table.boolean('useRotatingProxy').defaultTo(false);
          table.boolean('useRandomUserAgent').defaultTo(false);
          table.boolean('isActive').defaultTo(true);
        });
        logger.info('Retailers tabel aangemaakt');

        // Voeg standaard retailers toe
        await db('retailers').insert([
          { name: 'Lidl', baseUrl: 'https://www.lidl.nl', useRotatingProxy: false, useRandomUserAgent: true, isActive: true },
          { name: 'Marktplaats', baseUrl: 'https://www.marktplaats.nl', useRotatingProxy: false, useRandomUserAgent: true, isActive: true },
          { name: 'Vinted', baseUrl: 'https://www.vinted.nl', useRotatingProxy: false, useRandomUserAgent: true, isActive: true },
        ]);
        logger.info('Standaard retailers toegevoegd');
      }

      // Maak search queries tabel aan als deze nog niet bestaat
      const hasSearchQueriesTable = await db.schema.hasTable('search_queries');
      if (!hasSearchQueriesTable) {
        await db.schema.createTable('search_queries', (table) => {
          table.increments('id').primary();
          table.integer('userId').notNullable().references('id').inTable('users');
          table.integer('retailerId').notNullable().references('id').inTable('retailers');
          table.string('searchText').notNullable();
          table.string('apiUrl');  // Add this line
          table.timestamp('createdAt').defaultTo(db.fn.now());
          table.timestamp('lastScrapedAt');
          table.boolean('isActive').defaultTo(true);
          table.integer('intervalMinutes').defaultTo(config.scraping.defaultIntervalMinutes);
          // New notification preferences
          table.boolean('notifyOnNew').defaultTo(true);
          table.boolean('notifyOnPriceDrops').defaultTo(true);
          table.integer('priceDropThresholdPercent');
        });
        logger.info('Search queries tabel aangemaakt');
      } else {
        // Check if we need to add apiUrl column
        const hasApiUrlColumn = await db.schema.hasColumn('search_queries', 'apiUrl');
        if (!hasApiUrlColumn) {
          await db.schema.alterTable('search_queries', (table) => {
            table.string('apiUrl');
          });
          logger.info('ApiUrl kolom toegevoegd aan search_queries tabel');
        }
      }

      // Maak products tabel aan als deze nog niet bestaat
      const hasProductsTable = await db.schema.hasTable('products');
      if (!hasProductsTable) {
        await db.schema.createTable('products', (table) => {
          table.increments('id').primary();
          table.integer('retailerId').notNullable().references('id').inTable('retailers');
          table.string('externalId').notNullable();
          table.string('title').notNullable();
          table.text('description');
          table.decimal('price', 10, 2).notNullable();
          table.decimal('oldPrice', 10, 2);
          table.string('currency').notNullable().defaultTo('EUR');
          table.string('imageUrl');
          table.string('productUrl').notNullable();
          table.string('location');
          table.integer('distanceMeters');
          table.timestamp('discoveredAt').defaultTo(db.fn.now());
          table.timestamp('lastCheckedAt').defaultTo(db.fn.now());
          table.boolean('isAvailable').defaultTo(true);

          // Uniqueness constraint op external ID en retailer
          table.unique(['retailerId', 'externalId']);
        });
        logger.info('Products tabel aangemaakt');
      }

      // Maak notifications tabel aan als deze nog niet bestaat
      const hasNotificationsTable = await db.schema.hasTable('notifications');
      if (!hasNotificationsTable) {
        await db.schema.createTable('notifications', (table) => {
          table.increments('id').primary();
          table.integer('userId').notNullable().references('id').inTable('users');
          table.integer('productId').notNullable().references('id').inTable('products');
          table.integer('searchQueryId').notNullable().references('id').inTable('search_queries');
          table.enum('notificationType', ['NEW_PRODUCT', 'PRICE_DROP']).notNullable();
          table.timestamp('createdAt').defaultTo(db.fn.now());
          table.boolean('isRead').defaultTo(false);
        });
        logger.info('Notifications tabel aangemaakt');
      }

      logger.info('Database initialisatie voltooid');
    }

    // Voer migraties uit voor bestaande databases
    await migrateDatabase();
    
    logger.info('Database initialisatie voltooid');
  } catch (error) {
    logger.error('Fout bij initialiseren van database:', error);
    throw error;
  }
}

export default db;