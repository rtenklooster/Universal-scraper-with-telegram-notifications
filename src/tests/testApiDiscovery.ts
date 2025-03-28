import { MarktplaatsApiDiscovery } from '../application/scrapers/MarktplaatsApiDiscovery';
import logger from '../infrastructure/logger';

async function testApiDiscovery() {
    const discoverer = new MarktplaatsApiDiscovery();
    
    // Test URLs met verschillende filters en configuraties
    const testUrls = [
        // Basis zoekterm
        'https://www.marktplaats.nl/q/philips+zuigmond/',
        
        // Met conditie filter (alleen nieuw)
        'https://www.marktplaats.nl/q/philips+zuigmond/#f:30',
        
        // Met meerdere conditiefilters
        'https://www.marktplaats.nl/q/philips+zuigmond/#f:30,14050,31,32,13940',
        
        // Met categorie filter + conditiefilters
        'https://www.marktplaats.nl/l/witgoed-en-apparatuur/#q:philips+zuigmond|f:30,14050,31,32,13940',
        
        // Met subcategorie + conditiefilters
        'https://www.marktplaats.nl/l/witgoed-en-apparatuur/onderdelen-en-toebehoren/#q:philips+zuigmond|f:30,14050,31,32,13940',
        
        // Met locatiefilters
        'https://www.marktplaats.nl/l/witgoed-en-apparatuur/onderdelen-en-toebehoren/#q:philips+zuigmond|f:30,14050,31,32,13940|distanceMeters:10000|postcode:9831NG'
    ];

    for (const url of testUrls) {
        logger.info('---------------------------------------');
        logger.info(`Testing URL: ${url}`);
        try {
            const apiUrl = await discoverer.discoverApiUrl(url);
            if (apiUrl) {
                logger.info(`✅ Success! Found API URL: ${apiUrl}`);
                // Log de verschillende delen van de URL voor analyse
                const urlParts = new URL(apiUrl);
                logger.info('URL Analysis:');
                logger.info(`- Protocol: ${urlParts.protocol}`);
                logger.info(`- Host: ${urlParts.host}`);
                logger.info(`- Pathname: ${urlParts.pathname}`);
                logger.info(`- Search params: ${urlParts.search}`);
            } else {
                logger.error(`❌ No API URL found for: ${url}`);
            }
        } catch (error) {
            logger.error(`❌ Error testing URL ${url}:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconden wachten tussen requests
    }
}

// Run the test
testApiDiscovery().catch(error => {
    logger.error('Test failed:', error);
    process.exit(1);
});