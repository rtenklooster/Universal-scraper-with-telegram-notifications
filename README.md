# MultiScraper

A flexible, extensible multi-retailer scraper system that monitors product prices and sends notifications through Telegram.

## Features

- Web scraping system for multiple retailers
- Price monitoring with notifications on new items or price drops
- Telegram bot interface for user interaction
- Customizable search queries with price filtering
- Configurable search intervals per query
- Support for rotating proxies and user agents to avoid blocking
- Location-based filtering and distance information for Marktplaats items
- Scalable database design that can start with SQLite and migrate to cloud solutions

## Supported Retailers

- Lidl (implemented)
  - Searches through Lidl's API
  - Supports category and search queries
  - Price tracking and notifications
- Marktplaats (implemented)
  - Supports searching by location
  - Shows distance to items
  - Handles both fixed price and bidding items
  - Uses API discovered through URL parsing
- Vinted (to be implemented)
- More can be added by implementing the BaseScraper interface

## Technologies

- **Language**: TypeScript/Node.js
- **Database**: 
  - SQLite for local development
  - Azure SQL Server for cloud deployment
- **Telegram**: Telegraf library for bot implementation
- **Scraping**: 
  - Axios for HTTP requests
  - Puppeteer for API discovery
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
git clone https://github.com/rtenklooster/Universal-scraper-with-telegram-notifications.git
cd Universal-scraper-with-telegram-notifications
```

2. Install dependencies
```bash
npm install
```

3. Setup data directories
```bash
mkdir -p data logs
```

4. Configure environment variables
   - Copy `.env.example` to `.env`
   - Update the values:
     - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
     - `DATABASE_TYPE`: 'sqlite' for local or 'mssql' for Azure
     - Database connection details if using Azure SQL
     - `USE_ROTATING_PROXY`: true/false for proxy usage
     - `LOG_LEVEL`: Logging verbosity (info/debug/error)

5. Build the project
```bash
npm run build
```

6. Start the application
```bash
npm start
```

For development mode with auto-reloading:
```bash
npm run dev
```

## Usage

After starting the bot, you can interact with it through Telegram:

- `/start` - Initialize the bot
- `/help` - Show available commands
- `/search` - Start a new search query
- `/mysearches` - View and manage your searches
- `/notifications` - View unread notifications
- `/settings` - Manage your settings
- `/test` - Test your searches (forces an immediate check)

You can also paste product URLs directly to monitor specific items.

## Project Structure

```
src/
├── domain/             # Domain models and interfaces
├── infrastructure/     # Infrastructure configuration
│   ├── config.ts      # Configuration management
│   ├── database.ts    # Database setup and migrations
│   └── logger.ts      # Logging configuration
├── core/              # Core functionality
├── application/       # Application services
│   ├── scrapers/      # Retailer-specific scrapers
│   ├── notifications/ # Notification management
│   └── telegram/      # Telegram bot interface
└── utils/            # Utility functions
```

## Adding a New Retailer

1. Create a new scraper class in `src/application/scrapers` that extends `BaseScraper`
2. Implement the required methods:
   - `search()` - Search for products
   - `formatProductUrl()` - Generate product URLs
3. Add the retailer to the database through migration
4. Update the scraper factory in `src/index.ts`

Example:
```typescript
export class NewRetailerScraper extends BaseScraper {
  async search(query: SearchQuery): Promise<NewProduct[]> {
    // Implementation
  }

  formatProductUrl(productId: string): string {
    // Implementation
  }
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.