// Lift Pro subscriptions through Stripe's REST API. What someone paid for is
// kept on their user row (`planStatus`, `planUntil`, `planSource`), so access
// doesn't depend on Stripe being reachable and Apple in-app purchase can write
// the same fields later. Stripe's webhooks only say that something changed: the
// plan is always re-read from Stripe, so retries and out-of-order events can't
// leave it wrong.
import { createHmac, timingSafeEqual } from "node:crypto";
import { httpError } from "./http.js";

const API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE = 5 * 60 * 1000;
// Late webhooks and renewals shouldn't cut anyone off.
const GRACE = 3 * 24 * 60 * 60 * 1000;
const PAID = new Set(["active", "trialing", "past_due"]);

export const BILLING_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

export function billingConfig(env = process.env) {
  const { STRIPE_SECRET_KEY: secretKey, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_PRICE_MONTHLY: monthly, STRIPE_PRICE_YEARLY: yearly } = env;
  return secretKey && webhookSecret && monthly && yearly ? { secretKey, webhookSecret, prices: { monthly, yearly } } : null;
}

export function planActive(row, now = Date.now()) {
  return PAID.has(row?.planStatus) && now < Number(row.planUntil) + GRACE;
}

export function verifySignature(raw, header, secret, now = Date.now()) {
  const parts = String(header || "").split(",").map((part) => part.trim().split("="));
  const time = Number(parts.find(([key]) => key === "t")?.[1]);
  if (!time || Math.abs(now - time * 1000) > SIGNATURE_TOLERANCE) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex"));
  return parts.some(([key, value]) => {
    if (key !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// One subscription's plan. Newer Stripe API versions keep the period on the
// subscription's items. A failed renewal has already moved the period forward,
// so past_due only counts from the start of the unpaid period.
export function planFrom(subscription) {
  const period = subscription.items?.data?.[0] || subscription;
  const start = period.current_period_start ?? subscription.current_period_start;
  const end = period.current_period_end ?? subscription.current_period_end;
  if (!PAID.has(subscription.status)) return { status: subscription.status, until: 0 };
  return { status: subscription.status, until: Number(subscription.status === "past_due" ? start : end) * 1000 };
}

// The plan a customer has now: their paid subscription that lasts longest.
export function bestPlan(subscriptions) {
  const plans = subscriptions.map(planFrom).filter((plan) => PAID.has(plan.status)).sort((a, b) => b.until - a.until);
  return plans[0] || { status: "none", until: 0 };
}

export function createStripe({ secretKey, appUrl, prices, fetchImpl = fetch }) {
  async function call(path, { method = "GET", form, allowMissing = false } = {}) {
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${secretKey}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
        ...(form ? { body: new URLSearchParams(form).toString() } : {})
      });
    } catch {
      throw httpError(502, "Couldn't reach the payment service. Try again.");
    }
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw httpError(502, "The payment service couldn't do that. Try again.");
    return response.json();
  }

  const price = async (id) => {
    const { unit_amount: amount, currency } = await call(`/prices/${encodeURIComponent(id)}`);
    return { amount, currency };
  };

  return {
    createCustomer: async (email) => (await call("/customers", { method: "POST", form: { email } })).id,
    createCheckout: async (customer, interval) =>
      (await call("/checkout/sessions", {
        method: "POST",
        form: {
          mode: "subscription",
          customer,
          "line_items[0][price]": prices[interval],
          "line_items[0][quantity]": "1",
          success_url: `${appUrl}/#/settings?billing=success`,
          cancel_url: `${appUrl}/#/settings?billing=canceled`
        }
      })).url,
    createPortal: async (customer) => (await call("/billing_portal/sessions", { method: "POST", form: { customer, return_url: `${appUrl}/#/settings` } })).url,
    listSubscriptions: async (customer) => (await call(`/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`)).data,
    getPrices: async () => {
      const [monthly, yearly] = await Promise.all([price(prices.monthly), price(prices.yearly)]);
      return { monthly, yearly };
    },
    // Deleting a customer cancels their subscriptions right away.
    deleteCustomer: (customer) => call(`/customers/${encodeURIComponent(customer)}`, { method: "DELETE", allowMissing: true })
  };
}
