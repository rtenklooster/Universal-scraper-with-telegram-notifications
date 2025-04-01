import { initializeDatabase } from './infrastructure/database';
import { TelegramBot } from './application/telegram/TelegramBot';
import { Scheduler } from './core/scheduler';
import { BaseScraper } from './application/scrapers/BaseScraper';
import { LidlScraper } from './application/scrapers/LidlScraper';
import { MarktplaatsScraper } from './application/scrapers/MarktplaatsScraper';
import { RetailerType } from './domain/Retailer';
import logger from './infrastructure/logger';
import db from './infrastructure/database';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// API endpoints
app.get('/api/queries', async (_req, res) => {
  try {
    const queries = await db('search_queries')
      .select('search_queries.*', 'retailers.name as retailerName')
      .join('retailers', 'search_queries.retailerId', 'retailers.id');
    res.json(queries);
  } catch (error) {
    logger.error(`Error fetching queries: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products', async (_req, res) => {
  try {
    const products = await db('products')
      .select('products.*', 'retailers.name as retailerName')
      .join('retailers', 'products.retailerId', 'retailers.id')
      .orderBy('discoveredAt', 'desc')
      .limit(100);
    res.json(products);
  } catch (error) {
    logger.error(`Error fetching products: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/retailers', async (_req, res) => {
  try {
    const retailers = await db('retailers').select('*');
    res.json(retailers);
  } catch (error) {
    logger.error(`Error fetching retailers: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Users endpoints
app.get('/api/users', async (_req, res) => {
  try {
    const users = await db('users')
      .select('*')
      .orderBy('joinedAt', 'desc');
    res.json(users);
  } catch (error) {
    logger.error(`Error fetching users: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notifications endpoints
app.get('/api/notifications', async (_req, res) => {
  try {
    const notifications = await db('notifications')
      .join('products', 'notifications.productId', '=', 'products.id')
      .join('retailers', 'products.retailerId', '=', 'retailers.id')
      .join('users', 'notifications.userId', '=', 'users.id')
      .join('search_queries', 'notifications.searchQueryId', '=', 'search_queries.id')
      .select(
        'notifications.*',
        'products.title as productTitle',
        'products.price as productPrice',
        'products.oldPrice as productOldPrice',
        'products.currency as productCurrency',
        'products.productUrl',
        'products.imageUrl',
        'products.location',
        'products.distanceMeters',
        'retailers.name as retailerName',
        'users.username as userName',
        'search_queries.searchText as queryText'
      )
      .orderBy('notifications.createdAt', 'desc')
      .limit(100);
    res.json(notifications);
  } catch (error) {
    logger.error(`Error fetching notifications: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRUD operations for queries
app.post('/api/queries', async (req, res) => {
  try {
    const [id] = await db('search_queries').insert(req.body);
    const query = await db('search_queries')
      .select('search_queries.*', 'retailers.name as retailerName')
      .join('retailers', 'search_queries.retailerId', 'retailers.id')
      .where('search_queries.id', id)
      .first();
    res.status(201).json(query);
  } catch (error) {
    logger.error(`Error creating query: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/queries/:id', async (req, res) => {
  try {
    // Remove non-table fields and id from the request body
    const { retailerName, id, ...updateData } = req.body;
    
    await db('search_queries')
      .where('id', req.params.id)
      .update(updateData);
      
    const query = await db('search_queries')
      .select('search_queries.*', 'retailers.name as retailerName')
      .join('retailers', 'search_queries.retailerId', 'retailers.id')
      .where('search_queries.id', req.params.id)
      .first();
    res.json(query);
  } catch (error) {
    logger.error(`Error updating query: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/queries/:id', async (req, res) => {
  try {
    await db('search_queries').where('id', req.params.id).delete();
    res.status(204).send();
  } catch (error) {
    logger.error(`Error deleting query: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create scraper factory function
const createScraper = async (retailerId: number): Promise<BaseScraper | undefined> => {
  try {
    // Get retailer from database
    const retailer = await db('retailers').where({ id: retailerId }).first();
    if (!retailer) {
      logger.error(`No retailer found with ID ${retailerId}`);
      return undefined;
    }

    // Create appropriate scraper based on retailer ID
    switch (retailerId) {
      case RetailerType.LIDL:
        return new LidlScraper(retailer);
      case RetailerType.MARKTPLAATS:
        return new MarktplaatsScraper(retailer);
      // Add more retailers as they are implemented
      // case RetailerType.VINTED:
      //   return new VintedScraper(retailer);
      default:
        logger.warn(`No scraper implementation for retailer ${retailer.name} (ID: ${retailerId})`);
        return undefined;
    }
  } catch (error) {
    logger.error(`Error creating scraper for retailer ID ${retailerId}: ${error}`);
    return undefined;
  }
};

// Main application bootstrap
async function bootstrap() {
  try {
    logger.info('Starting MultiScraper application...');

    // Initialize database and create tables if needed
    logger.info('Initializing database...');
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start Express server
    const port = 3001;
    app.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
    });

    // Initialize Telegram bot
    logger.info('Initializing Telegram bot...');
    const telegramBot = new TelegramBot();
    await telegramBot.start();
    logger.info('Telegram bot initialized successfully');

    // Initialize scheduler with scraper factory and telegramBot
    logger.info('Initializing scheduler...');
    const scheduler = new Scheduler(createScraper, telegramBot);

    // Set the scheduler in the telegram bot
    telegramBot.setScheduler(scheduler);
    logger.info('Scheduler set in Telegram bot');

    // Schedule all active queries (this will also initialize scrapers)
    logger.info('Scheduling active queries...');
    await scheduler.scheduleAllActiveQueries();
    logger.info('All active queries scheduled successfully');

    logger.info('MultiScraper application started successfully');

    // Handle application shutdown
    const shutdownHandler = async () => {
      logger.info('Shutting down MultiScraper...');
      
      // Stop scheduler
      scheduler.cancelAllJobs();
      
      // Stop Telegram bot
      await telegramBot.stop();
      
      // Close database connections
      await db.destroy();
      
      logger.info('MultiScraper shutdown complete');
      process.exit(0);
    };

    // Register shutdown handlers
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    process.on('uncaughtException', async (error) => {
      logger.error(`Uncaught exception: ${error}`);
      await shutdownHandler();
    });

  } catch (error) {
    logger.error(`Failed to start MultiScraper: ${error}`);
    process.exit(1);
  }
}

// Start the application
bootstrap().catch(error => {
  logger.error(`Fatal error during bootstrap: ${error}`);
  process.exit(1);
});