import { Product, NewProduct } from '../../domain/Product';
import { SearchQuery } from '../../domain/SearchQuery';
import { Retailer } from '../../domain/Retailer';
import { HttpClient } from '../../utils/http-client';
import logger from '../../infrastructure/logger';

export abstract class BaseScraper {
  protected retailer: Retailer;
  protected httpClient: HttpClient;

  constructor(retailer: Retailer) {
    this.retailer = retailer;
    this.httpClient = new HttpClient(
      retailer.useRotatingProxy,
      retailer.useRandomUserAgent
    );
    logger.debug(`Scraper voor ${retailer.name} geïnitialiseerd`);
  }

  /**
   * Zoek producten op basis van een zoekopdracht
   * @param query De zoekopdracht
   * @returns Array van gevonden producten
   */
  abstract search(query: SearchQuery): Promise<NewProduct[]>;

  /**
   * Controleer of een product nog steeds beschikbaar is en check voor prijswijzigingen
   * Deze functionaliteit is verplaatst naar de search functie, dus deze methode
   * update alleen de lastCheckedAt timestamp.
   * @param product Het te controleren product
   * @returns Het bijgewerkte product
   */
  async checkProduct(product: Product): Promise<Product> {
    return {
      ...product,
      lastCheckedAt: new Date(),
      isAvailable: true
    };
  }

  /**
   * Formatteer een product url op basis van een product ID
   * @param productId Het externe productID
   * @returns De volledige product URL
   */
  abstract formatProductUrl(productId: string): string;

  /**
   * Basisimplementatie voor het loggen van gevonden producten
   * @param products Lijst van gevonden producten
   */
  protected logFoundProducts(products: NewProduct[]): void {
    logger.info(`${this.retailer.name} - Gevonden producten: ${products.length}`);
    products.forEach((product, index) => {
      logger.debug(`${index + 1}. ${product.title} - €${product.price}`);
    });
  }
}