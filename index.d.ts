/**
 * revenuecat-server — Server-side SDK for RevenueCat v2 API
 * @see https://www.revenuecat.com/docs/api-v2
 */

export interface RevenueCatClientConfig {
  apiKey: string;
  projectId: string;
}

export interface GetCustomerOptions {
  expand?: string[];
}

export interface GetOfferingOptions {
  expand?: string[];
}

export interface ProductsByPlatform {
  ios: Product[];
  android: Product[];
  other: Product[];
}

export interface PackageWithProducts {
  id: string;
  lookup_key: string;
  display_name: string;
  position: number;
  products: ProductsByPlatform;
}

export interface ActiveEntitlement {
  entitlement_id: string;
  expires_at?: number;
  [key: string]: unknown;
}

export interface Product {
  id: string;
  store_identifier: string;
  display_name?: string;
  type?: string;
  app?: { type?: string };
  subscription?: { duration?: string; trial_duration?: string | null };
  eligibility_criteria?: string;
  [key: string]: unknown;
}

export class RevenueCatClient {
  constructor(config: RevenueCatClientConfig);

  getCustomer(customerId: string, options?: GetCustomerOptions): Promise<Record<string, unknown>>;
  getActiveEntitlements(customerId: string): Promise<ActiveEntitlement[]>;
  hasEntitlement(customerId: string, entitlementId: string): Promise<boolean>;
  requireEntitlement(customerId: string, entitlementId: string): Promise<void>;
  requireAnyEntitlement(customerId: string, entitlementIds: string[]): Promise<void>;

  getOffering(offeringId: string, options?: GetOfferingOptions): Promise<Record<string, unknown>>;
  getProductsByPlatform(offeringId: string, packageId: string): Promise<ProductsByPlatform>;
  getOfferingPackages(offeringId: string): Promise<PackageWithProducts[]>;
}

export class RevenueCatError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>);
}

export class AccessDeniedError extends Error {
  customerId: string;
  entitlementIds: string[];
  constructor(customerId: string, entitlementIdOrIds: string | string[]);
}
