const BASE_URL = "https://api.revenuecat.com/v2";

class RevenueCatClient {
  constructor({ apiKey, projectId }) {
    if (!apiKey) throw new Error("RevenueCatClient: apiKey is required");
    if (!projectId) throw new Error("RevenueCatClient: projectId is required");

    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  get #headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async #get(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), { headers: this.#headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new RevenueCatError(response.status, error);
    }

    return response.json();
  }

  async #paginate(firstPage, getItems, getNextPage) {
    const items = [...getItems(firstPage)];
    let nextPage = getNextPage(firstPage);

    while (nextPage) {
      const page = await this.#get(nextPage);
      items.push(...getItems(page));
      nextPage = getNextPage(page);
    }

    return items;
  }

  // ─── Customers ───────────────────────────────────────────────────────────────

  /**
   * Get a customer by ID.
   * @param {string} customerId
   * @param {{ expand?: string[] }} options
   */
  async getCustomer(customerId, { expand = [] } = {}) {
    const params = expand.length ? { expand } : {};
    return this.#get(
      `/projects/${this.projectId}/customers/${customerId}`,
      params
    );
  }

  /**
   * Get all active entitlements for a customer (auto-paginates).
   * @param {string} customerId
   * @returns {Promise<ActiveEntitlement[]>}
   */
  async getActiveEntitlements(customerId) {
    const customer = await this.getCustomer(customerId);
    return this.#paginate(
      customer.active_entitlements,
      (page) => page.items,
      (page) => page.next_page
    );
  }

  /**
   * Check if a customer has a specific entitlement active.
   * @param {string} customerId
   * @param {string} entitlementId
   * @returns {Promise<boolean>}
   */
  async hasEntitlement(customerId, entitlementId) {
    const entitlements = await this.getActiveEntitlements(customerId);
    return entitlements.some((e) => e.entitlement_id === entitlementId);
  }

  /**
   * Require a specific entitlement — throws AccessDeniedError if the customer
   * does not have it. Use in API route guards or before protected operations.
   * @param {string} customerId
   * @param {string} entitlementId
   * @throws {AccessDeniedError} when customer lacks the entitlement
   */
  async requireEntitlement(customerId, entitlementId) {
    const has = await this.hasEntitlement(customerId, entitlementId);
    if (!has) {
      throw new AccessDeniedError(customerId, entitlementId);
    }
  }

  /**
   * Require at least one of the given entitlements — throws AccessDeniedError
   * if the customer has none. Useful for "any premium tier" checks.
   * @param {string} customerId
   * @param {string[]} entitlementIds
   * @throws {AccessDeniedError} when customer lacks all entitlements
   */
  async requireAnyEntitlement(customerId, entitlementIds) {
    const entitlements = await this.getActiveEntitlements(customerId);
    const ids = new Set(entitlements.map((e) => e.entitlement_id));
    const hasAny = entitlementIds.some((id) => ids.has(id));
    if (!hasAny) {
      throw new AccessDeniedError(customerId, entitlementIds);
    }
  }

  // ─── Offerings ───────────────────────────────────────────────────────────────

  /**
   * Get a full offering with packages and products.
   * @param {string} offeringId
   * @param {{ expand?: string[] }} options
   */
  async getOffering(offeringId, { expand = ["package.product"] } = {}) {
    return this.#get(
      `/projects/${this.projectId}/offerings/${offeringId}`,
      { expand }
    );
  }

  /**
   * Get products for a specific package, grouped by platform.
   * @param {string} offeringId
   * @param {string} packageId
   * @returns {Promise<{ ios: Product[], android: Product[], other: Product[] }>}
   */
  async getProductsByPlatform(offeringId, packageId) {
    const offering = await this.getOffering(offeringId);

    const pkg = offering.packages.items.find((p) => p.id === packageId);
    if (!pkg) {
      throw new Error(
        `Package "${packageId}" not found in offering "${offeringId}"`
      );
    }

    // Paginate products if needed
    const products = await this.#paginate(
      pkg.products,
      (page) => page.items,
      (page) => page.next_page
    );

    return groupProductsByPlatform(products);
  }

  /**
   * Get all packages in an offering, each with products grouped by platform.
   * @param {string} offeringId
   * @returns {Promise<PackageWithProducts[]>}
   */
  async getOfferingPackages(offeringId) {
    const offering = await this.getOffering(offeringId);

    // Paginate packages if needed
    const packages = await this.#paginate(
      offering.packages,
      (page) => page.items,
      (page) => page.next_page
    );

    return Promise.all(
      packages.map(async (pkg) => {
        const products = await this.#paginate(
          pkg.products,
          (page) => page.items,
          (page) => page.next_page
        );
        return {
          id: pkg.id,
          lookup_key: pkg.lookup_key,
          display_name: pkg.display_name,
          position: pkg.position,
          products: groupProductsByPlatform(products),
        };
      })
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupProductsByPlatform(productItems) {
  const result = { ios: [], android: [], other: [] };

  for (const { product, eligibility_criteria } of productItems) {
    const appType = product.app?.type;
    const entry = { ...product, eligibility_criteria };

    if (appType === "app_store" || appType === "mac_app_store") {
      result.ios.push(entry);
    } else if (appType === "play_store") {
      result.android.push(entry);
    } else {
      result.other.push(entry);
    }
  }

  return result;
}

class RevenueCatError extends Error {
  constructor(status, body) {
    super(`RevenueCat API error ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

class AccessDeniedError extends Error {
  constructor(customerId, entitlementIdOrIds) {
    const ids =
      typeof entitlementIdOrIds === "string"
        ? entitlementIdOrIds
        : entitlementIdOrIds.join(", ");
    super(`Access denied: customer ${customerId} lacks entitlement(s) [${ids}]`);
    this.customerId = customerId;
    this.entitlementIds =
      typeof entitlementIdOrIds === "string"
        ? [entitlementIdOrIds]
        : entitlementIdOrIds;
  }
}

module.exports = { RevenueCatClient, RevenueCatError, AccessDeniedError };
