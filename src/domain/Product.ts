export interface NewProduct {
  externalId: string;
  title: string;
  description: string;
  price: number;
  oldPrice?: number;
  priceType?: string;
  currency: string;
  productUrl: string;
  imageUrl?: string;
  location?: string;
  distanceMeters?: number;
  retailerId: number;
  isAvailable: boolean;
  discoveredAt: Date;
  lastCheckedAt: Date;
}

export interface Product extends NewProduct {
  id: number;
}