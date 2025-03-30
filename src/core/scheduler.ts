import * as schedule from 'node-schedule';
import db, { insertAndGetId } from '../infrastructure/database';
import logger from '../infrastructure/logger';
import { SearchQuery } from '../domain/SearchQuery';
import { BaseScraper } from '../application/scrapers/BaseScraper';
import { NotificationManager, NotificationType } from '../application/notifications/NotificationManager';
import { Product } from '../domain/Product';
import { TelegramBot } from '../application/telegram/TelegramBot';

export class Scheduler {
  private jobs: Map<number, schedule.Job> = new Map();
  private scrapers: Map<number, BaseScraper> = new Map();
  private notificationManager: NotificationManager;
  private isInitialized: boolean = false;
  private watchForNewQueriesJob: schedule.Job | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastExecutionTimes: Map<number, Date> = new Map();

  constructor(
    private scraperFactory: (retailerId: number) => Promise<BaseScraper | undefined>,
    private telegramBot?: TelegramBot
  ) {
    this.notificationManager = new NotificationManager();
    // Start watching for new queries every minute
    this.startWatchingForNewQueries();
    // Start keep-alive to prevent Node.js from going to sleep
    this.startKeepAlive();
  }

  private async initializeScrapers(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      logger.info('Initializing scrapers...');
      
      // Get all active retailers
      const retailers = await db('retailers').where({ isActive: true });
      
      // Initialize scrapers for each retailer
      for (const retailer of retailers) {
        const scraper = await this.scraperFactory(retailer.id);
        if (scraper) {
          this.scrapers.set(retailer.id, scraper);
          logger.info(`Scraper initialized for retailer: ${retailer.name}`);
        } else {
          logger.warn(`Could not initialize scraper for retailer: ${retailer.name}`);
        }
      }

      this.isInitialized = true;
      logger.info('All scrapers initialized successfully');
    } catch (error) {
      logger.error(`Error initializing scrapers: ${error}`);
      throw error;
    }
  }

  async scheduleAllActiveQueries(): Promise<void> {
    try {
      // Ensure scrapers are initialized first
      await this.initializeScrapers();
      
      // Cancel any existing jobs first
      this.cancelAllJobs();
      
      // Get all active search queries
      const queries = await db('search_queries')
        .join('users', 'search_queries.userId', '=', 'users.id')
        .where({
          'search_queries.isActive': true,
          'users.isActive': true
        })
        .select('search_queries.*');
      
      logger.info(`Found ${queries.length} active queries to schedule`);
      
      // Schedule a job for each query
      for (const query of queries) {
        await this.scheduleQuery(query);
      }
      
      logger.info(`Successfully scheduled ${queries.length} active search queries`);
    } catch (error) {
      logger.error(`Error scheduling queries: ${error}`);
      throw error;
    }
  }

  async scheduleQuery(query: SearchQuery): Promise<void> {
    // Cancel existing job if any
    this.cancelJob(query.id);
    
    // Get the appropriate scraper
    const scraper = this.scrapers.get(query.retailerId);
    if (!scraper) {
      logger.error(`No scraper available for retailer ID ${query.retailerId}`);
      return;
    }
    
    // Run initial search immediately
    logger.info(`Running initial search for query ID ${query.id}`);
    await this.executeSearch(query, scraper);
    this.lastExecutionTimes.set(query.id, new Date());
    
    // Schedule the job
    const job = schedule.scheduleJob(`query-${query.id}`, `*/${query.intervalMinutes} * * * *`, async () => {
      const executionStart = new Date();
      logger.info(`Running scheduled search for query ID ${query.id} at ${executionStart.toISOString()}`);
      await this.executeSearch(query, scraper);
      this.lastExecutionTimes.set(query.id, executionStart);
      const nextRun = job.nextInvocation();
      logger.info(`Completed scheduled search for query ID ${query.id}, next run at: ${nextRun ? nextRun.toISOString() : 'unknown'}`);
    });
    
    // Store the job
    if (job) {
      this.jobs.set(query.id, job);
      const nextRun = job.nextInvocation();
      logger.info(`Scheduled search for query ID ${query.id}, will run every ${query.intervalMinutes} minutes`);
      logger.info(`Next run for query ID ${query.id} will be at: ${nextRun ? nextRun.toISOString() : 'unknown'}`);
    } else {
      logger.error(`Failed to schedule job for query ID ${query.id}`);
    }
  }

  cancelJob(queryId: number): void {
    const job = this.jobs.get(queryId);
    if (job) {
      job.cancel();
      this.jobs.delete(queryId);
      logger.info(`Cancelled job for query ID ${queryId}`);
    }
  }

  cancelAllJobs(): void {
    this.jobs.forEach((job, queryId) => {
      job.cancel();
      logger.debug(`Cancelled job for query ID ${queryId}`);
    });
    this.jobs.clear();
    this.lastExecutionTimes.clear();
    logger.info('All scheduled jobs cancelled');

    // Also stop watching for new queries
    if (this.watchForNewQueriesJob) {
      this.watchForNewQueriesJob.cancel();
      this.watchForNewQueriesJob = null;
    }
    
    // Stop keep-alive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Start watching for new search queries and schedule them automatically
   */
  private startWatchingForNewQueries(): void {
    // Check for new queries every minute
    this.watchForNewQueriesJob = schedule.scheduleJob('*/1 * * * *', async () => {
      try {
        // Ensure scrapers are initialized
        await this.initializeScrapers();
        
        logger.debug('Checking for new search queries...');
        
        // Get the IDs of all currently scheduled queries
        const scheduledQueryIds = Array.from(this.jobs.keys());
        
        // Get all active queries that are not yet scheduled
        const newQueries = await db('search_queries')
          .join('users', 'search_queries.userId', '=', 'users.id')
          .where({
            'search_queries.isActive': true,
            'users.isActive': true
          })
          .whereNotIn('search_queries.id', scheduledQueryIds)
          .select('search_queries.*');
        
        if (newQueries.length > 0) {
          logger.info(`Found ${newQueries.length} new search queries to schedule`);
          
          // Schedule and immediately execute each new query
          for (const query of newQueries) {
            // Since we already initialized the scrapers, we can get it directly from the map
            const scraper = this.scrapers.get(query.retailerId);
            if (!scraper) {
              logger.error(`No scraper available for retailer ID ${query.retailerId}`);
              continue;
            }

            // Execute the search immediately
            logger.info(`Executing initial search for new query ID ${query.id}`);
            await this.executeSearch(query, scraper);
            
            // Then schedule it for future runs
            await this.scheduleQuery(query);
          }
        }
      } catch (error) {
        logger.error(`Error checking for new search queries: ${error}`);
      }
    });
    
    logger.info('Started watching for new search queries');
  }

  /**
   * Voorkom dat Node.js in slaapmodus gaat
   */
  private startKeepAlive(): void {
    // Elke 30 seconden een keep-alive signaal
    this.keepAliveInterval = setInterval(() => {
      const now = new Date();
      logger.debug(`Scheduler keep-alive check at ${now.toISOString()}`);
      
      // Log informatie over alle actieve jobs
      if (this.jobs.size > 0) {
        logger.info(`Active scheduled jobs: ${this.jobs.size}`);
        this.jobs.forEach((job, queryId) => {
          const nextRun = job.nextInvocation();
          const lastRun = this.lastExecutionTimes.get(queryId);
          logger.info(`Query ID ${queryId}: Last run: ${lastRun ? lastRun.toISOString() : 'never'}, Next run: ${nextRun ? nextRun.toISOString() : 'not scheduled'}`);
        });
      }
    }, 30000);
  }

  /**
   * Calculate the price drop percentage
   * @param oldPrice The previous price
   * @param newPrice The current price
   * @returns The price drop percentage (e.g., 25 for 25%)
   */
  private calculatePriceDropPercentage(oldPrice: number, newPrice: number): number {
    if (oldPrice <= 0 || newPrice <= 0) return 0;
    const percentageDrop = ((oldPrice - newPrice) / oldPrice) * 100;
    return Math.round(percentageDrop);
  }

  private async executeSearch(query: SearchQuery, scraper: BaseScraper): Promise<void> {
    try {
      logger.info(`Executing search for query ID ${query.id}: ${query.searchText}`);
      
      // Determine if this is the first run
      const isFirstRun = !query.lastScrapedAt;
      
      // Search for products
      const newProducts = await scraper.search(query);
      
      // Process results
      if (newProducts.length > 0) {
        for (const newProduct of newProducts) {
          // Check if the product already exists
          const existingProduct = await db('products')
            .where({
              retailerId: newProduct.retailerId,
              externalId: newProduct.externalId
            })
            .first();
          
          let productId: number;
          
          if (existingProduct) {
            // Update existing product
            await db('products')
              .where({ id: existingProduct.id })
              .update({
                lastCheckedAt: new Date(),
                price: newProduct.price,
                oldPrice: existingProduct.price !== newProduct.price ? existingProduct.price : existingProduct.oldPrice,
                priceType: newProduct.priceType,
                location: newProduct.location,
                distanceMeters: newProduct.distanceMeters
              });
            
            productId = existingProduct.id;
            
            // Only notify on price drops if that preference is enabled and it's not the first run
            if (!isFirstRun && query.notifyOnPriceDrops && newProduct.price < existingProduct.price) {
              // Calculate the percentage drop
              const dropPercentage = this.calculatePriceDropPercentage(existingProduct.price, newProduct.price);
              
              // Check if it meets the threshold (if one is set)
              const meetsThreshold = !query.priceDropThresholdPercent || 
                                    dropPercentage >= query.priceDropThresholdPercent;
              
              if (meetsThreshold) {
                const product = { 
                  ...existingProduct, 
                  id: productId, 
                  price: newProduct.price, 
                  oldPrice: existingProduct.price,
                  priceType: newProduct.priceType,
                  location: newProduct.location,
                  distanceMeters: newProduct.distanceMeters
                };
                
                logger.info(`Price drop detected: ${product.title} dropped from ${existingProduct.price} to ${newProduct.price} (${dropPercentage}% off)`);
                
                const notificationId = await this.notificationManager.createNotification(
                  query.userId,
                  product,
                  query.id,
                  NotificationType.PRICE_DROP
                );
                
                // Send immediate notification if TelegramBot is available
                if (this.telegramBot) {
                  await this.sendImmediateNotification(query.userId, product, notificationId);
                }
              } else {
                logger.info(`Price drop below threshold: ${newProduct.title} dropped by ${dropPercentage}%, threshold is ${query.priceDropThresholdPercent}%`);
              }
            }
          } else {
            // It's a new product, insert it
            const now = new Date();
            productId = await insertAndGetId('products', {
              ...newProduct,
              discoveredAt: now,
              lastCheckedAt: now
            });
            
            const product = { ...newProduct, id: productId } as Product;
            
            // Only notify on new products if that preference is enabled and it's not the first run
            if (!isFirstRun && query.notifyOnNew) {
              logger.info(`New product found: ${product.title} at price ${product.price}`);
              
              const notificationId = await this.notificationManager.createNotification(
                query.userId,
                product,
                query.id,
                NotificationType.NEW_PRODUCT
              );
              
              // Send immediate notification if TelegramBot is available
              if (this.telegramBot) {
                await this.sendImmediateNotification(query.userId, product, notificationId);
              }
            }
          }
        }
      } else {
        logger.info(`No products found for query ID ${query.id}`);
      }
      
      // Update last scraped timestamp
      await db('search_queries')
        .where({ id: query.id })
        .update({ lastScrapedAt: new Date() });

      // Log first run completion
      if (isFirstRun) {
        logger.info(`First run completed for query ID ${query.id}. Found ${newProducts.length} initial products.`);
      }
    } catch (error) {
      logger.error(`Error executing search for query ID ${query.id}: ${error}`);
    }
  }

  /**
   * Stuur een notificatie onmiddellijk naar de gebruiker
   */
  private async sendImmediateNotification(
    userId: number, 
    product: Product, 
    notificationId: number
  ): Promise<void> {
    try {
      if (!this.telegramBot) {
        return;
      }

      // Haal de notificatie op met alle benodigde gegevens
      const notification = await db('notifications')
        .join('products', 'notifications.productId', '=', 'products.id')
        .join('retailers', 'products.retailerId', '=', 'retailers.id')
        .join('search_queries', 'notifications.searchQueryId', '=', 'search_queries.id')
        .where('notifications.id', notificationId)
        .select(
          'notifications.*',
          'products.title as productTitle',
          'products.price as productPrice',
          'products.oldPrice as productOldPrice',
          'products.currency as productCurrency',
          'products.productUrl',
          'products.imageUrl',
          'products.priceType',
          'products.location',
          'products.distanceMeters',
          'products.retailerId',
          'retailers.name as retailerName',
          'search_queries.priceDropThresholdPercent'
        )
        .first();

      if (notification) {
        // For price drop notifications, add percentage information if available
        if (notification.notificationType === NotificationType.PRICE_DROP && 
            notification.productOldPrice && 
            notification.productPrice) {
          
          const dropPercentage = this.calculatePriceDropPercentage(
            notification.productOldPrice, 
            notification.productPrice
          );
          
          notification.priceDropPercentage = dropPercentage;
        }
        
        logger.info(`Sending immediate notification to user ${userId} for product ${product.title}`);
        await this.telegramBot.sendNotification(userId, notification);
      }
    } catch (error) {
      logger.error(`Error sending immediate notification: ${error}`);
    }
  }

  // Force run all queries for a specific user
  async forceRunAllQueries(userId: number): Promise<void> {
    try {
      // Get all active queries for the user
      const queries = await db('search_queries')
        .where({
          userId: userId,
          isActive: true
        });

      for (const query of queries) {
        const scraper = this.scrapers.get(query.retailerId);
        if (scraper) {
          await this.executeSearch(query, scraper);
        }
      }
    } catch (error) {
      logger.error(`Error force running queries for user ${userId}: ${error}`);
      throw error;
    }
  }
}