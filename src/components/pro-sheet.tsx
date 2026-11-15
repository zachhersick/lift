// Lift Pro: what it includes, Stripe's current prices, and the way to Stripe
// Checkout. Web only: the iOS app never shows this (see sync.billing).
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Row, Section, Sheet } from "./kit";
import { api, postJson } from "@/lib/api.js";
import { PRO_FEATURES } from "@/lib/model.js";
import { notify } from "@/lib/notify";

type Price = { amount: number; currency: string };

const money = ({ amount, currency }: Price) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);

// Sends you to a Stripe page: Checkout or the Customer Portal.
export async function openBilling(path: string, body = {}) {
  try {
    const response = await postJson(path, body);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error);
    location.href = data.url;
  } catch (error: any) {
    notify(error.message || "That didn't work. Try again.", { status: "error" });
  }
}

export function ProSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prices, setPrices] = useState<{ monthly: Price; yearly: Price } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || prices) return;
    setFailed(false);
    api("/api/billing/prices", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok) throw new Error();
        setPrices(data.prices);
      })
      .catch(() => setFailed(true));
  }, [open]);

  const buy = async (interval: string) => {
    setBusy(true);
    await openBilling("/api/billing/checkout", { interval });
    setBusy(false);
  };

  return (
    <Sheet onClose={onClose} open={open} title="Lift Pro">
      <div className="flex flex-col gap-5 px-4 pt-2 pb-6">
        <Section title="Included">
          <Card className="divide-y divide-border">
            {PRO_FEATURES.map((feature: any) => (
              <div className="flex gap-3 p-4" key={feature.title}>
                <Check className="mt-0.5 size-[18px] shrink-0 text-primary" strokeWidth={1.75} />
                <div className="min-w-0">
                  <div className="text-[16px] font-medium">{feature.title}</div>
                  <p className="text-[14px] text-muted-foreground">{feature.detail}</p>
                </div>
              </div>
            ))}
          </Card>
        </Section>
        <Section
          footer={
            <>
              Renews automatically until you cancel. Cancel anytime from Settings, and Pro lasts until the end of the period you paid for. See the <a className="underline" href="/terms.html">Terms</a> and <a className="underline" href="/privacy.html">Privacy Policy</a>.
            </>
          }
          title="Choose a plan"
        >
          <Card className="divide-y divide-border">
            {failed ? (
              <Row subtitle="Check your connection and try again." title="Prices didn't load" />
            ) : prices ? (
              <>
                <Row disabled={busy} onClick={() => buy("monthly")} title="Monthly" value={`${money(prices.monthly)} / month`} />
                <Row disabled={busy} onClick={() => buy("yearly")} title="Yearly" value={`${money(prices.yearly)} / year`} />
              </>
            ) : (
              <Row title="Loading prices…" />
            )}
          </Card>
        </Section>
      </div>
    </Sheet>
  );
}
