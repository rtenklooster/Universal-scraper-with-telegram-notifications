import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import config from './config';
import logger from './logger';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

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
    if (config.database.type === 'mssql') {
      // Check of de constraints al bestaan voordat we ze proberen aan te maken
      const existingConstraints = await db.raw(`
        SELECT name 
        FROM sys.foreign_keys
        WHERE OBJECT_NAME(parent_object_id) IN ('notifications', 'products', 'search_queries');
      `);

      const constraintNames = new Set(existingConstraints.map((row: any) => row.name));

      const constraints = [
        {
          name: 'FK_notifications_products',
          sql: `ALTER TABLE notifications ADD CONSTRAINT FK_notifications_products 
               FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE`
        },
        {
          name: 'FK_notifications_search_queries',
          sql: `ALTER TABLE notifications ADD CONSTRAINT FK_notifications_search_queries 
               FOREIGN KEY (searchQueryId) REFERENCES search_queries(id) ON DELETE CASCADE`
        },
        {
          name: 'FK_notifications_users',
          sql: `ALTER TABLE notifications ADD CONSTRAINT FK_notifications_users 
               FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE`
        },
        {
          name: 'FK_products_retailers',
          sql: `ALTER TABLE products ADD CONSTRAINT FK_products_retailers 
               FOREIGN KEY (retailerId) REFERENCES retailers(id) ON DELETE CASCADE`
        },
        {
          name: 'FK_products_search_queries',
          sql: `ALTER TABLE products ADD CONSTRAINT FK_products_search_queries 
               FOREIGN KEY (queryId) REFERENCES search_queries(id) ON DELETE CASCADE`
        },
        {
          name: 'FK_search_queries_users',
          sql: `ALTER TABLE search_queries ADD CONSTRAINT FK_search_queries_users 
               FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE`
        },
        {
          name: 'FK_search_queries_retailers',
          sql: `ALTER TABLE search_queries ADD CONSTRAINT FK_search_queries_retailers 
               FOREIGN KEY (retailerId) REFERENCES retailers(id) ON DELETE CASCADE`
        }
      ];

      // Voeg alleen constraints toe die nog niet bestaan
      for (const constraint of constraints) {
        if (!constraintNames.has(constraint.name)) {
          try {
            await db.raw(constraint.sql);
            logger.info(`Foreign key constraint ${constraint.name} toegevoegd`);
          } catch (error) {
            logger.error(`Fout bij toevoegen constraint ${constraint.name}: ${error}`);
          }
        }
      }
    } else {
      // SQLite specifieke code
      await db.schema.table('notifications', table => {
        table.dropForeign(['productId']);
        table.dropForeign(['searchQueryId']);
        table.dropForeign(['userId']);
      });

      await db.schema.table('products', table => {
        table.dropForeign(['retailerId']);
        table.dropForeign(['queryId']);
      });

      await db.schema.table('search_queries', table => {
        table.dropForeign(['userId']);
        table.dropForeign(['retailerId']);
      });

      // Recreate foreign keys with CASCADE delete
      await db.schema.table('notifications', table => {
        table.foreign('productId').references('id').inTable('products').onDelete('CASCADE');
        table.foreign('searchQueryId').references('id').inTable('search_queries').onDelete('CASCADE');
        table.foreign('userId').references('id').inTable('users').onDelete('CASCADE');
      });

      await db.schema.table('products', table => {
        table.foreign('retailerId').references('id').inTable('retailers').onDelete('CASCADE');
        table.foreign('queryId').references('id').inTable('search_queries').onDelete('CASCADE');
      });

      await db.schema.table('search_queries', table => {
        table.foreign('userId').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('retailerId').references('id').inTable('retailers').onDelete('CASCADE');
      });
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
        table.float('distanceMeters').nullable();
      });
      logger.info('DistanceMeters kolom toegevoegd aan products tabel');
    }

    // Check and add apiUrl column
    const hasApiUrlColumn = await db.schema.hasColumn('search_queries', 'apiUrl');
    if (!hasApiUrlColumn) {
      await db.schema.table('search_queries', (table) => {
        table.string('apiUrl', 2000).nullable();
      });
      logger.info('ApiUrl kolom toegevoegd aan search_queries tabel');
    }

    // Add admin flag to users table if it doesn't exist
    const hasAdminColumn = await db.schema.hasColumn('users', 'isAdmin');
    if (!hasAdminColumn) {
      await db.schema.table('users', (table) => {
        table.boolean('isAdmin').defaultTo(false);
      });
      logger.info('Admin flag added to users table');
    }

    // Create user_tokens table if it doesn't exist
    const hasTokensTable = await db.schema.hasTable('user_tokens');
    if (!hasTokensTable) {
      await db.schema.createTable('user_tokens', (table) => {
        table.string('token', 64).primary();
        table.integer('userId').notNullable();
        table.timestamp('createdAt').defaultTo(db.fn.now());
        table.timestamp('expiresAt').notNullable();
        table.foreign('userId').references('id').inTable('users').onDelete('CASCADE');
      });
      logger.info('User tokens table created');
    }

    logger.info('Database migratie succesvol uitgevoerd');
  } catch (error) {
    logger.error(`Fout bij migreren van database: ${error}`);
    throw error;
  }
}

// Database initialization function
export async function initializeDatabase() {
  const maxRetries = 5; // Maximaal aantal pogingen
  const retryDelay = 5000; // Wachttijd tussen pogingen in milliseconden

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      return; // Stop als de initialisatie succesvol is
    } catch (error) {
      logger.error(`Fout bij initialiseren van database (poging ${attempt} van ${maxRetries}):`, error);

      if (attempt < maxRetries) {
        logger.info(`Wachten ${retryDelay / 1000} seconden voordat opnieuw geprobeerd wordt...`);
        await sleep(retryDelay);
      } else {
        logger.error('Maximaal aantal pogingen bereikt. Kan geen verbinding maken met de database.');
        throw error; // Gooi de fout opnieuw als alle pogingen mislukken
      }
    }
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

export async function createUserToken(userId: number, expiresInHours: number = 24): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  await db('user_tokens').insert({
    token,
    userId,
    expiresAt
  });

  return token;
}

export async function validateUserToken(token: string): Promise<number | null> {
  const result = await db('user_tokens')
    .where('token', token)
    .where('expiresAt', '>', db.fn.now())
    .first();

  if (!result) {
    return null;
  }

  return result.userId;
}

export async function cleanupExpiredTokens(): Promise<void> {
  await db('user_tokens')
    .where('expiresAt', '<=', db.fn.now())
    .delete();
}

export default db;