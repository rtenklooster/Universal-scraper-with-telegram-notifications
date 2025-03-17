export interface SearchQuery {
  id: number;
  userId: number;
  retailerId: number;
  searchText: string;
  // minPrice and maxPrice removed as requested
  createdAt: Date;
  lastScrapedAt?: Date;
  isActive: boolean;
  intervalMinutes: number;
  // New notification preferences
  notifyOnNew: boolean;
  notifyOnPriceDrops: boolean;
  priceDropThresholdPercent?: number; // Optional threshold percentage for price drops
}

export type NewSearchQuery = Omit<SearchQuery, 'id' | 'createdAt' | 'lastScrapedAt'> & {
  createdAt?: Date;
};