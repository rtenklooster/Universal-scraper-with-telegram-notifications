import { Telegraf, Context, Markup } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { message } from 'telegraf/filters';
import config from '../../infrastructure/config';
import logger, { userLogger } from '../../infrastructure/logger';
import db from '../../infrastructure/database';
import { User, NewUser } from '../../domain/User';
import { NewSearchQuery } from '../../domain/SearchQuery';
import { NotificationManager, FormattedNotification } from '../notifications/NotificationManager';
import { Scheduler } from '../../core/scheduler';

export class TelegramBot {
  private bot: Telegraf<Context<Update>>;
  private notificationManager: NotificationManager;
  private userStates: Map<number, { state: string; data: any }> = new Map();
  private scheduler?: Scheduler;  // Add scheduler reference

  constructor() {
    if (!config.telegram.botToken) {
      throw new Error('Telegram bot token is not configured!');
    }

    this.bot = new Telegraf(config.telegram.botToken);
    this.notificationManager = new NotificationManager();
    
    this.setupCommands();
    this.setupMessageHandlers();
  }

  // Add setter for scheduler
  public setScheduler(scheduler: Scheduler): void {
    this.scheduler = scheduler;
  }

  private setupCommands(): void {
    // Start command
    this.bot.command('start', async (ctx) => {
      userLogger.info(`Command: /start`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
      await this.handleStart(ctx);
    });
    
    // Help command
    this.bot.command('help', async (ctx) => {
      userLogger.info(`Command: /help`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
      await this.handleHelp(ctx);
    });
    
    // Search command
    this.bot.command('search', async (ctx) => {
      userLogger.info(`Command: /search`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
      await this.handleSearch(ctx);
    });
    
    // MySearches command
    this.bot.command('mysearches', async (ctx) => {
      userLogger.info(`Command: /mysearches`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
      await this.handleMySearches(ctx);
    });
    
    // Notifications command
    this.bot.command('notifications', async (ctx) => {
      userLogger.info(`Command: /notifications`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
      await this.handleNotifications(ctx);
    });
    
    // Settings command
    this.bot.command('settings', async (ctx) => {
      userLogger.info(`Command: /settings`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
      await this.handleSettings(ctx);
    });
  }

  private setupMessageHandlers(): void {
    // Handle text messages based on user state
    this.bot.on(message('text'), async (ctx) => {
      const telegramId = ctx.from.id;
      const messageText = ctx.message.text.trim();
      
      // Log user input
      userLogger.info(messageText, { 
        userId: telegramId,
        username: ctx.from.username || undefined
      });

      const userState = this.userStates.get(telegramId);
      
      // Check if the message is a URL
      if (messageText.startsWith('http://') || messageText.startsWith('https://')) {
        await this.handleProductUrl(ctx, messageText);
        return;
      }
      
      if (!userState) {
        // No active state, show help message
        return this.handleHelp(ctx);
      }
      
      switch (userState.state) {
        case 'awaiting_search_query':
          await this.handleSearchQueryInput(ctx, userState.data);
          break;
        case 'awaiting_interval':
          await this.handleIntervalInput(ctx, userState.data);
          break;
        case 'awaiting_price_drop_threshold':
          await this.handlePriceDropThreshold(ctx, userState.data);
          break;
        default:
          // Unknown state, show help
          await this.handleHelp(ctx);
      }
    });

    // Handle commands
    this.bot.command(['start', 'help', 'search', 'mysearches', 'notifications', 'settings'], async (ctx) => {
      const command = ctx.message.text;
      userLogger.info(`Command: ${command}`, {
        userId: ctx.from.id,
        username: ctx.from.username || undefined
      });
    });
    
    // Handle callback queries (button presses)
    this.bot.on('callback_query', async (ctx) => {
      if (!('data' in ctx.callbackQuery)) {
        return;
      }

      const data = ctx.callbackQuery.data;
      userLogger.info(`Callback: ${data}`, {
        userId: ctx.from?.id,
        username: ctx.from?.username || undefined
      });
      
      if (data.startsWith('retailer_')) {
        const retailerId = parseInt(data.replace('retailer_', ''), 10);
        await this.handleRetailerSelection(ctx, retailerId);
      } else if (data.startsWith('delete_search_')) {
        const searchId = parseInt(data.replace('delete_search_', ''), 10);
        await this.handleDeleteSearch(ctx, searchId);
      } else if (data === 'read_all_notifications') {
        await this.handleMarkAllNotificationsRead(ctx);
      } else if (data.startsWith('notif_')) {
        const userState = this.userStates.get(ctx.from!.id);
        if (userState && userState.state === 'awaiting_notification_preferences') {
          await this.handleNotificationPreferences(ctx, data, userState.data);
        }
      }
      
      // Answer callback query to remove loading state
      await ctx.answerCbQuery();
    });
  }
  
  private async getOrCreateUser(ctx: Context): Promise<User> {
    if (!ctx.from) {
      throw new Error('No user found in context');
    }
    
    const telegramId = ctx.from.id;
    
    // Find existing user
    let user = await db('users').where({ telegramId }).first();
    
    // Create new user if not found
    if (!user) {
      const newUser: NewUser = {
        telegramId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        isActive: true
      };
      
      const [userId] = await db('users').insert(newUser);
      user = { ...newUser, id: userId, joinedAt: new Date() } as User;
      
      logger.info(`New user registered: ${user.firstName} (ID: ${userId})`);
    }
    
    return user;
  }
  
  private async handleStart(ctx: Context): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      userLogger.info('New user registered', {
        userId: user.telegramId,
        username: ctx.from?.username || undefined
      });
      await ctx.reply(
        `Welkom bij de MultiScraper bot, ${user.firstName || 'gebruiker'}! 🛒\n\n` +
        'Met deze bot kun je producten zoeken en meldingen ontvangen van nieuwe producten of prijsdalingen.\n\n' +
        'Gebruik /help om te zien wat ik kan doen!'
      );
    } catch (error) {
      logger.error(`Error in start handler: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  private async handleHelp(ctx: Context): Promise<void> {
    await ctx.reply(
      '🛒 *MultiScraper Bot Help* 🛒\n\n' +
      'Beschikbare commando\'s:\n\n' +
      '• /start - Start de bot\n' +
      '• /help - Toon dit helpbericht\n' +
      '• /search - Start een nieuwe zoekopdracht\n' +
      '• /mysearches - Bekijk en beheer je zoekopdrachten\n' +
      '• /notifications - Toon je ongelezen meldingen\n' +
      '• /settings - Beheer je instellingen',
      { parse_mode: 'Markdown' }
    );
  }
  
  private async handleSearch(ctx: Context): Promise<void> {
    try {
      // const user = await this.getOrCreateUser(ctx);
      
      // Get retailers
      const retailers = await db('retailers').where({ isActive: true });
      
      if (retailers.length === 0) {
        await ctx.reply('Er zijn momenteel geen actieve retailers beschikbaar.');
        return;
      }
      
      // Create buttons for each retailer
      const buttons = retailers.map(retailer => {
        return [Markup.button.callback(retailer.name, `retailer_${retailer.id}`)];
      });
      
      await ctx.reply(
        'Bij welke retailer wil je zoeken?',
        Markup.inlineKeyboard(buttons)
      );
    } catch (error) {
      logger.error(`Error in search handler: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  private async handleRetailerSelection(ctx: Context, retailerId: number): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      const retailer = await db('retailers').where({ id: retailerId }).first();
      
      if (!retailer) {
        await ctx.reply('Ongeldige retailer geselecteerd.');
        return;
      }
      
      // Update user state
      this.userStates.set(user.telegramId, {
        state: 'awaiting_search_query',
        data: { retailerId, retailerName: retailer.name }
      });
      
      await ctx.editMessageText(
        `Je gaat zoeken bij *${retailer.name}*.\n\n` +
        'Wat wil je zoeken? Voer je zoekopdracht in:',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error(`Error in retailer selection handler: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  private async handleSearchQueryInput(ctx: Context, data: any): Promise<void> {
    if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
      return;
    }
    
    const searchText = ctx.message.text.trim();
    
    if (searchText.length < 2) {
      await ctx.reply('Je zoekopdracht is te kort. Probeer een langere zoekterm:');
      return;
    }
    
    // Update state to ask for interval directly
    this.userStates.set(ctx.from.id, {
      state: 'awaiting_interval',
      data: { ...data, searchText }
    });
    
    await ctx.reply(
      `Zoekopdracht: *${searchText}* bij *${data.retailerName}*\n\n` +
      'Hoe vaak moet ik zoeken? (in minuten)\n' +
      'Stuur een getal of typ "skip" voor de standaardwaarde.',
      { parse_mode: 'Markdown' }
    );
  }
  
  private async handleIntervalInput(ctx: Context, data: any): Promise<void> {
    if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
      return;
    }
    
    const input = ctx.message.text.trim();
    let intervalMinutes = config.scraping.defaultIntervalMinutes;
    
    if (input !== 'skip') {
      const minutes = parseInt(input, 10);
      if (isNaN(minutes) || minutes < 1) {
        await ctx.reply(
          'Ongeldige interval. Voer een getal van minimaal 1 minuut in of typ "skip" voor de standaardwaarde:'
        );
        return;
      }
      intervalMinutes = minutes;
    }

    // Update state to ask for notification preferences
    this.userStates.set(ctx.from.id, {
      state: 'awaiting_notification_preferences',
      data: { ...data, intervalMinutes }
    });

    // Ask for notification preferences
    const buttons = [
      [Markup.button.callback('Alleen nieuwe producten', 'notif_new_only')],
      [Markup.button.callback('Alleen prijsdalingen', 'notif_price_only')],
      [Markup.button.callback('Beide', 'notif_both')]
    ];

    await ctx.reply(
      'Waarvoor wil je meldingen ontvangen?',
      Markup.inlineKeyboard(buttons)
    );
  }

  private async handleNotificationPreferences(ctx: Context, type: string, data: any): Promise<void> {
    if (!ctx.from) return;

    let notifyOnNew = false;
    let notifyOnPriceDrops = false;

    switch (type) {
      case 'notif_new_only':
        notifyOnNew = true;
        break;
      case 'notif_price_only':
        notifyOnPriceDrops = true;
        break;
      case 'notif_both':
        notifyOnNew = true;
        notifyOnPriceDrops = true;
        break;
    }

    // If price drops are enabled, ask for threshold
    if (notifyOnPriceDrops) {
      this.userStates.set(ctx.from.id, {
        state: 'awaiting_price_drop_threshold',
        data: { ...data, notifyOnNew, notifyOnPriceDrops }
      });

      await ctx.editMessageText(
        'Vanaf welk percentage prijsdaling wil je een melding ontvangen?\n' +
        'Voer een getal in (bijvoorbeeld: 25 voor 25%) of typ "skip" voor geen minimum:'
      );
    } else {
      // Create the search query immediately if no price drops are enabled
      await this.createSearchQuery(ctx, {
        ...data,
        notifyOnNew,
        notifyOnPriceDrops,
        priceDropThresholdPercent: undefined
      });
    }
  }

  private async handlePriceDropThreshold(ctx: Context, data: any): Promise<void> {
    if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
      return;
    }

    const input = ctx.message.text.trim().toLowerCase();
    let priceDropThresholdPercent: number | undefined = undefined;

    if (input !== 'skip') {
      const threshold = parseInt(input, 10);
      if (isNaN(threshold) || threshold < 1 || threshold > 100) {
        await ctx.reply(
          'Ongeldige waarde. Voer een getal tussen 1 en 100 in, of typ "skip" voor geen minimum:'
        );
        return;
      }
      priceDropThresholdPercent = threshold;
    }

    // Create the search query with all preferences
    await this.createSearchQuery(ctx, {
      ...data,
      priceDropThresholdPercent
    });
  }

  private async createSearchQuery(ctx: Context, data: any): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      
      // Create search query
      const newQuery: NewSearchQuery = {
        userId: user.id,
        retailerId: data.retailerId,
        searchText: data.searchText,
        isActive: true,
        intervalMinutes: data.intervalMinutes,
        notifyOnNew: data.notifyOnNew,
        notifyOnPriceDrops: data.notifyOnPriceDrops,
        priceDropThresholdPercent: data.priceDropThresholdPercent
      };
      
      // Insert the query and get its ID
      const [queryId] = await db('search_queries').insert(newQuery);
      
      // Schedule the query immediately if scheduler is available
      if (this.scheduler) {
        const query = await db('search_queries').where({ id: queryId }).first();
        if (query) {
          await this.scheduler.scheduleQuery(query);
          logger.info(`Nieuwe zoekopdracht ${queryId} direct ingepland`);
        }
      }
      
      // Clear user state
      this.userStates.delete(ctx.from!.id);
      
      // Create confirmation message
      let message = '✅ Je zoekopdracht is succesvol aangemaakt!\n\n' +
        `*Retailer:* ${data.retailerName}\n` +
        `*Zoekopdracht:* ${data.searchText}\n` +
        `*Zoekinterval:* ${data.intervalMinutes} minuten\n\n` +
        '*Meldingen:*\n';
      
      if (data.notifyOnNew) {
        message += '• Nieuwe producten\n';
      }
      if (data.notifyOnPriceDrops) {
        message += '• Prijsdalingen';
        if (data.priceDropThresholdPercent) {
          message += ` (vanaf ${data.priceDropThresholdPercent}%)`;
        }
        message += '\n';
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error(`Error creating search query: ${error}`);
      await ctx.reply('Er is een fout opgetreden bij het maken van je zoekopdracht. Probeer het later opnieuw.');
    }
  }
  
  private async handleMySearches(ctx: Context): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      
      // Get user's search queries
      const queries = await db('search_queries')
        .join('retailers', 'search_queries.retailerId', '=', 'retailers.id')
        .where({ 'search_queries.userId': user.id })
        .select(
          'search_queries.*',
          'retailers.name as retailerName'
        )
        .orderBy('search_queries.createdAt', 'desc');
      
      if (queries.length === 0) {
        await ctx.reply(
          'Je hebt nog geen zoekopdrachten.\n\n' +
          'Gebruik /search om een nieuwe zoekopdracht aan te maken.'
        );
        return;
      }
      
      // Create message with all searches
      let message = '*Jouw zoekopdrachten:*\n\n';
      
      for (const [index, query] of queries.entries()) {
        message += `*${index + 1}.* ${query.retailerName} - "${query.searchText}"\n`;
        message += `   ⏰ Elke ${query.intervalMinutes} minuten\n`;
        
        // Add notification preferences
        message += '   📨 Meldingen: ';
        const notifications = [];
        if (query.notifyOnNew) {
          notifications.push('nieuwe producten');
        }
        if (query.notifyOnPriceDrops) {
          let priceDropText = 'prijsdalingen';
          if (query.priceDropThresholdPercent) {
            priceDropText += ` (vanaf ${query.priceDropThresholdPercent}%)`;
          }
          notifications.push(priceDropText);
        }
        message += notifications.join(' en ') || 'geen';
        
        if (!query.isActive) {
          message += '\n   ⚠️ Inactief';
        }
        
        message += '\n\n';
      }
      
      // Add delete buttons for each search
      const buttons = queries.map(query => {
        return [Markup.button.callback(`❌ Verwijder "${query.searchText}"`, `delete_search_${query.id}`)];
      });
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error(`Error in my searches handler: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  private async handleDeleteSearch(ctx: Context, searchId: number): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      
      // Get search query
      const query = await db('search_queries')
        .where({
          id: searchId,
          userId: user.id
        })
        .first();
      
      if (!query) {
        await ctx.editMessageText(
          'Zoekopdracht niet gevonden of je hebt geen toegang tot deze zoekopdracht.'
        );
        return;
      }
      
      // Delete search query
      await db('search_queries')
        .where({ id: searchId })
        .delete();
      
      await ctx.editMessageText(
        `✅ Zoekopdracht "${query.searchText}" verwijderd!\n\n` +
        'Gebruik /mysearches om je overige zoekopdrachten te bekijken of /search om een nieuwe aan te maken.'
      );
    } catch (error) {
      logger.error(`Error deleting search: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  private async handleNotifications(ctx: Context): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      
      // Get unread notifications
      const notifications = await this.notificationManager.getUnreadNotifications(user.id);
      
      if (notifications.length === 0) {
        await ctx.reply(
          'Je hebt geen ongelezen meldingen.\n\n' +
          'Zodra er nieuwe producten worden gevonden of prijzen dalen, ontvang je hier meldingen.'
        );
        return;
      }
      
      // Send each notification
      for (const notification of notifications) {
        const formattedNotification = this.notificationManager.formatNotificationMessage(notification);
        
        // Verstuur melding met afbeelding indien beschikbaar
        await this.sendFormattedMessage(ctx.chat!.id, formattedNotification);
        
        // Mark as read
        await this.notificationManager.markAsRead(notification.id);
      }
      
      // Add option to mark all as read if there are many
      if (notifications.length >= 5) {
        await ctx.reply(
          `Je hebt ${notifications.length} meldingen bekeken. Alle meldingen zijn nu als gelezen gemarkeerd.`
        );
      }
    } catch (error) {
      logger.error(`Error in notifications handler: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  /**
   * Hulpmethode om een geformatteerd bericht te versturen, met of zonder afbeelding
   */
  private async sendFormattedMessage(chatId: number, formatted: FormattedNotification): Promise<void> {
    try {
      if (formatted.imageUrl && formatted.imageUrl.startsWith('http')) {
        try {
          // Stuur bericht met afbeelding
          await this.bot.telegram.sendPhoto(
            chatId,
            formatted.imageUrl,
            {
              caption: formatted.message,
              parse_mode: 'Markdown',
            }
          );
        } catch (photoError) {
          // Als het versturen van de afbeelding faalt, stuur dan alleen tekstbericht
          logger.error(`Fout bij versturen afbeelding: ${photoError}, terugvallen op tekstbericht`);
          await this.bot.telegram.sendMessage(
            chatId,
            `${formatted.message}\n\nAfbeelding: ${formatted.imageUrl}`,
            {
              parse_mode: 'Markdown'
            }
          );
        }
      } else {
        // Stuur alleen tekstbericht
        await this.bot.telegram.sendMessage(
          chatId,
          formatted.message,
          {
            parse_mode: 'Markdown'
          }
        );
      }
    } catch (error) {
      logger.error(`Fout bij versturen bericht naar chat ${chatId}: ${error}`);
    }
  }
  
  /**
   * Stuurt een notificatie naar de gebruiker
   */
  async sendNotification(userId: number, notification: any): Promise<boolean> {
    try {
      const user = await db('users').where({ id: userId }).first();
      if (!user || !user.telegramId) {
        logger.error(`Gebruiker ${userId} niet gevonden of heeft geen Telegram ID`);
        return false;
      }

      const formattedNotification = this.notificationManager.formatNotificationMessage(notification);
      await this.sendFormattedMessage(user.telegramId, formattedNotification);
      
      return true;
    } catch (error) {
      logger.error(`Fout bij versturen notificatie naar gebruiker ${userId}: ${error}`);
      return false;
    }
  }
  
  private async handleMarkAllNotificationsRead(ctx: Context): Promise<void> {
    try {
      const user = await this.getOrCreateUser(ctx);
      
      await this.notificationManager.markAllAsRead(user.id);
      
      await ctx.editMessageText(
        '✅ Alle meldingen zijn als gelezen gemarkeerd.'
      );
    } catch (error) {
      logger.error(`Error marking notifications as read: ${error}`);
      await ctx.reply('Er is een fout opgetreden. Probeer het later opnieuw.');
    }
  }
  
  private async handleSettings(ctx: Context): Promise<void> {
    await ctx.reply(
      '⚙️ *Instellingen*\n\n' +
      'Deze functionaliteit is nog in ontwikkeling.',
      { parse_mode: 'Markdown' }
    );
  }
  
  private async handleProductUrl(ctx: Context, url: string): Promise<void> {
    try {
      // Detect retailer from URL
      const retailerId = await this.detectRetailerFromUrl(url);
      if (!retailerId) {
        await ctx.reply(
          'Sorry, ik herken deze URL niet. Momenteel ondersteun ik links van:\n' +
          '• Lidl (www.lidl.nl)\n' +
          '• Marktplaats (www.marktplaats.nl)\n' +
          '• Vinted (www.vinted.nl)'
        );
        return;
      }

      const user = await this.getOrCreateUser(ctx);
      const retailer = await db('retailers').where({ id: retailerId }).first();
      
      if (!retailer) {
        await ctx.reply('Er is een fout opgetreden bij het verwerken van de URL.');
        return;
      }

      // Update user state to go directly to interval input
      this.userStates.set(user.telegramId, {
        state: 'awaiting_interval',
        data: { 
          retailerId,
          retailerName: retailer.name,
          searchText: url // Pass the full URL to the scraper
        }
      });
      
      await ctx.reply(
        `Ik ga zoeken bij *${retailer.name}* met de gegeven URL.\n\n` +
        'Hoe vaak moet ik zoeken? (in minuten)\n' +
        'Stuur een getal of typ "skip" voor de standaardwaarde.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error(`Error handling product URL: ${error}`);
      await ctx.reply('Er is een fout opgetreden bij het verwerken van de URL.');
    }
  }

  private async detectRetailerFromUrl(url: string): Promise<number | undefined> {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      if (hostname.includes('lidl.nl')) {
        return 1; // Lidl ID from database
      } else if (hostname.includes('marktplaats.nl')) {
        return 2; // Marktplaats ID
      } else if (hostname.includes('vinted.nl')) {
        return 3; // Vinted ID
      }
      
      return undefined;
    } catch (error) {
      logger.error(`Error detecting retailer from URL: ${error}`);
      return undefined;
    }
  }
  
  async start(): Promise<void> {
    try {
      logger.info('Starting Telegram bot initialization...');
      
      // Set bot commands
      logger.info('Setting up bot commands...');
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Start de bot' },
        { command: 'help', description: 'Toon het helpbericht' },
        { command: 'search', description: 'Start een nieuwe zoekopdracht' },
        { command: 'mysearches', description: 'Bekijk je zoekopdrachten' },
        { command: 'notifications', description: 'Bekijk je meldingen' },
        { command: 'settings', description: 'Beheer je instellingen' }
      ]);
      logger.info('Bot commands set up successfully');
      
      // Launch bot in non-blocking way
      logger.info('Launching bot...');
      this.bot.launch().catch(error => {
        logger.error(`Error in bot runtime: ${error}`);
      });
      
      // Wait a moment to ensure bot is started
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info('Bot launch initiated successfully');
      logger.info('Telegram bot initialization completed');
    } catch (error) {
      logger.error(`Failed to start Telegram bot: ${error}`);
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    try {
      logger.info('Stopping Telegram bot...');
      this.bot.stop('Application shutdown');
      logger.info('Telegram bot stopped');
    } catch (error) {
      logger.error(`Error stopping Telegram bot: ${error}`);
    }
  }
}