import { test, expect, newSale, saleState, checked, product, choosePayment } from "./fixtures";
import { formatRand } from "../lib/money";
import { type World } from "./fixtures";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import type { Route } from "@playwright/test";

function localSql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_tapup-redteam-local-20261024", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
async function prime(world: World) {
  const rows = await checked(await world.admin.from("sales").select("id").eq("shop_id", world.shopId).in("status", ["paid", "approved", "repaid"]));
  if (!rows.length) {
    const initial = await newSale(world);
    await choosePayment(world, initial.url, "Demo card / wallet");
    expect((await saleState(world, initial.id)).status).toBe("paid");
  }
}
async function requestTab(world: World) {
  await prime(world);
  const sale = await newSale(world, 3);
  await choosePayment(world, sale.url, "Demo card / wallet");
  expect((await saleState(world, sale.id)).status).toBe("tab_requested");
  await world.ownerPage.getByRole("button", { name: "Refresh requests", exact: true }).click();
  await expect(world.ownerPage.getByRole("button", { name: "Approve tab", exact: true })).toBeEnabled();
  return sale;
}

test("demo payment reaches the customer and completes the owner's active sale", async ({ world }, info) => {
  const { ownerPage: owner, customerPage: customer } = world;
  await owner.goto("/shop/ledger");
  await owner.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(owner.getByRole("tabpanel")).toHaveText("Transactions will appear here when a sale is recorded.");
  const sale = await newSale(world);
  await customer.goto(sale.url);
  await expect(customer.getByRole("region", { name: "Sale total" })).toContainText(formatRand(sale.total));
  await choosePayment(world, sale.url, "Demo card / wallet");
  expect((await saleState(world, sale.id)).status).toBe("paid");
  await expect(customer.getByText("Current limit", { exact: true }).locator("..")).toContainText("R50.00");
  await owner.getByRole("button", { name: "Refresh requests", exact: true }).click();
  await expect(owner.getByRole("heading", { name: "Customer Payment" })).toBeHidden();
  await expect(owner.getByRole("region", { name: "Owner payment requests" }).getByRole("status")).toHaveText("Payment received.");
  await owner.getByRole("heading", { name: "Browser Demo Shop" }).scrollIntoViewIfNeeded();
  await owner.screenshot({ path: info.outputPath("owner-dashboard.png"), fullPage: false });
  await owner.getByRole("link", { name: "Ledger", exact: true }).first().click();
  await expect(owner.getByRole("region", { name: "Shop totals" })).toContainText(formatRand(sale.total));
  await expect(owner.getByRole("button", { name: /View Demo Customer, owed/ })).toContainText("Limit R50.00");
  await owner.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(owner.getByRole("tabpanel")).toContainText("Demo Customer");
  await owner.reload();
  await expect(owner.getByRole("region", { name: "Shop totals" })).toContainText(formatRand(sale.total));
});

