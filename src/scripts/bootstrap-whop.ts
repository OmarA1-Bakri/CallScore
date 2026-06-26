type WhopList<T> = {
  data?: T[];
  page_info?: {
    has_next_page?: boolean;
    end_cursor?: string | null;
  };
};

type WhopCompany = {
  id: string;
  title?: string | null;
  route?: string | null;
};

type WhopProduct = {
  id: string;
  title?: string | null;
  route?: string | null;
  company?: WhopCompany | null;
};

type WhopPlan = {
  id: string;
  title?: string | null;
  product?: { id?: string | null; title?: string | null } | null;
  billing_period?: number | null;
  plan_type?: string | null;
  release_method?: string | null;
  visibility?: string | null;
  currency?: string | null;
  initial_price?: number | null;
  renewal_price?: number | null;
  purchase_url?: string | null;
};

type TierPlanInput = {
  tier: "pro" | "alpha";
  title: string;
  productId: string;
  renewalPrice: number;
  description: string;
};

const API_BASE = (process.env.WHOP_API_BASE_URL ?? "https://api.whop.com/api/v1").replace(/\/$/, "");

export function readBootstrapProducts(env: NodeJS.ProcessEnv = process.env): {
  readonly free: string;
  readonly pro: string;
  readonly alpha: string;
} {
  return {
    free: requiredEnv("WHOP_FREE_PRODUCT_ID", env),
    pro: requiredEnv("WHOP_PRO_PRODUCT_ID", env),
    alpha: requiredEnv("WHOP_ALPHA_PRODUCT_ID", env),
  };
}

export function assertWhopBootstrapGraphContext(_env: NodeJS.ProcessEnv = process.env): void {
  throw new Error("non_graph_whop_mutation_blocked: legacy_whop_bootstrap_direct_provider_mutation_disabled_use_whop_mutation_node");
}

async function main(): Promise<void> {
  assertWhopBootstrapGraphContext();
  const products = readBootstrapProducts();
  const companyId = process.env.WHOP_COMPANY_ID ?? (await discoverCompanyIdFromProduct(products.pro));

  const desiredPlans: TierPlanInput[] = [
    {
      tier: "pro",
      title: "Pro Monthly",
      productId: products.pro,
      renewalPrice: Number(process.env.WHOP_PRO_MONTHLY_PRICE ?? "19"),
      description: "Monthly Pro access to alerts, watchlists, CSV exports, and recent-performance filters.",
    },
    {
      tier: "alpha",
      title: "Alpha Monthly",
      productId: products.alpha,
      renewalPrice: Number(process.env.WHOP_ALPHA_MONTHLY_PRICE ?? "49"),
      description: "Monthly Alpha access to backtests, consensus tools, API access, and webhooks.",
    },
  ];

  const plans = await listPlans(companyId);
  const outputs: Record<string, string> = {
    WHOP_PRO_PRODUCT_ID: products.pro,
    WHOP_ALPHA_PRODUCT_ID: products.alpha,
  };

  for (const desired of desiredPlans) {
    const existing = findMatchingPlan(plans, desired);
    const plan = existing ?? (await createMonthlyPlan(companyId, desired));
    outputs[`WHOP_${desired.tier.toUpperCase()}_PLAN_ID`] = plan.id;
    if (plan.purchase_url) {
      outputs[`WHOP_CHECKOUT_URL_${desired.tier.toUpperCase()}_MONTHLY`] = plan.purchase_url;
    }
  }

  console.log("Whop bootstrap complete.");
  console.log("Company:", companyId);
  console.log("Free product:", products.free);
  printEnv(outputs);
}

async function whop<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = requiredEnv("WHOP_API_KEY");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Whop ${response.status} ${path}: ${message}`);
  }

  return data as T;
}

async function discoverCompanyIdFromProduct(productId: string): Promise<string> {
  const product = await whop<WhopProduct>(`/products/${encodeURIComponent(productId)}`);
  const companyId = product.company?.id;

  if (!companyId) {
    fail(
      "Whop product lookup did not return product.company.id. Set WHOP_COMPANY_ID and rerun.",
    );
  }

  return companyId;
}

async function listPlans(companyId: string): Promise<WhopPlan[]> {
  const plans: WhopPlan[] = [];
  let after: string | undefined;

  do {
    const params = new URLSearchParams({ company_id: companyId, first: "50" });
    if (after) params.set("after", after);
    const page = await whop<WhopList<WhopPlan>>(`/plans?${params.toString()}`);
    plans.push(...(page.data ?? []));
    after = page.page_info?.has_next_page ? page.page_info.end_cursor ?? undefined : undefined;
  } while (after);

  return plans;
}

function findMatchingPlan(plans: WhopPlan[], desired: TierPlanInput): WhopPlan | undefined {
  return plans.find((plan) => {
    return (
      plan.product?.id === desired.productId &&
      plan.title?.toLowerCase() === desired.title.toLowerCase() &&
      plan.plan_type === "renewal" &&
      plan.release_method === "buy_now" &&
      plan.billing_period === 30 &&
      plan.visibility !== "archived"
    );
  });
}

async function createMonthlyPlan(companyId: string, desired: TierPlanInput): Promise<WhopPlan> {
  return whop<WhopPlan>("/plans", {
    method: "POST",
    body: JSON.stringify({
      company_id: companyId,
      product_id: desired.productId,
      title: desired.title,
      description: desired.description,
      visibility: "visible",
      release_method: "buy_now",
      plan_type: "renewal",
      billing_period: 30,
      currency: "usd",
      initial_price: 0,
      renewal_price: desired.renewalPrice,
      unlimited_stock: true,
    }),
  });
}

function printEnv(outputs: Record<string, string>): void {
  console.log("");
  console.log("Set these in Netlify production/deploy-preview/local environment:");
  for (const [key, value] of Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${key}=${value}`);
  }
}

function requiredEnv(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[key];
  if (!value) fail(`${key} is required.`);
  return value;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
