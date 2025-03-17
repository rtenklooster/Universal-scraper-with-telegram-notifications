import { Product } from '../../domain/Product';
import { RetailerType } from '../../domain/Retailer';
import db from '../../infrastructure/database';
import logger from '../../infrastructure/logger';

export enum NotificationType {
  NEW_PRODUCT = 'NEW_PRODUCT',
  PRICE_DROP = 'PRICE_DROP'
}

export interface Notification {
  id?: number;
  userId: number;
  productId: number;
  searchQueryId: number;
  notificationType: NotificationType;
  createdAt?: Date;
  isRead?: boolean;
}

export interface FormattedNotification {
  message: string;
  imageUrl?: string;
}

export class NotificationManager {
  async createNotification(
    userId: number,
    product: Product,
    searchQueryId: number,
    type: NotificationType
  ): Promise<number> {
    try {
      const [id] = await db('notifications').insert({
        userId,
        productId: product.id,
        searchQueryId,
        notificationType: type,
        createdAt: new Date(),
        isRead: false
      });
      
      logger.info(`Notificatie aangemaakt: ${type} voor gebruiker ${userId}, product ${product.title}`);
      return id;
    } catch (error) {
      logger.error(`Fout bij aanmaken notificatie: ${error}`);
      throw error;
    }
  }
  
  async getUnreadNotifications(userId: number): Promise<any[]> {
    try {
      // Join met products tabel om product details voor de notificatie op te halen
      const notifications = await db('notifications')
        .join('products', 'notifications.productId', '=', 'products.id')
        .join('retailers', 'products.retailerId', '=', 'retailers.id')
        .join('search_queries', 'notifications.searchQueryId', '=', 'search_queries.id')
        .where({
          'notifications.userId': userId,
          'notifications.isRead': false
        })
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
          'products.retailerId',
          'retailers.name as retailerName',
          'search_queries.priceDropThresholdPercent'
        )
        .orderBy('notifications.createdAt', 'desc');
      
      return notifications;
    } catch (error) {
      logger.error(`Fout bij ophalen ongelezen notificaties: ${error}`);
      return [];
    }
  }
  
  async markAsRead(notificationId: number): Promise<void> {
    try {
      await db('notifications')
        .where({ id: notificationId })
        .update({ isRead: true });
    } catch (error) {
      logger.error(`Fout bij markeren als gelezen: ${error}`);
    }
  }
  
  async markAllAsRead(userId: number): Promise<void> {
    try {
      await db('notifications')
        .where({ userId, isRead: false })
        .update({ isRead: true });
      
      logger.info(`Alle notificaties voor gebruiker ${userId} gemarkeerd als gelezen`);
    } catch (error) {
      logger.error(`Fout bij markeren alle notificaties als gelezen: ${error}`);
    }
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
  
  /**
   * Formatteert een notificatiebericht voor Telegram
   * @returns Een object met het geformatteerde bericht en de afbeelding URL
   */
  formatNotificationMessage(notification: any): FormattedNotification {
    // Log hele notification object voor debug
    logger.debug(`Formatting notification: ${JSON.stringify(notification, null, 2)}`);
    
    const { 
      notificationType, 
      productTitle, 
      productPrice, 
      productOldPrice, 
      productCurrency,
      retailerId,
      retailerName, 
      productUrl, 
      imageUrl,
      priceDropPercentage,
      location,
      distanceMeters
    } = notification;
    
    // Log specifieke velden voor debug
    logger.debug(`Location: ${location}, Distance: ${distanceMeters}, RetailerId: ${retailerId}`);
    
    let message = `*${retailerName}* - ${productTitle}\n\n`;
    
    if (notificationType === NotificationType.NEW_PRODUCT) {
      message += `🆕 *Nieuw product gevonden!*\n`;
    } else if (notificationType === NotificationType.PRICE_DROP) {
      // Calculate percentage drop if not provided
      let dropPercent = priceDropPercentage;
      if (dropPercent === undefined && productOldPrice && productPrice) {
        dropPercent = this.calculatePriceDropPercentage(productOldPrice, productPrice);
      }

      if (dropPercent !== undefined && dropPercent > 0) {
        message += `📉 *Prijsdaling ${dropPercent}%!*\n`;
      } else {
        message += `📉 *Prijsdaling!*\n`;
      }
      
      message += `Oude prijs: ${productOldPrice} ${productCurrency}\n`;
    }
    
    // Toon "Bieden" voor Marktplaats producten met prijs 0
    if (Number(retailerId) === RetailerType.MARKTPLAATS && productPrice === 0) {
      message += `Prijs: *Bieden*\n`;
    } else {
      message += `Prijs: *${productPrice} ${productCurrency}*\n`;
    }

    // Voeg locatie en afstand toe voor Marktplaats producten
    if (Number(retailerId) === RetailerType.MARKTPLAATS && location) {
      message += `\n📍 *Locatie:* ${location}`;
      if (distanceMeters) {
        const distanceKm = Math.round(distanceMeters / 100) / 10;
        message += ` (${distanceKm} km)`;
      }
      message += '\n';
    }
    
    message += `\n[Bekijk product](${productUrl})`;
    
    return { message, imageUrl };
  }
}