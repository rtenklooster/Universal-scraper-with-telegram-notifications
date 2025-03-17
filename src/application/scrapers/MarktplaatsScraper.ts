import { BaseScraper } from './BaseScraper';
import { Product, NewProduct } from '../../domain/Product';
import { SearchQuery } from '../../domain/SearchQuery';
import { Retailer } from '../../domain/Retailer';
import logger from '../../infrastructure/logger';

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

// Updated interface to match actual API response
interface MarktplaatsSearchResponse {
  listings: MarktplaatsItem[];
}

export class MarktplaatsScraper extends BaseScraper {
  private readonly API_BASE_URL = 'https://www.marktplaats.nl/lrp/api/search';
  
  constructor(retailer: Retailer) {
    super(retailer);
  }

  public async search(query: SearchQuery): Promise<NewProduct[]> {
    try {
      const products = await this.scrape(query.searchText);
      this.logFoundProducts(products);
      return products;
    } catch (error) {
      logger.error(`Error searching Marktplaats: ${error}`);
      return [];
    }
  }

  public async checkProduct(product: Product): Promise<Product> {
    try {
      const products = await this.scrape(product.title);
      const updatedProduct = products.find(p => p.externalId === product.externalId);
      
      if (!updatedProduct) {
        return {
          ...product,
          isAvailable: false,
          lastCheckedAt: new Date()
        };
      }

      return {
        ...product,
        price: updatedProduct.price,
        isAvailable: true,
        lastCheckedAt: new Date()
      };
    } catch (error) {
      logger.error(`Error checking Marktplaats product: ${error}`);
      return {
        ...product,
        lastCheckedAt: new Date()
      };
    }
  }

  public formatProductUrl(productId: string): string {
    return `https://www.marktplaats.nl/v/path-to-product/${productId}`;
  }

  protected async parseUrl(url: string): Promise<{ query: string; additionalParams: Record<string, string> }> {
    try {
      const parsedUrl = new URL(url);
      const searchParams = new URLSearchParams(parsedUrl.search);
      
      // Extract query from either q parameter or path
      let query = searchParams.get('q') || '';
      if (!query && parsedUrl.hash) {
        // Try to extract from hash format like #q:search+term
        const hashMatch = parsedUrl.hash.match(/q:([^|]+)/);
        if (hashMatch) {
          query = decodeURIComponent(hashMatch[1]);
        }
      }
      
      // Extract additional parameters
      const additionalParams: Record<string, string> = {};
      
      // Extract postcode if present
      if (parsedUrl.hash && parsedUrl.hash.includes('postcode:')) {
        const postcodeMatch = parsedUrl.hash.match(/postcode:([^|]+)/);
        if (postcodeMatch) {
          additionalParams.postcode = postcodeMatch[1];
        }
      }
      
      // Extract distance if present
      if (parsedUrl.hash && parsedUrl.hash.includes('distanceMeters:')) {
        const distanceMatch = parsedUrl.hash.match(/distanceMeters:(\d+)/);
        if (distanceMatch) {
          additionalParams.distanceMeters = distanceMatch[1];
        }
      }
      
      // Extract offered since if present
      if (parsedUrl.hash && parsedUrl.hash.includes('offeredSince:')) {
        const offeredSinceMatch = parsedUrl.hash.match(/offeredSince:([^|]+)/);
        if (offeredSinceMatch) {
          const offeredSince = offeredSinceMatch[1];
          additionalParams['attributesByKey[]'] = `offeredSince:${offeredSince}`;
        }
      }

      // Extract category IDs if present in the URL path
      const pathMatch = parsedUrl.pathname.match(/\/l\/[^\/]+\/([^\/]+)/);
      if (pathMatch) {
      }

      return { query, additionalParams };
    } catch (error) {
      logger.error(`Error parsing Marktplaats URL: ${error}`);
      throw new Error('Invalid Marktplaats URL');
    }
  }

  private async scrape(searchText: string): Promise<NewProduct[]> {
    try {
      // Check if searchText is a URL
      let query: string;
      let additionalParams: Record<string, string> = {};

      if (searchText.startsWith('http')) {
        const parsed = await this.parseUrl(searchText);
        query = parsed.query;
        additionalParams = parsed.additionalParams;
      } else {
        query = searchText;
        // Add default category IDs for all non-URL searches
        additionalParams.l1CategoryId = '322';
        additionalParams.l2CategoryId = '338';
      }

      // Construct API URL with parameters
      const params = new URLSearchParams({
        query,
        limit: '30',
        offset: '0',
        searchInTitleAndDescription: 'true',
        viewOptions: 'list-view',
        ...additionalParams
      });

      const apiUrl = `${this.API_BASE_URL}?${params.toString()}`;
      
      // Log original search URL (if applicable) and API URL
      if (searchText.startsWith('http')) {
        logger.info(`MarktplaatsScraper - Original URL: ${searchText}`);
      }
      logger.info(`MarktplaatsScraper - API URL: ${apiUrl}`);

      // Make API request
      const response = await this.httpClient.get(apiUrl, {
        'Accept': 'application/json',
        'Accept-Language': 'nl,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Referer': 'https://www.marktplaats.nl/',
        'Origin': 'https://www.marktplaats.nl'
      });

      // Parse the response with better error handling
      let data: MarktplaatsSearchResponse;
      try {
        data = JSON.parse(response);
      } catch (parseError) {
        logger.error(`MarktplaatsScraper - JSON parsing error: ${parseError}`);
        logger.debug(`MarktplaatsScraper - Raw response: ${response}`);
        throw parseError;
      }

      // Check if we have search results
      if (!data || !data.listings || !Array.isArray(data.listings)) {
        logger.warn('Invalid or empty response from Marktplaats API');
        logger.debug(`MarktplaatsScraper - Response structure: ${JSON.stringify(data, null, 2)}`);
        return [];
      }

      const now = new Date();

      // Transform API response to Product objects
      return data.listings.map((item: MarktplaatsItem) => {
        const price = item.priceInfo.priceType === 'FAST_BID' ? 0 : item.priceInfo.priceCents / 100;
        
        // Get image URL with fallback logic
        let imageUrl = item.pictures?.[0]?.largeUrl || item.imageUrls?.[0];
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `https:${imageUrl}`;
        }
        
        return {
          externalId: item.itemId,
          title: item.title,
          description: item.description,
          price,
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
      });

    } catch (error) {
      logger.error(`MarktplaatsScraper - Error during scraping: ${error}`);
      if (error instanceof Error) {
        logger.debug(`MarktplaatsScraper - Error details: ${error.message}`);
      }
      return [];
    }
  }
}