export interface Retailer {
  id: number;
  name: string;
  baseUrl: string;
  useRotatingProxy: boolean;
  useRandomUserAgent: boolean;
  isActive: boolean;
}

export const RetailerType = {
  LIDL: 1,
  MARKTPLAATS: 2,
  VINTED: 3,
} as const;

export type RetailerTypeKeys = keyof typeof RetailerType;
export type RetailerTypeValues = (typeof RetailerType)[RetailerTypeKeys];