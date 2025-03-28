export interface SearchQuery {
  id: number;
  userId: number;
  retailerId: number;
  searchText: string;
  apiUrl?: string;
  createdAt: Date;
  lastScrapedAt?: Date;
  isActive: boolean;
  intervalMinutes: number;
  // New notification preferences
  notifyOnNew: boolean;
  notifyOnPriceDrops: boolean;
  priceDropThresholdPercent?: number; // Optional threshold percentage for price drops
  isFirstRun?: boolean; // Track if this is the first run of the query
}

export type NewSearchQuery = Omit<SearchQuery, 'id' | 'createdAt' | 'lastScrapedAt'> & {
  createdAt?: Date;
};