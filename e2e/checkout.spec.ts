import { expect, test } from "@playwright/test";
import { formatINR } from "../src/lib/format";
import type { Variant } from "../src/lib/nudges";
import { conversionsFor, expectConversions, exposuresFor, shopperIn } from "./helpers";

// Handloom Cotton Kurta, ₹1,199, ₹40 delivery.
const EXPECTED: Record<Variant, { upi: number; cod: number; badge: string | null; saved: number }> = {
  control: { upi: 1239, cod: 1239, badge: null, saved: 0 },
  upi_discount: { upi: 1214, cod: 1239, badge: "₹25 off", saved: 25 },
  free_delivery: { upi: 1199, cod: 1239, badge: "Free delivery", saved: 40 },
};

const upiRadio = (page: import("@playwright/test").Page) => page.getByRole("radio", { name: /^UPI/ });
const codRadio = (page: import("@playwright/test").Page) => page.getByRole("radio", { name: /^Cash on Delivery/ });

test.describe("store", () => {
  test("lists the four products and opens checkout", async ({ page }) => {
    await page.goto("/");
    for (const name of ["Handloom Cotton Kurta", "Banarasi Silk Dupatta", "Chanderi Kurta Set", "Block-print Cotton Saree"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
    await page.getByRole("link", { name: "Buy now" }).first().click();
    await expect(page).toHaveURL(/\/checkout\?product=cotton-kurta/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  });

  test("an unknown product redirects to the store", async ({ page }) => {
    await page.goto("/checkout?product=does-not-exist");
    await expect(page).toHaveURL(/\/$/);
  });
});

for (const variant of Object.keys(EXPECTED) as Variant[]) {
  const e = EXPECTED[variant];

  test.describe(`variant ${variant}`, () => {
    test("shows the right nudge and prices", async ({ context, page }) => {
      await shopperIn(variant, context, page);
      if (e.badge) {
        await expect(page.getByTestId("upi-badge")).toHaveText(e.badge);
        await expect(page.getByTestId("nudge-message")).toBeVisible();
      } else {
        await expect(page.getByTestId("upi-badge")).toHaveCount(0);
        await expect(page.getByTestId("nudge-message")).toHaveCount(0);
      }
      await expect(upiRadio(page)).not.toBeChecked();
      await expect(codRadio(page)).not.toBeChecked();
      await expect(page.getByRole("button", { name: "Choose a payment method" })).toBeDisabled();

      await upiRadio(page).check();
      await expect(page.getByTestId("order-total")).toHaveText(formatINR(e.upi));
      await codRadio(page).check();
      await expect(page.getByTestId("order-total")).toHaveText(formatINR(e.cod));
    });

    test("UPI order: pays via the mock UPI sheet and sends both events", async ({ context, page }) => {
      const id = await shopperIn(variant, context, page);
      await upiRadio(page).check();
      await page.getByRole("button", { name: `Pay ${formatINR(e.upi)} with UPI` }).click();

      const sheet = page.getByRole("dialog", { name: "Pay with UPI" });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(formatINR(e.upi));
      await sheet.getByRole("button", { name: "PhonePe" }).click();

      await expect(page).toHaveURL(/\/order\//);
      await expect(page.getByRole("heading", { name: "Order placed!" })).toBeVisible();
      await expect(page.getByTestId("payment-summary")).toContainText(`Paid ${formatINR(e.upi)} by UPI`);
      if (e.saved) await expect(page.getByTestId("savings")).toContainText(formatINR(e.saved));
      else await expect(page.getByTestId("savings")).toHaveCount(0);

      await expectConversions(id, ["checkout_completed", "prepaid_order_completed"]);
      for (const ev of await conversionsFor(id)) {
        expect(ev.value).toBe(String(e.upi)); // the SDK sends values as strings
        expect(ev.metadata).toMatchObject({ variant, payment_method: "upi" });
      }
    });

    test("COD order: places the order and sends only the guardrail event", async ({ context, page }) => {
      const id = await shopperIn(variant, context, page);
      await codRadio(page).check();
      await page.getByRole("button", { name: `Place order · pay ${formatINR(e.cod)} on delivery` }).click();

      await expect(page).toHaveURL(/\/order\//);
      await expect(page.getByTestId("payment-summary")).toContainText(`Pay ${formatINR(e.cod)} in cash`);
      await expect(page.getByTestId("savings")).toHaveCount(0);

      await expectConversions(id, ["checkout_completed"]);
      expect((await conversionsFor(id))[0]).toMatchObject({ value: String(e.cod), metadata: { variant, payment_method: "cod" } });
    });
  });
}

test.describe("checkout behaviour", () => {
  test("the variant is sticky for a shopper across reloads", async ({ context, page }) => {
    await shopperIn("upi_discount", context, page);
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(page.getByTestId("debug-variant").locator("code")).toHaveText("upi_discount");
    }
  });

  test("quantity updates totals and is limited to 1–5", async ({ context, page }) => {
    await shopperIn("upi_discount", context, page);
    const minus = page.getByRole("button", { name: "Decrease quantity" });
    const plus = page.getByRole("button", { name: "Increase quantity" });
    await expect(minus).toBeDisabled();

    await upiRadio(page).check();
    await plus.click();
    await plus.click();
    await expect(page.getByTestId("order-total")).toHaveText(formatINR(1199 * 3 + 40 - 25));
    for (let i = 0; i < 5; i++) if (await plus.isEnabled()) await plus.click();
    await expect(plus).toBeDisabled();
    await expect(page.getByTestId("order-total")).toHaveText(formatINR(1199 * 5 + 40 - 25));

    await page.getByRole("button", { name: /with UPI/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Google Pay" }).click();
    await expect(page.getByText("Qty 5")).toBeVisible();
  });

  test("cancelling the UPI sheet places no order; switching to COD works", async ({ context, page }) => {
    const id = await shopperIn("free_delivery", context, page);
    await upiRadio(page).check();
    await page.getByRole("button", { name: /with UPI/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/checkout/);

    await page.waitForTimeout(3_000); // longer than the SDK flush interval
    expect(await conversionsFor(id)).toHaveLength(0);

    await codRadio(page).check();
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page).toHaveURL(/\/order\//);
    await expectConversions(id, ["checkout_completed"]);
  });

  test("shows an error and lets the shopper retry when the order API fails", async ({ context, page }) => {
    await shopperIn("control", context, page);
    let fail = true;
    await page.route("**/api/orders", (route) =>
      fail ? route.fulfill({ status: 500, json: { error: "Payment service unavailable" } }) : route.continue(),
    );
    await codRadio(page).check();
    await page.getByRole("button", { name: /Place order/ }).click();
    // (Next.js renders its own empty route-announcer alert, so match ours by text.)
    await expect(page.getByRole("alert").filter({ hasText: "Payment service unavailable" })).toBeVisible();

    fail = false;
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page).toHaveURL(/\/order\//);
  });

  test("can be completed with the keyboard only", async ({ context, page, isMobile }) => {
    test.skip(isMobile, "keyboard flow is a desktop concern");
    await shopperIn("control", context, page);
    await codRadio(page).focus();
    await page.keyboard.press("Space");
    await expect(codRadio(page)).toBeChecked();
    await page.getByRole("button", { name: /Place order/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/order\//);
  });

  test("placing an order never records an extra exposure", async ({ context, page }) => {
    const id = await shopperIn("upi_discount", context, page);
    await page.waitForTimeout(2_500);
    const before = (await exposuresFor(id)).length;
    expect(before).toBeLessThanOrEqual(1); // 1 once the experiment is running, 0 while it is a draft

    await codRadio(page).check();
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page).toHaveURL(/\/order\//);
    await expectConversions(id, ["checkout_completed"]);
    expect(await exposuresFor(id)).toHaveLength(before);
  });

  test("an unknown order shows a friendly not-found page", async ({ page }) => {
    await page.goto("/order/does-not-exist");
    await expect(page.getByRole("heading", { name: "Order not found" })).toBeVisible();
  });

  test("'new shopper' gives a fresh visitor ID", async ({ context, page }) => {
    const id = await shopperIn("control", context, page);
    await page.getByRole("link", { name: /new shopper/ }).click();
    await expect(page).toHaveURL(/\/checkout\?product=cotton-kurta&debug=1/);
    const cookie = (await context.cookies()).find((c) => c.name === "pf_vid");
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.value).not.toBe(id);
  });
});
