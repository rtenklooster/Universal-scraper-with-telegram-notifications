import knex from 'knex';
import path from 'path';
import fs from 'fs';
import config from './config';
import logger from './logger';

// Ensure data directory exists for SQLite
if (config.database.type === 'sqlite') {
  const dataDir = path.dirname(config.database.path);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Ensure logs directory exists
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

// Configure database connection based on type
const dbConfig = config.database.type === 'mssql' ? {
  client: 'mssql',
  connection: {
    server: config.database.server,
    database: config.database.name,
    user: config.database.username,
    password: config.database.password,
    port: config.database.port,
    options: config.database.options
  },
  pool: {
    min: 2,
    max: 10
  }
} : {
  client: 'sqlite3',
  connection: {
    filename: config.database.path,
  },
  useNullAsDefault: true,
};

// Initialize database connection
const db = knex(dbConfig);

// Database migration function
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
        table.string('location', 255);
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
        table.string('priceType', 50);
      });
      logger.info('PriceType kolom toegevoegd aan products tabel');
    }

    logger.info('Database migratie succesvol afgerond');
  } catch (error) {
    logger.error('Fout bij migreren van database:', error);
    throw error;
  }
}

// Database initialization function
export async function initializeDatabase() {
  try {
    const exists = await db.schema.hasTable('products');
    
    if (!exists) {
      logger.info('Database initialisatie gestart...');

      // Create users table
      const hasUsersTable = await db.schema.hasTable('users');
      if (!hasUsersTable) {
        await db.schema.createTable('users', (table) => {
          table.increments('id').primary();
          table.integer('telegramId').notNullable().unique();
          table.string('username', 255);
          table.string('firstName', 255);
          table.string('lastName', 255);
          table.dateTime('joinedAt').defaultTo(db.fn.now());
          table.boolean('isActive').defaultTo(true);
        });
        logger.info('Gebruikers tabel aangemaakt');
      }

      // Create retailers table
      const hasRetailersTable = await db.schema.hasTable('retailers');
      if (!hasRetailersTable) {
        await db.schema.createTable('retailers', (table) => {
          table.increments('id').primary();
          table.string('name', 255).notNullable();
          table.string('baseUrl', 255).notNullable();
          table.boolean('useRotatingProxy').defaultTo(false);
          table.boolean('useRandomUserAgent').defaultTo(false);
          table.boolean('isActive').defaultTo(true);
        });
        logger.info('Retailers tabel aangemaakt');

        // Insert default retailers
        const defaultRetailers = [
          { name: 'Lidl', baseUrl: 'https://www.lidl.nl', useRotatingProxy: false, useRandomUserAgent: true, isActive: true },
          { name: 'Marktplaats', baseUrl: 'https://www.marktplaats.nl', useRotatingProxy: false, useRandomUserAgent: true, isActive: true },
          { name: 'Vinted', baseUrl: 'https://www.vinted.nl', useRotatingProxy: false, useRandomUserAgent: true, isActive: true },
        ];

        // Insert retailers using insertAndGetId
        for (const retailer of defaultRetailers) {
          const id = await insertAndGetId('retailers', retailer);
          logger.debug(`Retailer ${retailer.name} toegevoegd met ID ${id}`);
        }
        logger.info('Standaard retailers toegevoegd');
      }

      // Create search queries table
      const hasSearchQueriesTable = await db.schema.hasTable('search_queries');
      if (!hasSearchQueriesTable) {
        await db.schema.createTable('search_queries', (table) => {
          table.increments('id').primary();
          table.integer('userId').notNullable();
          table.integer('retailerId').notNullable();
          table.string('searchText', 500).notNullable();
          table.string('apiUrl', 1000);
          table.dateTime('createdAt').defaultTo(db.fn.now());
          table.dateTime('lastScrapedAt');
          table.boolean('isActive').defaultTo(true);
          table.integer('intervalMinutes').defaultTo(config.scraping.defaultIntervalMinutes);
          table.boolean('notifyOnNew').defaultTo(true);
          table.boolean('notifyOnPriceDrops').defaultTo(true);
          table.integer('priceDropThresholdPercent');
          
          // Add foreign key constraints
          table.foreign('userId').references('id').inTable('users');
          table.foreign('retailerId').references('id').inTable('retailers');
        });
        logger.info('Search queries tabel aangemaakt');
      }

      // Create products table
      const hasProductsTable = await db.schema.hasTable('products');
      if (!hasProductsTable) {
        await db.schema.createTable('products', (table) => {
          table.increments('id').primary();
          table.integer('retailerId').notNullable();
          table.string('externalId', 255).notNullable();
          table.string('title', 500).notNullable();
          table.text('description');
          table.decimal('price', 10, 2).notNullable();
          table.decimal('oldPrice', 10, 2);
          table.string('currency', 3).notNullable().defaultTo('EUR');
          table.string('imageUrl', 1000);
          table.string('productUrl', 1000).notNullable();
          table.string('location', 255);
          table.integer('distanceMeters');
          table.string('priceType', 50);
          table.dateTime('discoveredAt').defaultTo(db.fn.now());
          table.dateTime('lastCheckedAt').defaultTo(db.fn.now());
          table.boolean('isAvailable').defaultTo(true);

          // Add foreign key and unique constraint
          table.foreign('retailerId').references('id').inTable('retailers');
          table.unique(['retailerId', 'externalId']);
        });
        logger.info('Products tabel aangemaakt');
      }

      // Create notifications table
      const hasNotificationsTable = await db.schema.hasTable('notifications');
      if (!hasNotificationsTable) {
        await db.schema.createTable('notifications', (table) => {
          table.increments('id').primary();
          table.integer('userId').notNullable();
          table.integer('productId').notNullable();
          table.integer('searchQueryId').notNullable();
          table.string('notificationType', 20).notNullable().checkIn(['NEW_PRODUCT', 'PRICE_DROP']);
          table.dateTime('createdAt').defaultTo(db.fn.now());
          table.boolean('isRead').defaultTo(false);

          // Add foreign key constraints
          table.foreign('userId').references('id').inTable('users');
          table.foreign('productId').references('id').inTable('products');
          table.foreign('searchQueryId').references('id').inTable('search_queries');
        });
        logger.info('Notifications tabel aangemaakt');
      }

      logger.info('Database initialisatie voltooid');
    }

    // Run migrations for existing databases
    await migrateDatabase();
    
    logger.info('Database initialisatie voltooid');
  } catch (error) {
    logger.error('Fout bij initialiseren van database:', error);
    throw error;
  }
}

// Helper function for consistent insert operations across databases
export async function insertAndGetId(tableName: string, data: any, transaction?: any): Promise<number> {
  const trx = transaction || db;
  
  try {
    if (config.database.type === 'mssql') {
      const result = await trx(tableName)
        .insert(data)
        .returning('id');
      return result[0].id;
    } else {
      const [id] = await trx(tableName).insert(data);
      return id;
    }
  } catch (error) {
    logger.error(`Error in insertAndGetId for table ${tableName}: ${error}`);
    throw error;
  }
}

// Helper function to get the last inserted ID for a specific table
export async function getLastInsertedId(tableName: string, transaction?: any): Promise<number> {
  const trx = transaction || db;
  
  try {
    if (config.database.type === 'mssql') {
      const result = await trx.raw('SELECT SCOPE_IDENTITY() as id');
      return result[0].id;
    } else {
      const result = await trx('sqlite_sequence')
        .where('name', tableName)
        .first();
      return result ? result.seq : 0;
    }
  } catch (error) {
    logger.error(`Error getting last inserted ID for table ${tableName}: ${error}`);
    throw error;
  }
}

export default db;