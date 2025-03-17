# MultiScraper

A flexible, extensible multi-retailer scraper system that monitors product prices and sends notifications through Telegram.

## Features

- Web scraping system for multiple retailers
- Price monitoring with notifications on new items or price drops
- Telegram bot interface for user interaction
- Customizable search queries with price filtering
- Configurable search intervals per query
- Support for rotating proxies and user agents to avoid blocking
- Scalable database design that can start with SQLite and migrate to cloud solutions

## Supported Retailers

- Lidl (implemented)
- Marktplaats (to be implemented)
- Vinted (to be implemented)
- More can be added by implementing the BaseScraper interface

## Technologies

- **Language**: TypeScript/Node.js
- **Database**: SQLite (local development), easily extendable to PostgreSQL/MySQL for cloud deployment
- **Telegram**: Telegraf library for bot implementation
- **Scraping**: Axios for HTTP requests, Cheerio for HTML parsing
- **Scheduling**: node-schedule for timed operations
- **Configuration**: dotenv for environment variables
- **Logging**: Winston for structured logging

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Telegram Bot Token (get from [@BotFather](https://t.me/botfather))

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/multiscraper.git
cd multiscraper
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
   - Copy `.env.example` to `.env`
   - Update the values, especially `TELEGRAM_BOT_TOKEN`

4. Build the project
```bash
npm run build
```

5. Start the application
```bash
npm start
```

For development mode with auto-reloading:
```bash
npm run dev
```

## Configuration

Edit the `.env` file to configure:

- Telegram bot token
- Default scrape intervals
- Database settings
- Proxy settings
- Logging level

## Project Structure

```
multiscraper/
├── src/
│   ├── domain/             # Domain models
│   ├── infrastructure/     # Infrastructure configuration
│   ├── core/               # Core functionality
│   ├── application/        # Application services
│   │   ├── scrapers/       # Retailer scrapers
│   │   ├── notifications/  # Notification management
│   │   └── telegram/       # Telegram bot interface
│   └── utils/              # Utility functions
├── tests/                  # Unit and integration tests
└── docs/                   # Documentation
```

## Adding a New Retailer

1. Create a new file in `src/application/scrapers` that extends the `BaseScraper` class
2. Implement the required methods:
   - `search()` - to search for products
   - `checkProduct()` - to check if product exists and get current price
   - `formatProductUrl()` - to generate product URLs
3. Update the scraper factory in `src/index.ts` to include your new scraper

Example:
```typescript
export class NewRetailerScraper extends BaseScraper {
  async search(query: SearchQuery): Promise<NewProduct[]> {
    // Implementation
  }

  async checkProduct(product: Product): Promise<Product> {
    // Implementation
  }

  formatProductUrl(productId: string): string {
    // Implementation
  }
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.