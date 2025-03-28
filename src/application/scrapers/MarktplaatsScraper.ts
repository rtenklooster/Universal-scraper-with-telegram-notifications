import { BaseScraper } from './BaseScraper';
import { NewProduct } from '../../domain/Product';
import { SearchQuery } from '../../domain/SearchQuery';
import { Retailer } from '../../domain/Retailer';
import logger from '../../infrastructure/logger';
import { MarktplaatsApiDiscovery } from './MarktplaatsApiDiscovery';
import db from '../../infrastructure/database';

interface MarktplaatsItem {
  itemId: string;
  title: string;
  description: string;
  priceInfo: {
    priceCents: number;
    priceType: string;
  };
  location: {
    cityName: string;
    countryName: string;
    distanceMeters: number;
  };
  imageUrls: string[];
  pictures?: {
    largeUrl: string;
  }[];
  url?: string;
  date: string;
}

interface MarktplaatsSearchResponse {
  listings: MarktplaatsItem[];
  totalResultCount: number;
  maxAllowedPageNumber: number;
  pagination?: {
    offset: number;
    limit: number;
  };
}

export class MarktplaatsScraper extends BaseScraper {
  private readonly PAGE_SIZE = 30;
  private apiDiscovery: MarktplaatsApiDiscovery;

  constructor(retailer: Retailer) {
    super(retailer);
    this.apiDiscovery = new MarktplaatsApiDiscovery();
  }

  private addPaginationToUrl(apiUrl: string, offset: number): string {
    const url = new URL(apiUrl);
    url.searchParams.set('limit', this.PAGE_SIZE.toString());
    url.searchParams.set('offset', offset.toString());
    return url.toString();
  }

  private async fetchPage(apiUrl: string, offset: number): Promise<MarktplaatsSearchResponse> {
    const paginatedUrl = this.addPaginationToUrl(apiUrl, offset);
    logger.debug(`Making GET request to ${paginatedUrl}`);
    
    const response = await this.httpClient.get(paginatedUrl, {
      'Accept': 'application/json',
      'Accept-Language': 'nl,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Referer': 'https://www.marktplaats.nl/',
      'Origin': 'https://www.marktplaats.nl'
    });

    const parsedResponse = JSON.parse(response);
    
    // Log the raw response structure for debugging
    logger.debug('Raw API response:', {
      totalResultCount: parsedResponse.totalResultCount,
      maxAllowedPageNumber: parsedResponse.maxAllowedPageNumber,
      listingsCount: parsedResponse.listings?.length || 0,
      offset
    });

    return parsedResponse;
  }

  private convertItemToProduct(item: MarktplaatsItem): NewProduct {
    const price = item.priceInfo.priceType === 'FAST_BID' ? 0 : item.priceInfo.priceCents / 100;
    
    // Get image URL with fallback logic
    let imageUrl = item.pictures?.[0]?.largeUrl || item.imageUrls?.[0];
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = `https:${imageUrl}`;
    }
    
    const now = new Date();
    
    return {
      externalId: item.itemId,
      title: item.title,
      description: item.description,
      price,
      priceType: item.priceInfo.priceType,
      currency: 'EUR',
      productUrl: `https://www.marktplaats.nl/v/${item.itemId}`,
      imageUrl,
      location: item.location?.cityName || 'Onbekend',
      distanceMeters: item.location?.distanceMeters,
      retailerId: this.retailer.id,
      isAvailable: true,
      discoveredAt: now,
      lastCheckedAt: now
    };
  }

  public async search(query: SearchQuery): Promise<NewProduct[]> {
    try {
      logger.info(`MarktplaatsScraper - Starting search for: ${query.searchText}`);

      // Check if we have a stored API URL
      let apiUrl = query.apiUrl;

      // If no API URL is stored, discover it
      if (!apiUrl && query.searchText.startsWith('http')) {
        const discoveredUrl = await this.apiDiscovery.discoverApiUrl(query.searchText);
        
        if (discoveredUrl) {
          apiUrl = discoveredUrl;
          // Store the discovered API URL
          await db('search_queries')
            .where({ id: query.id })
            .update({ apiUrl: discoveredUrl });
          logger.info(`MarktplaatsScraper - Stored new API URL for query ${query.id}`);
        } else {
          throw new Error('Could not discover API URL');
        }
      }

      if (!apiUrl) {
        throw new Error('No API URL available for this query');
      }

      const allProducts: NewProduct[] = [];

      // Get first page to get pagination info
      logger.info('MarktplaatsScraper - Fetching first page...');
      const firstPage = await this.fetchPage(apiUrl, 0);
      
      if (!firstPage.listings || !Array.isArray(firstPage.listings)) {
        logger.warn('Invalid response from Marktplaats API - no listings array');
        return [];
      }

      const totalResults = firstPage.totalResultCount;
      logger.info(`MarktplaatsScraper - Total results available: ${totalResults}`);

      // Add products from first page
      allProducts.push(...firstPage.listings.map(item => this.convertItemToProduct(item)));
      
      const maxPages = Math.ceil(totalResults / this.PAGE_SIZE);
      const allowedPages = firstPage.maxAllowedPageNumber || 0;
      const pagesToFetch = Math.min(maxPages - 1, allowedPages);
      
      logger.info('MarktplaatsScraper - Pagination info:', {
        totalResults,
        maxPages,
        allowedPages,
        pagesToFetch,
        currentProducts: allProducts.length
      });

      // Fetch remaining pages if available
      if (pagesToFetch > 0) {
        logger.info(`MarktplaatsScraper - Will fetch ${pagesToFetch} additional pages`);
        for (let page = 1; page <= pagesToFetch; page++) {
          const offset = page * this.PAGE_SIZE;
          logger.info(`MarktplaatsScraper - Fetching page ${page + 1} of ${pagesToFetch + 1} (offset: ${offset})`);
          
          const pageResponse = await this.fetchPage(apiUrl, offset);
          
          if (pageResponse.listings && Array.isArray(pageResponse.listings)) {
            const newProducts = pageResponse.listings.map(item => this.convertItemToProduct(item));
            allProducts.push(...newProducts);
            logger.info(`MarktplaatsScraper - Added ${newProducts.length} products from page ${page + 1}`);
          }

          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        logger.info('MarktplaatsScraper - No additional pages to fetch');
      }

      logger.info(`MarktplaatsScraper - Found ${allProducts.length} products in total`);
      return allProducts;

    } catch (error) {
      logger.error(`MarktplaatsScraper - Error during search: ${error}`);
      throw error;
    }
  }

  public formatProductUrl(productId: string): string {
    return `https://www.marktplaats.nl/v/${productId}`;
  }
}