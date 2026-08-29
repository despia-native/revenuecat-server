# revenuecat-server

> ### Despia Integration
>
> This repository provides an integration for Despia applications. Check the current [Despia documentation](https://docs.despia.com) to determine whether your project uses **Despia Convert**, **DSX Native**, or both.

A lightweight server-side SDK for the [RevenueCat v2 REST API](https://www.revenuecat.com/docs/api-v2). Makes entitlement checks and offering/package management simple — so you can follow security best practices without wrestling with webhooks or complex API calls.

**Works with:** Node.js 18+, Deno, Bun — and any backend (Express, Fastify, Hono, Next.js API routes, Lambda, etc.). Zero dependencies.

> **Server-side only.** API keys must **never** be on the frontend. Use this SDK in your backend only. Build secure API proxies: your frontend calls *your* backend; your backend uses this SDK to fetch offerings, check entitlements, etc. Never expose RevenueCat API keys to the client.

## Install

```bash
npm install revenuecat-server
```

```bash
pnpm add revenuecat-server
```

```bash
yarn add revenuecat-server
```

## Requirements

- Node.js 18+ (uses native `fetch`), or Deno/Bun

## Setup

```js
const { RevenueCatClient } = require("revenuecat-server");

const rc = new RevenueCatClient({
  apiKey: process.env.REVENUECAT_API_KEY, // v2 secret key
  projectId: process.env.REVENUECAT_PROJECT_ID,
});
```

---

## API

### Customers

#### `getCustomer(customerId, options?)`

Fetch a single customer. `active_entitlements` is always included.

```js
const customer = await rc.getCustomer("user-uuid");

// With attributes expanded
const customer = await rc.getCustomer("user-uuid", {
  expand: ["attributes"],
});
```

---

#### `getActiveEntitlements(customerId)`

Returns all active entitlements as a flat array (auto-paginates).

```js
const entitlements = await rc.getActiveEntitlements("user-uuid");
// [{ entitlement_id: "premium", expires_at: 1234567890000 }, ...]
```

---

#### `hasEntitlement(customerId, entitlementId)`

Quick boolean check for a specific entitlement.

```js
const isPremium = await rc.hasEntitlement("user-uuid", "premium");
// true | false
```

---

#### `requireEntitlement(customerId, entitlementId)`

Throws `AccessDeniedError` if the customer lacks the entitlement. Ideal for API route guards.

```js
try {
  await rc.requireEntitlement("user-uuid", "premium");
  // User has access — serve premium content or proceed with operation
} catch (err) {
  if (err instanceof AccessDeniedError) {
    return res.status(403).json({ error: "Premium required" });
  }
  throw err;
}
```

---

#### `requireAnyEntitlement(customerId, entitlementIds)`

Throws `AccessDeniedError` if the customer has **none** of the given entitlements. Use for "any premium tier" checks.

```js
await rc.requireAnyEntitlement("user-uuid", ["premium", "pro", "enterprise"]);
```

---

### Server-side access control

| Need | Use |
|------|-----|
| Gate an API route or operation | `requireEntitlement(customerId, "premium")` |
| Conditional logic / custom UI | `hasEntitlement(customerId, "premium")` |
| "Any of these tiers" check | `requireAnyEntitlement(customerId, ["premium", "pro"])` |
| Sync entitlements to your DB (cron) | `getActiveEntitlements(customerId)` |
| Handle access denied | `catch (err) { if (err instanceof AccessDeniedError) { ... } }` |

You can rely on live checks instead of webhooks if that fits your stack better — this SDK keeps the flow simple.

---

### Offerings

#### `getOffering(offeringId, options?)`

Fetch a raw offering. Defaults to `expand=["package.product"]`.

```js
const offering = await rc.getOffering("ofrnge1a2b3c4d5");
```

---

#### `getProductsByPlatform(offeringId, packageId)`

Get products for a specific package, grouped by platform.

```js
const products = await rc.getProductsByPlatform(
  "ofrnge1a2b3c4d5",
  "pkge1a2b3c4d5"
);
// {
//   ios:     [{ store_identifier: "com.app.monthly", display_name: "...", ... }],
//   android: [{ store_identifier: "com.app.monthly.android", ... }],
//   other:   []
// }
```

---

#### `getOfferingPackages(offeringId)`

All packages in an offering, each with products grouped by platform. Auto-paginates both packages and products.

```js
const packages = await rc.getOfferingPackages("ofrnge1a2b3c4d5");
// [
//   {
//     id: "pkge1a2b3c4d5",
//     lookup_key: "monthly",
//     display_name: "Monthly",
//     position: 1,
//     products: { ios: [...], android: [...], other: [...] }
//   }
// ]
```

---

## Error Handling

- **RevenueCatError** — Thrown on API errors (4xx, 5xx). Has `status` and `body`.
- **AccessDeniedError** — Thrown by `requireEntitlement` and `requireAnyEntitlement` when access is denied. Has `customerId` and `entitlementIds`.

```js
const { RevenueCatError, AccessDeniedError } = require("revenuecat-server");

try {
  const customer = await rc.getCustomer("bad-id");
} catch (err) {
  if (err instanceof RevenueCatError) {
    console.error(err.status); // 404
    console.error(err.body); // { message: "Not found" }
  }
  if (err instanceof AccessDeniedError) {
    console.error(err.customerId, err.entitlementIds);
  }
}
```

---

## Notes

- **Server-side only** — Run this SDK in your backend. Expose data to your frontend via secure proxy endpoints (e.g. `GET /api/offerings`, `GET /api/me/entitlements`). Your frontend never touches RevenueCat directly.
- **Prices are not available** via RevenueCat — fetch those from Apple StoreKit / Google Play Billing directly using `store_identifier`.
- Your API key must have the correct permissions:
  - `customer_information:customers:read` — for customer/entitlement endpoints
  - `project_configuration:packages:read` — for packages
  - `project_configuration:products:read` — for products
- Rate limits: **480 req/min** for customer endpoints, **60 req/min** for offering/project config endpoints.

## Run Tests

```bash
npm test
# or
pnpm test
# or
yarn test
```

## License & Credits

MIT License. If you use, fork, or build upon this project, **credits to [@despia-native](https://github.com/despia-native) are required** (e.g. in your README, about section, or attribution).
