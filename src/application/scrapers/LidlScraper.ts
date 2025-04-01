import { BaseScraper } from './BaseScraper';
import { NewProduct } from '../../domain/Product';
import { SearchQuery } from '../../domain/SearchQuery';
import logger from '../../infrastructure/logger';

interface LidlApiParams {
  fetchsize?: number;
  offset?: number;
  locale?: string;
  assortment?: string;
  version?: string;
  idsOnly?: boolean;
  productsOnly?: boolean;
  sort?: string;
  q?: string;
  // Allow any additional parameters that Lidl might use
  [key: string]: string | number | boolean | undefined;
}

interface LidlApiProduct {
  id?: string;
  code?: string;
  fullTitle?: string;
  name?: string;
  label?: string;
  mainImageUrl?: string;
  mouseoverImage?: string;
  canonicalUrl?: string;
  images?: Array<{
    id: string;
    perspective: string;
    format: string;
    url: string;
  }>;
  price?: {
    price?: number;
    regularPrice?: number;
    oldPrice?: number;
    unit?: string;
    unitPrice?: {
      price: number;
      unit: string;
    };
    validFrom?: string;
    validTo?: string;
  };
  gridbox?: {
    data?: {
      price?: {
        price?: number;
        oldPrice?: number;
      };
      image?: string;
      canonicalPath?: string;
      fullTitle?: string;
      brand?: {
        name?: string;
      };
      category?: string;
    }
  };
  availability?: {
    availabilityNote?: string;
    orderAvailability?: {
      maxQuantity: number;
      availability: string;
      availableFrom?: string;
      availableTo?: string;
    };
    orderable?: boolean;
  };
  brand?: string;
  brandLogo?: string;
  online?: {
    link: string;
    isOrderable: boolean;
  };
}

interface LidlApiResponse {
  metadata: {
    total: number;
    offset: number;
    limit: number;
  };
  results: LidlApiProduct[];
}

export class LidlScraper extends BaseScraper {
  private readonly API_BASE_URL = 'https://www.lidl.nl/q/api';
  private readonly DEFAULT_API_PARAMS: LidlApiParams = {
    fetchsize: 48,
    offset: 0,
    locale: 'nl_NL',
    assortment: 'NL',
    version: '2.1.0',
    idsOnly: false,
    productsOnly: true
  };

