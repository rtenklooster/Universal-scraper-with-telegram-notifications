import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { validateUserToken, cleanupExpiredTokens, initializeDatabase } from './infrastructure/database';
import { BaseScraper } from './application/scrapers/BaseScraper';
import { LidlScraper } from './application/scrapers/LidlScraper';
import { MarktplaatsScraper } from './application/scrapers/MarktplaatsScraper';
import { TelegramBot } from './application/telegram/TelegramBot';
import { Scheduler } from './core/scheduler';
import { RetailerType } from './domain/Retailer';
import db from './infrastructure/database';
import logger from './infrastructure/logger';
import config from './infrastructure/config';

// Type voor middleware functies
type MiddlewareFunction = (req: Request, res: Response, next: NextFunction) => Promise<void>;
type RequestHandler = (req: Request, res: Response) => Promise<void>;

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username?: string;
        isAdmin: boolean;
      };
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateUser: MiddlewareFunction = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    // Check admin token first
    if (config.web.adminToken && token === config.web.adminToken) {
      // Create admin user object
      req.user = {
        id: -1, // Special admin ID
        username: 'admin',
        isAdmin: true
      };
      next();
      return;
    }

    // Normal token validation
    const userId = await validateUserToken(token);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const user = await db('users').where('id', userId).first();
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Auth required routes middleware
const requireAdmin: MiddlewareFunction = async (req, res, next) => {
  try {
    if (!req.user?.isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization error' });
  }
};

// Regular cleanup of expired tokens
setInterval(cleanupExpiredTokens, 1000 * 60 * 60); // Every hour

// Public endpoints
app.get('/api/auth/:token', (async (req, res) => {
  try {
    const { token } = req.params;
    
    // Check admin token first
    if (config.web.adminToken && token === config.web.adminToken) {
      res.json({
        user: {
          id: -1,
          username: 'admin',
          isAdmin: true
        }
      });
      return;
    }

    // Normal token validation
    const userId = await validateUserToken(token);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const user = await db('users').where('id', userId).first();
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}) as RequestHandler);

// Protected routes
app.get('/api/queries', authenticateUser, (async (req, res) => {
  try {
    const userId = req.query.userId || (req.user?.isAdmin ? null : req.user?.id);
    const queries = await db('search_queries')
      .select(
        'search_queries.*', 
        'retailers.name as retailerName',
        'users.username',
        'users.id as userId'
      )
      .join('retailers', 'search_queries.retailerId', 'retailers.id')
      .join('users', 'search_queries.userId', 'users.id')
      .where(userId ? { 'search_queries.userId': userId } : {});
    res.json(queries);
  } catch (error) {
    logger.error(`Error fetching queries: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}) as RequestHandler);

app.get('/api/products', authenticateUser, (async (req, res) => {
  try {
    const userId = req.query.userId || (req.user?.isAdmin ? null : req.user?.id);
    const productsQuery = db('products')
      .select('products.*', 'retailers.name as retailerName')
      .join('retailers', 'products.retailerId', 'retailers.id')
      .orderBy('discoveredAt', 'desc')
      .limit(100);

    if (userId) {
      productsQuery.join('search_queries', 'products.queryId', 'search_queries.id')
        .where('search_queries.userId', userId);
    }

    const products = await productsQuery;
    res.json(products);
  } catch (error) {
    logger.error(`Error fetching products: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}) as RequestHandler);

app.get('/api/notifications', authenticateUser, (async (req, res) => {
  try {
    const userId = req.query.userId || (req.user?.isAdmin ? null : req.user?.id);
    const notificationsQuery = db('notifications')
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

    if (userId) {
      notificationsQuery.where('notifications.userId', userId);
    }

    const notifications = await notificationsQuery;
    res.json(notifications);
  } catch (error) {
    logger.error(`Error fetching notifications: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}) as RequestHandler);

app.get('/api/users', authenticateUser, requireAdmin, (async (_req, res) => {
  try {
    const users = await db('users')
      .select('*')
      .orderBy('joinedAt', 'desc');
    res.json(users);
  } catch (error) {
    logger.error(`Error fetching users: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}) as RequestHandler);

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
    const host = '0.0.0.0';  // Listen on all interfaces
    app.listen(port, host, () => {
      logger.info(`API server listening on ${host}:${port}`);
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