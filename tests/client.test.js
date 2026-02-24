// Simple test runner (no dependencies needed)
const {
  RevenueCatClient,
  RevenueCatError,
  AccessDeniedError,
} = require("../index");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const mockResponses = {};

global.fetch = async (url, options) => {
  const path = url
    .toString()
    .replace("https://api.revenuecat.com/v2", "")
    .split("?")[0];
  const response = mockResponses[path];
  if (!response) throw new Error(`No mock for path: ${path}`);
  return {
    ok: response.status < 400,
    status: response.status,
    json: async () => response.body,
  };
};

function mockGet(path, body, status = 200) {
  mockResponses[path] = { body, status };
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const PROJECT_ID = "proj1ab2c3d4";
const CUSTOMER_ID = "19b8de26-77c1-49f1-aa18-019a391603e2";
const OFFERING_ID = "ofrnge1a2b3c4d5";
const PACKAGE_ID = "pkge1a2b3c4d5";

mockGet(`/projects/${PROJECT_ID}/customers/${CUSTOMER_ID}`, {
  object: "customer",
  id: CUSTOMER_ID,
  project_id: PROJECT_ID,
  first_seen_at: 1658399423658,
  last_seen_at: 1658399423658,
  active_entitlements: {
    object: "list",
    items: [
      {
        object: "customer.active_entitlement",
        entitlement_id: "premium",
        expires_at: 9999999999999,
      },
    ],
    next_page: null,
    url: `/v2/projects/${PROJECT_ID}/customers/${CUSTOMER_ID}/active_entitlements`,
  },
});

mockGet(`/projects/${PROJECT_ID}/offerings/${OFFERING_ID}`, {
  object: "offering",
  id: OFFERING_ID,
  lookup_key: "default",
  display_name: "Default Offering",
  is_current: true,
  project_id: PROJECT_ID,
  packages: {
    object: "list",
    items: [
      {
        object: "package",
        id: PACKAGE_ID,
        lookup_key: "monthly",
        display_name: "Monthly",
        position: 1,
        products: {
          object: "list",
          items: [
            {
              product: {
                id: "prod_ios",
                store_identifier: "com.app.monthly",
                display_name: "Monthly Premium",
                type: "subscription",
                app: { type: "app_store" },
                subscription: { duration: "P1M", trial_duration: "P3D" },
              },
              eligibility_criteria: "all",
            },
            {
              product: {
                id: "prod_android",
                store_identifier: "com.app.monthly.android",
                display_name: "Monthly Premium",
                type: "subscription",
                app: { type: "play_store" },
                subscription: { duration: "P1M", trial_duration: null },
              },
              eligibility_criteria: "all",
            },
          ],
          next_page: null,
          url: `/v2/projects/${PROJECT_ID}/offerings/${OFFERING_ID}/packages/${PACKAGE_ID}/products`,
        },
      },
    ],
    next_page: null,
    url: `/v2/projects/${PROJECT_ID}/offerings/${OFFERING_ID}/packages`,
  },
});

// ─── Tests ───────────────────────────────────────────────────────────────────

const client = new RevenueCatClient({ apiKey: "test_key", projectId: PROJECT_ID });

async function runTests() {
  console.log("\n🧪 RevenueCatClient Tests\n");

  // Constructor validation
  console.log("Constructor:");
  try {
    new RevenueCatClient({});
    assert(false, "Should throw if apiKey missing");
  } catch (e) {
    assert(e.message.includes("apiKey"), "Throws if apiKey missing");
  }
  try {
    new RevenueCatClient({ apiKey: "x" });
    assert(false, "Should throw if projectId missing");
  } catch (e) {
    assert(e.message.includes("projectId"), "Throws if projectId missing");
  }

  // getCustomer
  console.log("\ngetCustomer:");
  const customer = await client.getCustomer(CUSTOMER_ID);
  assert(customer.id === CUSTOMER_ID, "Returns correct customer id");
  assert(
    customer.active_entitlements.items.length === 1,
    "Returns active_entitlements"
  );

  // getActiveEntitlements
  console.log("\ngetActiveEntitlements:");
  const entitlements = await client.getActiveEntitlements(CUSTOMER_ID);
  assert(Array.isArray(entitlements), "Returns an array");
  assert(entitlements.length === 1, "Returns correct number of entitlements");
  assert(
    entitlements[0].entitlement_id === "premium",
    "Returns correct entitlement_id"
  );

  // hasEntitlement
  console.log("\nhasEntitlement:");
  const hasPremium = await client.hasEntitlement(CUSTOMER_ID, "premium");
  assert(hasPremium === true, "Returns true for active entitlement");
  const hasGold = await client.hasEntitlement(CUSTOMER_ID, "gold");
  assert(hasGold === false, "Returns false for missing entitlement");

  // requireEntitlement
  console.log("\nrequireEntitlement:");
  await client.requireEntitlement(CUSTOMER_ID, "premium");
  assert(true, "Does not throw when customer has entitlement");
  try {
    await client.requireEntitlement(CUSTOMER_ID, "gold");
    assert(false, "Should throw AccessDeniedError when missing entitlement");
  } catch (e) {
    assert(e instanceof AccessDeniedError, "Throws AccessDeniedError");
    assert(e.customerId === CUSTOMER_ID, "AccessDeniedError has customerId");
    assert(e.entitlementIds.includes("gold"), "AccessDeniedError has entitlementIds");
  }

  // requireAnyEntitlement
  console.log("\nrequireAnyEntitlement:");
  await client.requireAnyEntitlement(CUSTOMER_ID, ["premium", "gold"]);
  assert(true, "Does not throw when customer has at least one");
  try {
    await client.requireAnyEntitlement(CUSTOMER_ID, ["gold", "enterprise"]);
    assert(false, "Should throw when customer has none");
  } catch (e) {
    assert(e instanceof AccessDeniedError, "Throws AccessDeniedError");
  }

  // getProductsByPlatform
  console.log("\ngetProductsByPlatform:");
  const products = await client.getProductsByPlatform(OFFERING_ID, PACKAGE_ID);
  assert(products.ios.length === 1, "Returns 1 iOS product");
  assert(products.android.length === 1, "Returns 1 Android product");
  assert(
    products.ios[0].store_identifier === "com.app.monthly",
    "iOS store_identifier correct"
  );
  assert(
    products.android[0].store_identifier === "com.app.monthly.android",
    "Android store_identifier correct"
  );

  // getOfferingPackages
  console.log("\ngetOfferingPackages:");
  const packages = await client.getOfferingPackages(OFFERING_ID);
  assert(packages.length === 1, "Returns 1 package");
  assert(packages[0].lookup_key === "monthly", "Package lookup_key correct");
  assert(packages[0].products.ios.length === 1, "Package has iOS products");

  // Error handling
  console.log("\nError handling:");
  mockGet(
    `/projects/${PROJECT_ID}/customers/bad_id`,
    { message: "Not found" },
    404
  );
  try {
    await client.getCustomer("bad_id");
    assert(false, "Should throw on 404");
  } catch (e) {
    assert(e instanceof RevenueCatError, "Throws RevenueCatError");
    assert(e.status === 404, "Error has correct status");
  }

  // Summary
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Unexpected test error:", err);
  process.exit(1);
});
