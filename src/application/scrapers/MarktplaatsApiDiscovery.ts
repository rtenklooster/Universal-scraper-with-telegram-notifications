import * as puppeteer from 'puppeteer';
import logger from '../../infrastructure/logger';

export class MarktplaatsApiDiscovery {
    private browser: puppeteer.Browser | null = null;

    private async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true
            });
        }
    }

    private async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    private async interceptApiUrl(page: puppeteer.Page): Promise<string | null> {
        return new Promise((resolve) => {
            let apiUrl: string | null = null;
            let timeoutId: NodeJS.Timeout;

            const handleResponse = async (response: puppeteer.HTTPResponse) => {
                const url = response.url();
                if (url.includes('/lrp/api/search')) {
                    logger.debug(`Intercepted potential API URL: ${url}`);
                    apiUrl = url;
                    clearTimeout(timeoutId);
                    page.removeAllListeners('response');
                    resolve(apiUrl);
                }
            };

            timeoutId = setTimeout(() => {
                page.removeAllListeners('response');
                resolve(apiUrl);
            }, 10000);

            page.on('response', handleResponse);
        });
    }

    private createFallbackApiUrl(searchQuery: string): string {
        const encodedQuery = encodeURIComponent(searchQuery);
        return `https://www.marktplaats.nl/lrp/api/search?limit=30&offset=0&query=${encodedQuery}&searchInTitleAndDescription=true&viewOptions=list-view`;
    }

    private extractSearchQuery(url: string): string {
        try {
            if (url.includes('/q/')) {
                // Extract from /q/ URL format
                const match = url.match(/\/q\/([^/#?]+)/);
                if (match) return decodeURIComponent(match[1]);
            } else if (url.includes('#q:')) {
                // Extract from #q: format
                const match = url.match(/#q:([^|]+)/);
                if (match) return decodeURIComponent(match[1]);
            }
            
            // If we can't extract, return the whole URL
            return url;
        } catch (error) {
            logger.error(`Error extracting search query from URL: ${error}`);
            return url;
        }
    }

    public async discoverApiUrl(searchUrl: string): Promise<string | null> {
        logger.debug('Starting API URL discovery for Marktplaats');

        // If the URL doesn't contain a hash, use the fallback API URL directly
        if (!searchUrl.includes('#')) {
            const searchQuery = this.extractSearchQuery(searchUrl);
            const fallbackUrl = this.createFallbackApiUrl(searchQuery);
            logger.debug(`Using fallback API URL: ${fallbackUrl}`);
            return fallbackUrl;
        }

        try {
            await this.initBrowser();
            if (!this.browser) throw new Error('Browser not initialized');

            const page = await this.browser.newPage();

            try {
                // Format URL if needed
                const url = searchUrl.startsWith('http') ? 
                    searchUrl : 
                    `https://www.marktplaats.nl/q/${encodeURIComponent(searchUrl)}`;

                logger.debug(`Visiting page to intercept API URL: ${url}`);

                // Start intercepting before navigation
                const apiUrlPromise = this.interceptApiUrl(page);
                
                // Navigate and wait for network idle
                await page.goto(url, { 
                    waitUntil: 'networkidle0',
                    timeout: 30000 
                });

                // Scroll a bit to trigger lazy loading
                await page.mouse.wheel({ deltaY: 500 });

                // Wait a bit for any additional requests
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Get the intercepted API URL
                const apiUrl = await apiUrlPromise;

                if (apiUrl) {
                    logger.debug(`Discovered Marktplaats API URL: ${apiUrl}`);
                    return apiUrl;
                } else {
                    // If no API URL was discovered, use the fallback
                    const searchQuery = this.extractSearchQuery(url);
                    const fallbackUrl = this.createFallbackApiUrl(searchQuery);
                    logger.debug(`No API URL discovered, using fallback: ${fallbackUrl}`);
                    return fallbackUrl;
                }
            } finally {
                await page.close();
            }
        } catch (error) {
            logger.error(`Error discovering API URL: ${error}`);
            // Even if there's an error, try to use the fallback
            const searchQuery = this.extractSearchQuery(searchUrl);
            const fallbackUrl = this.createFallbackApiUrl(searchQuery);
            logger.debug(`Error occurred, using fallback API URL: ${fallbackUrl}`);
            return fallbackUrl;
        } finally {
            await this.closeBrowser();
        }
    }
}