test("split cash, owner approval and partial/full repayments agree with the ledger and customer", async ({ world }, info) => {
  const { ownerPage: owner, customerPage: customer, strangerPage: stranger } = world;
  await prime(world);
  const sale = await newSale(world, 3);
  await customer.goto(sale.url);
  const available = await customer.getByRole("region", { name: "Tab amount" }).innerText();
  expect(available).toContain("R50.00");
  await choosePayment(world, sale.url, "Cash");
  let persisted = await saleState(world, sale.id);
  expect(persisted).toMatchObject({ status: "tab_requested", tab_cents: 5000, paid_now_cents: sale.total - 5000, paid_now_confirmed_at: null });
  await expect(customer.getByText("Awaiting owner approval", { exact: true })).toBeVisible();
  await owner.getByRole("button", { name: "Refresh requests", exact: true }).click();
  await expect(owner.getByRole("button", { name: "Approve tab", exact: true })).toBeDisabled();
  await owner.getByRole("button", { name: /Confirm cash received/ }).click();
  await expect(owner.getByText("Cash receipt recorded.", { exact: true })).toBeVisible();
  persisted = await saleState(world, sale.id);
  expect(persisted.paid_now_confirmed_at).not.toBeNull();
  await owner.getByRole("button", { name: "Approve tab", exact: true }).click();
  await expect(owner.getByText("Tab approved.", { exact: true })).toBeVisible();
  expect((await saleState(world, sale.id)).status).toBe("approved");
  await customer.reload();
  await expect(customer.getByRole("region", { name: "Tabs owed" })).toContainText("R50.00");
  expect(await customer.locator(".app-shell").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await customer.screenshot({ path: info.outputPath("customer-buying-power.png"), fullPage: false });
  await stranger.goto("/me");
  await expect(stranger.getByText("Browser Demo Shop", { exact: true })).toHaveCount(0);
  await stranger.goto("/shop/sell");
  await expect(stranger).toHaveURL(/\/me$/);
  await owner.getByRole("link", { name: "Ledger", exact: true }).first().click();
  for (const remaining of [2500, 0]) {
    await owner.getByRole("button", { name: /View Demo Customer, owed/ }).click();
    await owner.getByRole("button", { name: "Mark repaid", exact: true }).click();
    await owner.getByLabel("Amount received (R)", { exact: true }).fill("25.00");
    await owner.getByRole("button", { name: "Confirm payment", exact: true }).dblclick();
    await expect(owner.getByRole("heading", { name: "Payment recorded", exact: true })).toBeVisible();
    await owner.getByRole("heading", { name: "Payment recorded", exact: true }).scrollIntoViewIfNeeded();
    await owner.screenshot({ path: info.outputPath(`repayment-${remaining}.png`), fullPage: false });
    const repayments = await checked(await world.admin.from("repayments").select("amount_cents,on_time").eq("sale_id", sale.id));
    expect(repayments).toHaveLength(remaining === 2500 ? 1 : 2);
    expect(repayments.reduce((sum, payment) => sum + payment.amount_cents, 0)).toBe(5000 - remaining);
    expect(repayments.every((r) => r.on_time)).toBe(true);
    expect((await saleState(world, sale.id)).status).toBe(remaining ? "approved" : "repaid");
    await owner.getByRole("button", { name: "Done", exact: true }).click();
    await expect(owner.getByRole("button", { name: /View Demo Customer, owed/ })).toContainText(formatRand(remaining));
    await customer.reload();
    await expect(customer.getByRole("region", { name: "Tabs owed" })).toContainText(formatRand(remaining));
    // Same-day purchases score once; only the fully settled on-time tab adds repayment points.
    const expectedLimit = remaining ? 10000 : 15000;
    await expect(customer.getByText("Current limit", { exact: true }).locator("..")).toContainText(formatRand(expectedLimit));
    const savedLimit = await checked(await world.admin.from("shop_customers").select("credit_limit_cents").eq("id", world.customerId).single());
    expect(savedLimit.credit_limit_cents).toBe(expectedLimit);
    await expect(owner.getByRole("button", { name: /View Demo Customer, owed/ })).toContainText(`Limit ${formatRand(expectedLimit)}`);
    await owner.reload();
  }
  await owner.getByRole("tab", { name: "Transactions", exact: true }).click();
  await expect(owner.getByText(/Tab repayment/)).toHaveCount(2);
  await owner.getByRole("link", { name: "Sell", exact: true }).click();
  // WHY: Wait for the destination before finding links; Next retains hidden prior routes during navigation.
  await expect(owner).toHaveURL(/\/shop\/sell$/);
  await expect(owner.getByRole("heading", { name: "Browser Demo Shop", exact: true })).toBeVisible();
  await owner.getByRole("navigation", { name: "Shop sections", exact: true }).getByRole("link", { name: "Ledger", exact: true }).click();
  const today = product.priceCents + sale.total;
  await expect(owner.getByRole("region", { name: "Shop totals" })).toContainText(formatRand(today));
});

test("empty lists, invalid input, real network failure, pending navigation and safe retry", async ({ world }) => {
  const { ownerPage: owner } = world;
  await owner.goto("/shop/ledger");
  await expect(owner.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible();
  await owner.getByRole("tab", { name: "Transactions", exact: true }).click();
  const before = await checked(await world.admin.from("sales").select("id").eq("shop_id", world.shopId));
  if (before.length === 0) await expect(owner.getByRole("tabpanel")).toHaveText("Transactions will appear here when a sale is recorded.");
  const sale = await requestTab(world);
  const unchanged = await saleState(world, sale.id);
  world.expectedProblems.push(/^Failed request: POST \/shop\/sell net::ERR_FAILED$/, /^Browser error: Failed to load resource: net::ERR_FAILED$/);
  await owner.route("**/shop/sell", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await owner.getByRole("button", { name: "Reject tab", exact: true }).click();
  await expect(owner.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Connection failed");
  await expect(owner.getByText(/Tab rejected\./)).toHaveCount(0);
  expect(await saleState(world, sale.id)).toEqual(unchanged);
  await owner.unroute("**/shop/sell");
  await owner.getByRole("button", { name: "Reject tab", exact: true }).dblclick();
  await expect(owner.getByText(/Tab rejected\./)).toBeVisible();
  expect((await saleState(world, sale.id)).status).toBe("cancelled");
  await owner.reload();
  await expect(owner.getByRole("button", { name: "Reject tab", exact: true })).toHaveCount(0);

  const another = await requestTab(world);
  let held: Route | undefined;
  const received = new Promise<void>((resolve) => {
    owner.route("**/shop/sell", (route) => {
      if (route.request().method() === "POST") { held = route; resolve(); }
      else return route.continue();
    });
  });
  world.expectedProblems.push(/^Failed request: POST \/shop\/sell net::ERR_ABORTED$/);
  await owner.getByRole("button", { name: "Reject tab", exact: true }).click();
  await received;
  await expect(owner.getByRole("button", { name: "Reject tab", exact: true })).toBeDisabled();
  // WHY: Address-bar navigation cancels an in-flight action; Next client links queue behind server actions.
  await owner.goto("/shop/ledger");
  await expect(owner.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible();
  await held!.abort("aborted");
  await owner.unroute("**/shop/sell");
  expect((await saleState(world, another.id)).status).toBe("tab_requested");
  await owner.goto("/shop/sell");
  await expect(owner.getByRole("button", { name: "Reject tab", exact: true })).toBeVisible();
  await owner.getByRole("button", { name: "Reject tab", exact: true }).click();
  await expect(owner.getByText(/Tab rejected\./)).toBeVisible();

  // Invalid repayment input uses the real browser's min/step validation, without bypassing the form.
  const payable = await requestTab(world);
  await owner.getByRole("button", { name: "Approve tab", exact: true }).click();
  await expect(owner.getByText("Tab approved.", { exact: true })).toBeVisible();
  await owner.getByRole("link", { name: "Ledger", exact: true }).first().click();
  await owner.getByRole("button", { name: /View Demo Customer, owed/ }).click();
  await owner.getByRole("button", { name: "Mark repaid", exact: true }).click();
  await owner.getByLabel("Amount received (R)").fill("0");
  await owner.getByRole("button", { name: "Confirm payment", exact: true }).click();
  expect(await owner.getByLabel("Amount received (R)").evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe("");
  expect(await checked(await world.admin.from("repayments").select("id").eq("sale_id", payable.id))).toHaveLength(0);
  await owner.getByLabel("Amount received (R)").fill("1.00");
  await owner.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(owner.getByRole("heading", { name: "Payment recorded", exact: true })).toBeVisible();
});

test("cash expiry and server validation failures leave financial records unchanged", async ({ world }) => {
  await prime(world);
  const token = randomBytes(16).toString("hex");
  const sale = await checked(await world.admin.from("sales").insert({
    shop_id: world.shopId, total_cents: product.priceCents * 10,
    items: [{ productId: product.id, name: product.name, unitPriceCents: product.priceCents, qty: 10 }],
    qr_token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 12_000).toISOString(),
  }).select("id").single());
  await choosePayment(world, `http://127.0.0.1:3100/pay/${token}`, "Cash");
  await world.ownerPage.goto("/shop/sell");
  const cash = world.ownerPage.getByRole("button", { name: /Confirm cash received/ });
  await expect(cash).toBeEnabled();
  const before = await saleState(world, sale.id);
  // WHY: Wait for this fixture's actual DB expiry boundary; never mutate immutable expiry or disable triggers.
  await expect.poll(() => localSql(`SELECT expires_at <= clock_timestamp() FROM sales WHERE id='${sale.id}'`), { timeout: 15_000 }).toBe("t");
  await cash.click();
  await expect(world.ownerPage.getByRole("alert").filter({ hasText: /\S/ })).toContainText("This sale has expired");
  expect(await saleState(world, sale.id)).toEqual(before);
  expect(await checked(await world.admin.from("repayments").select("id").eq("sale_id", sale.id))).toHaveLength(0);
  await world.ownerPage.reload();
  await expect(world.ownerPage.getByRole("button", { name: /Confirm cash received/ })).toHaveCount(0);
  await world.strangerPage.goto(`http://127.0.0.1:3100/pay/${token}`);
  await expect(world.strangerPage.getByRole("button", { name: "Cash", exact: true })).toHaveCount(0);
  const blocked = await requestTab(world);
  const blockedBefore = await saleState(world, blocked.id);
  await checked(await world.admin.from("shop_customers").update({ status: "blocked" }).eq("id", world.customerId));
  try {
    await world.ownerPage.getByRole("button", { name: "Approve tab", exact: true }).click();
    await expect(world.ownerPage.getByRole("alert").filter({ hasText: /\S/ })).toContainText("could not be completed");
    expect(await saleState(world, blocked.id)).toEqual(blockedBefore);
  } finally { await checked(await world.admin.from("shop_customers").update({ status: "active" }).eq("id", world.customerId)); }
  const anonymous = await world.ownerPage.context().browser()!.newContext();
  try {
    const page = await anonymous.newPage();
    await page.goto("http://127.0.0.1:3100/shop/ledger");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  } finally { await anonymous.close(); }
});

test("full cash receipt is recorded once and survives owner/customer refresh", async ({ world }) => {
  const link = await checked(await world.admin.from("shop_customers").insert({
    shop_id: world.shopId, customer_profile_id: world.stranger.id, customer_phone: "+27825550112",
    display_name: "Demo Cash Customer", consent_at: new Date().toISOString(), owner_confirmed_at: new Date().toISOString(),
  }).select("id").single());
  try {
    const sale = await newSale(world);
    await choosePayment({ ...world, customerPage: world.strangerPage }, sale.url, "Cash");
    expect(await saleState(world, sale.id)).toMatchObject({ status: "pending", shop_customer_id: link.id, paid_now_confirmed_at: null });
    await world.ownerPage.getByRole("button", { name: "Refresh requests", exact: true }).click();
    const held = new Promise<Route>((resolve) => {
      world.ownerPage.route("**/shop/sell", (route) => {
        if (route.request().method() === "POST") resolve(route);
        else return route.continue();
      });
    });
    world.expectedProblems.push(/^Failed request: POST \/shop\/sell net::ERR_ABORTED$/);
    await world.ownerPage.getByRole("button", { name: /Confirm cash received/ }).click();
    const interrupted = await held;
    await expect(world.ownerPage.getByRole("button", { name: /Confirm cash received/ })).toBeDisabled();
    await world.ownerPage.reload();
    await interrupted.abort("aborted");
    await world.ownerPage.unroute("**/shop/sell");
    expect((await saleState(world, sale.id)).paid_now_confirmed_at).toBeNull();
    await expect(world.ownerPage.getByText("Cash receipt recorded.", { exact: true })).toHaveCount(0);
    await world.ownerPage.getByRole("button", { name: /Confirm cash received/ }).dblclick();
    await expect(world.ownerPage.getByText("Cash receipt recorded.", { exact: true })).toBeVisible();
    const receipt = await saleState(world, sale.id);
    expect(receipt).toMatchObject({ status: "paid", paid_now_cents: sale.total, tab_cents: 0 });
    expect(receipt.paid_now_confirmed_at).not.toBeNull();
    await world.ownerPage.getByRole("button", { name: "Refresh requests", exact: true }).click();
    await expect(world.ownerPage.getByRole("button", { name: /Confirm cash received/ })).toHaveCount(0);
    expect(await saleState(world, sale.id)).toEqual(receipt);
    await world.strangerPage.reload();
    await expect(world.strangerPage.getByRole("region", { name: "Recent activity" })).toContainText("Paid");
    await world.ownerPage.reload();
    await world.ownerPage.getByRole("link", { name: "Ledger", exact: true }).first().click();
    await expect(world.ownerPage.getByRole("region", { name: "Shop totals" })).toContainText(formatRand(sale.total));
    expect(await checked(await world.admin.from("repayments").select("id").eq("sale_id", sale.id))).toHaveLength(0);
  } finally {
    await checked(await world.admin.from("sales").delete().eq("shop_id", world.shopId).eq("shop_customer_id", link.id));
    await checked(await world.admin.from("shop_customers").delete().eq("id", link.id));
  }
});

test("a persisted repayment with a failed limit refresh never invites a duplicate payment", async ({ world }) => {
  const { ownerPage: owner } = world;
  const sale = await requestTab(world);
  await owner.getByRole("button", { name: "Approve tab", exact: true }).click();
  await expect(owner.getByText("Tab approved.", { exact: true })).toBeVisible();
  const suffix = randomUUID().replaceAll("-", "");
  const name = `e2e_fail_${suffix}`;
  // This narrowly scoped fault exists only on the guarded disposable local DB and only this fixture's customer.
  localSql(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id='${world.customerId}'::uuid THEN RAISE EXCEPTION 'Synthetic cache update failure'; END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER ${name} BEFORE UPDATE OF credit_limit_cents ON public.shop_customers FOR EACH ROW EXECUTE FUNCTION public.${name}();`);
  try {
    await owner.getByRole("link", { name: "Ledger", exact: true }).first().click();
    await owner.getByRole("button", { name: /View Demo Customer, owed/ }).click();
    // Select this test's newest outstanding tab; earlier test receipts are left intact.
    const owed = (await saleState(world, sale.id)).tab_cents;
    const controls = owner.getByRole("button", { name: "Mark repaid", exact: true });
    for (let index = 0; index < await controls.count(); index++) {
      await controls.nth(index).click();
      if (await owner.getByLabel("Amount received (R)").getAttribute("id") === `repayment-${sale.id}`) break;
    }
    await expect(owner.getByLabel("Amount received (R)")).toHaveAttribute("id", `repayment-${sale.id}`);
    await owner.getByLabel("Amount received (R)").fill("1.00");
    await owner.getByRole("button", { name: "Confirm payment", exact: true }).click();
    await expect.poll(async () => (await checked(await world.admin.from("repayments").select("id").eq("sale_id", sale.id))).length).toBe(1);
    await expect(owner.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Payment was recorded");
    await expect(owner.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Refresh");
    await expect(owner.getByRole("button", { name: "Confirm payment", exact: true })).toHaveCount(0);
    await expect(owner.getByRole("heading", { name: "Payment recorded", exact: true })).toHaveCount(0);
    const records = await checked(await world.admin.from("repayments").select("amount_cents").eq("sale_id", sale.id));
    expect(records).toEqual([{ amount_cents: 100 }]);
    expect((await saleState(world, sale.id)).tab_cents).toBe(owed);
  } finally { localSql(`DROP TRIGGER ${name} ON public.shop_customers; DROP FUNCTION public.${name}();`); }
  await owner.getByRole("button", { name: "Refresh records", exact: true }).click();
  const retry = owner.getByRole("button", { name: "Mark repaid", exact: true });
  await expect(retry).toBeEnabled();
  await expect(owner.getByText(formatRand(4900), { exact: true }).first()).toBeVisible();
  expect(await checked(await world.admin.from("repayments").select("id").eq("sale_id", sale.id))).toHaveLength(1);
});
