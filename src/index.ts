import { initializeDatabase } from './infrastructure/database';
import { TelegramBot } from './application/telegram/TelegramBot';
import { Scheduler } from './core/scheduler';
import { BaseScraper } from './application/scrapers/BaseScraper';
import { LidlScraper } from './application/scrapers/LidlScraper';
import { MarktplaatsScraper } from './application/scrapers/MarktplaatsScraper';
import { RetailerType } from './domain/Retailer';
import logger from './infrastructure/logger';
import db from './infrastructure/database';

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