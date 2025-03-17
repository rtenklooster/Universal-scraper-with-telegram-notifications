export interface Product {
  id: number;
  retailerId: number;
  externalId: string;
  title: string;
  description?: string;
  price: number;
  oldPrice?: number;
  currency: string;
  imageUrl?: string;
  productUrl: string;
  location?: string;
  distanceMeters?: number;
  discoveredAt: Date;
  lastCheckedAt: Date;
  isAvailable: boolean;
}

export type NewProduct = Omit<Product, 'id' | 'discoveredAt' | 'lastCheckedAt'> & {
  discoveredAt?: Date;
  lastCheckedAt?: Date;
};