  private parseJson(response: string): LidlApiResponse {
    try {
      if (typeof response !== 'string') {
        logger.error(`LidlScraper - Invalid response type: ${typeof response}`);
        logger.debug(`LidlScraper - Response content: ${JSON.stringify(response)}`);
        throw new Error('Response is not a string');
      }
      
      // Log full response for debugging
      logger.debug(`LidlScraper - Full response: ${response}`);
      
      const parsed = JSON.parse(response);
      logger.debug(`LidlScraper - Parsed response structure: ${JSON.stringify(parsed, null, 2)}`);
      
      // Validate response structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Response is not a valid JSON object');
      }
      
      // Support different response structures based on Python code
      
      // Format 1: items array in the root
      if (parsed.items && Array.isArray(parsed.items)) {
        return {
          metadata: {
            total: parsed.numFound || 0,
            offset: parsed.offset || 0,
            limit: parsed.fetchsize || this.DEFAULT_API_PARAMS.fetchsize!
          },
          results: parsed.items
        };
      }
      
      // Format 2: searchResponse structure
      if (parsed.searchResponse?.items && Array.isArray(parsed.searchResponse.items)) {
        return {
          metadata: {
            total: parsed.searchResponse.numFound || 0,
            offset: parsed.searchResponse.offset || 0,
            limit: parsed.searchResponse.fetchsize || this.DEFAULT_API_PARAMS.fetchsize!
          },
          results: parsed.searchResponse.items
        };
      }
      
      // Format 3: products array in the root
      if (parsed.products && Array.isArray(parsed.products)) {
        return {
          metadata: {
            total: parsed.numFound || parsed.products.length,
            offset: parsed.offset || 0,
            limit: parsed.fetchsize || this.DEFAULT_API_PARAMS.fetchsize!
          },
          results: parsed.products
        };
      }
      
      // Format 4: results with products array
      if (parsed.results?.products && Array.isArray(parsed.results.products)) {
        return {
          metadata: {
            total: parsed.numFound || parsed.results.products.length,
            offset: parsed.offset || 0,
            limit: parsed.fetchsize || this.DEFAULT_API_PARAMS.fetchsize!
          },
          results: parsed.results.products
        };
      }
      
      // Format 5: array of products directly
      if (Array.isArray(parsed)) {
        return {
          metadata: {
            total: parsed.length,
            offset: 0,
            limit: parsed.length
          },
          results: parsed
        };
      }
      
      logger.error(`LidlScraper - Unexpected response structure: ${JSON.stringify(parsed)}`);
      throw new Error('Response does not contain any recognized product structure');
    } catch (err) {
      const error = err as Error;
      logger.error(`LidlScraper - JSON parsing error: ${error.message}`);
      logger.debug(`LidlScraper - Full response on error: ${response}`);
      throw new Error(`Invalid JSON response: ${error.message}`);
    }
  }

  async search(query: SearchQuery): Promise<NewProduct[]> {
    try {
      const initialUrl = await this.createApiUrl(query.searchText);
      logger.info(`LidlScraper - Searching with URL: ${initialUrl}`);
      
      // Make initial API call
      const response = await this.httpClient.get(initialUrl);
      const data = this.parseJson(response);
      
      // Process initial results
      const products = await this.processProducts(data.results || []);
      
      // Handle pagination if there are more results
      if (data.metadata?.total > data.metadata?.limit) {
        const totalPages = Math.ceil(data.metadata.total / this.DEFAULT_API_PARAMS.fetchsize!);
        logger.info(`LidlScraper - Found ${data.metadata.total} total products, fetching ${totalPages} pages`);
        
        // Fetch remaining pages in parallel, starting from page 1 since we already have page 0
        const promises = [];
        for (let page = 1; page < totalPages; page++) {
          const offset = page * this.DEFAULT_API_PARAMS.fetchsize!;
          const nextUrl = await this.createApiUrl(query.searchText, offset);
          logger.info(`LidlScraper - Fetching page ${page + 1} with URL: ${nextUrl}`);
          promises.push(this.fetchAdditionalPage(nextUrl));
        }
        
        const additionalProducts = (await Promise.all(promises)).flat();
        products.push(...additionalProducts);
      }

      logger.info(`LidlScraper - Search completed, found ${products.length} products total`);
      this.logFoundProducts(products);
      return products;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`LidlScraper - Error during search: ${error.message}`);
      } else {
        logger.error(`LidlScraper - Unknown error during search`);
      }
      return [];
    }
  }

  private async fetchAdditionalPage(url: string): Promise<NewProduct[]> {
    try {
      const response = await this.httpClient.get(url);
      const data = this.parseJson(response);
      return this.processProducts(data.results || []);
    } catch (error) {
      logger.error(`LidlScraper - Error fetching additional page: ${error}`);
      return [];
    }
  }

  private async processProducts(results: LidlApiProduct[]): Promise<NewProduct[]> {
    const products: NewProduct[] = [];
    for (const item of results) {
      try {
        const product = await this.processApiProduct(item);
        products.push(product);
      } catch (error) {
        logger.error(`LidlScraper - Error processing product: ${error}`);
      }
    }
    return products;
  }

  private async createApiUrl(input: string, offset?: number): Promise<string> {
    const params = { ...this.DEFAULT_API_PARAMS };
    if (offset !== undefined) {
      params.offset = offset;
    }

    if (input.startsWith('http')) {
      try {
        const url = new URL(input);
        
        // Handle different URL formats
        if (url.pathname.includes('/q/query/')) {
          // Format: /q/query/parkside-performance
          const query = url.pathname.split('/q/query/')[1];
          // Copy relevant query parameters
          url.searchParams.forEach((value, key) => {
            if (!['offset', 'fetchsize'].includes(key)) {
              params[key] = value;
            }
          });
          if (url.searchParams.get('sort')) {
            params.sort = url.searchParams.get('sort')!;
          }
          return `${this.API_BASE_URL}/query/${query}${this.formatQueryParams(params)}`;
        } 
        else if (url.pathname.includes('/q/api/')) {
          // Already an API URL, just use it as is but ensure our default params
          const apiPath = url.pathname.replace('/q/api/', '');
          url.searchParams.forEach((value, key) => {
            if (!['offset', 'fetchsize'].includes(key)) {
              params[key] = value;
            }
          });
          return `${this.API_BASE_URL}/${apiPath}${this.formatQueryParams(params)}`;
        }
        else if (url.pathname.includes('/q/search')) {
          // Format: /q/search?q=...
          const searchQuery = url.searchParams.get('q');
          const brand = url.searchParams.get('brand');
          if (searchQuery) {
            params.q = brand ? `${searchQuery} ${brand}` : searchQuery;
            return `${this.API_BASE_URL}/search${this.formatQueryParams(params)}`;
          }
        }
        else if (url.pathname.includes('/category/')) {
          // Format: /category/klussen/h10003574
          const categoryPath = url.pathname.split('/category/')[1];
          if (categoryPath) {
            return `${this.API_BASE_URL}/category/${categoryPath}${this.formatQueryParams(params)}`;
          }
        }

        // If no specific format matched, try to extract search query
        const query = url.searchParams.get('query') || url.searchParams.get('q');
        if (query) {
          params.q = query;
          return `${this.API_BASE_URL}/search${this.formatQueryParams(params)}`;
        }
      } catch (error) {
        logger.error(`Error parsing URL: ${error}`);
      }
    }

    // Default: treat input as search term
    return `${this.API_BASE_URL}/search${this.formatQueryParams({
      ...params,
      q: input
    })}`;
  }

  private formatQueryParams(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    }
    return `?${searchParams.toString()}`;
  }

  private async processApiProduct(item: LidlApiProduct): Promise<NewProduct> {
    // Extract product ID using both possible fields
    const productId = item.id || item.code || '';
    if (!productId) {
      logger.error(`LidlScraper - Missing product ID in item: ${JSON.stringify(item)}`);
      throw new Error('Missing product ID');
    }
    
    // Extract title using multiple possible fields
    const title = item.fullTitle || 
                 (item.gridbox?.data?.fullTitle) || 
                 item.name || 
                 item.label || 
                 'Onbekend product';
                 
    // Extract price using different possible structures
    let price = 0;
    let oldPrice = undefined;
    let currency = 'EUR';
    
    // Try gridbox price structure first
    if (item.gridbox?.data?.price?.price !== undefined) {
      price = item.gridbox.data.price.price;
      oldPrice = item.gridbox.data.price.oldPrice;
    } 
    // Then try regular price structure
    else if (item.price?.price !== undefined) {
      price = item.price.price;
      oldPrice = item.price.oldPrice || item.price.regularPrice;
      if (item.price.unit) {
        currency = item.price.unit;
      }
    }
    
    // Extract image URL with fallbacks
    let imageUrl = item.mainImageUrl || '';
    if (!imageUrl && item.images && item.images.length > 0) {
      imageUrl = item.images[0].url;
    }
    if (!imageUrl && item.mouseoverImage) {
      imageUrl = item.mouseoverImage;
    }
    if (!imageUrl && item.gridbox?.data?.image) {
      imageUrl = item.gridbox.data.image;
    }
    
    // Extract product URL with fallbacks
    let productUrl = '';
    if (item.online?.link) {
      productUrl = item.online.link;
    } else if (item.canonicalUrl) {
      productUrl = this.formatProductUrl(item.canonicalUrl);
    } else if (item.gridbox?.data?.canonicalPath) {
      productUrl = this.formatProductUrl(item.gridbox.data.canonicalPath);
    }
    
    // Determine availability
    let isAvailable = true;
    if (item.availability) {
      isAvailable = item.availability.orderable === true;
      if (item.online?.isOrderable !== undefined) {
        isAvailable = isAvailable && item.online.isOrderable;
      }
    }
    
    // Extract brand information
    const brand = item.brand || 
                 (item.gridbox?.data?.brand?.name) || 
                 'Onbekend';
    
    // Create timestamp for both date fields
    const now = new Date();
    
    return {
      retailerId: this.retailer.id,
      externalId: productId,
      title,
      price,
      oldPrice,
      currency,
      imageUrl,
      productUrl,
      isAvailable,
      description: `Merk: ${brand}\n${item.availability?.availabilityNote || ''}`,
      discoveredAt: now,
      lastCheckedAt: now,
      queryId: 0 // This will be set by the scheduler
    };
  }

  formatProductUrl(productPath: string): string {
    if (productPath.startsWith('http')) {
      return productPath;
    }
    
    // Zorg ervoor dat het pad begint met een slash
    if (!productPath.startsWith('/')) {
      productPath = `/${productPath}`;
    }
    
    return `${this.retailer.baseUrl}${productPath}`;
  }
}