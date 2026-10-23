"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { confirmPaymentAction, placeOrderAction, previewDiscountAction, type CheckoutState } from "@/app/(store)/checkout/actions";
import { Plate } from "@/components/brand/plate";
import { formatMobile, INDIAN_STATES } from "@/lib/india";
import { formatINR } from "@/lib/money";
import type { Bag } from "@/modules/bag/types";
import type { OrderTotals } from "@/modules/checkout/pricing";
import type { CheckoutSession } from "@/modules/payments/service";
import { useBag } from "./bag/bag-context";
import { openRazorpay } from "./razorpay-window";

const empty: CheckoutState = { errors: {} };

/** A signed-in customer: their details fill the form in, and their saved addresses are offered. */
export type CheckoutAccount = {
  name: string;
  email: string;
  phone: string | null;
  /** Room for one more saved address. */
  canSave: boolean;
  addresses: { id: string; recipientName: string; phone: string; lines: string; place: string; isDefault: boolean }[];
};

type Method = "online" | "cod";
type Paying =
  | { phase: "idle" }
  | { phase: "window"; session: CheckoutSession & { orderPath: string } }
  | { phase: "confirming" }
  | { phase: "dismissed"; session: CheckoutSession & { orderPath: string }; lastError: string | null }
  | { phase: "error"; message: string; orderPath: string };

/**
 * One calm page: who you are, where it goes, how you'll pay, and the bag
 * beside it. Totals shown here are for reading only; the server prices the
 * order again from the database when it's placed.
 *
 * Online: placing the order holds the pieces and opens Razorpay's window.
 * Paid → the order page. Closed → "Pay now" again while the hold lasts.
 */
export function CheckoutForm({
  bag,
  totals,
  online,
  codEnabled,
  overCodLimit,
  holdMinutes,
  idempotencyKey,
  account = null,
}: {
  bag: Bag;
  totals: Record<Method, OrderTotals>;
  /** Null when online payment isn't set up. */
  online: { testMode: boolean } | null;
  codEnabled: boolean;
  overCodLimit: boolean;
  holdMinutes: number;
  idempotencyKey: string;
  account?: CheckoutAccount | null;
}) {
  const [state, action, pending] = useActionState(placeOrderAction, empty);
  const router = useRouter();
  const { open: openBag, bag: liveBag } = useBag();
  const form = useRef<HTMLFormElement>(null);
  const [method, setMethod] = useState<Method>((state.values?.payment as Method | undefined) ?? (online ? "online" : "cod"));
  const [paying, setPaying] = useState<Paying>({ phase: "idle" });
  // What they typed last time, else what the account knows.
  const filled: Record<string, string> = { name: account?.name ?? "", phone: account?.phone ?? "", email: account?.email ?? "" };
  const v = (k: string) => state.values?.[k] ?? filled[k] ?? "";
  const saved = account?.addresses ?? [];
  const [where, setWhere] = useState<string>(() => state.values?.savedAddress ?? (saved.find((a) => a.isDefault) ?? saved[0])?.id ?? "new");
  const e = (k: string) => state.errors[k];
  const errorCount = Object.keys(state.errors).filter((k) => k !== "discountCode").length;
  const [discount, setDiscount] = useState<Applied | null>(null);
  const shown = discount?.totals ?? totals;
  const total = shown[method];
  const overLimit = discount ? discount.overCodLimit : overCodLimit;

  // The code stopped being valid while they filled in the form: take it off and say why.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.discountRejected) setDiscount(null);
  }, [state]);

  // Take the buyer to the first thing to fix.
  useEffect(() => {
    if (!errorCount) return;
    form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state, errorCount]);

  // Something sold while they were here: show the bag as it now stands.
  useEffect(() => {
    if (state.bagChanged) router.refresh();
  }, [state, router]);

  // The bag was changed in the drawer, on this page: price it again. A code
  // applied to the old bag comes off, since its totals no longer hold.
  const liveKey = `${liveBag.count}:${liveBag.subtotalMinor}`;
  const lastLive = useRef<string | null>(null);
  useEffect(() => {
    const before = lastLive.current;
    lastLive.current = liveKey;
    if (before === null || before === liveKey || liveKey === `${bag.count}:${bag.subtotalMinor}`) return;
    setDiscount(null);
    router.refresh();
  }, [liveKey, bag.count, bag.subtotalMinor, router]);

  // The order is placed and waiting: open Razorpay's window.
  useEffect(() => {
    // A new reply from the server starts the payment window once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.payment) setPaying({ phase: "window", session: state.payment });
  }, [state]);

  useEffect(() => {
    if (paying.phase !== "window") return;
    const session = paying.session;
    let live = true;
    openRazorpay(session)
      .then(async (result) => {
        if (!live) return;
        if (result.kind === "dismissed") {
          setPaying({ phase: "dismissed", session, lastError: result.lastError });
          return;
        }
        setPaying({ phase: "confirming" });
        const confirmed = await confirmPaymentAction(result.reply);
        if ("path" in confirmed) router.push(confirmed.path);
        else setPaying({ phase: "error", message: confirmed.error, orderPath: session.orderPath });
      })
      .catch(() => {
        if (live) setPaying({ phase: "dismissed", session, lastError: "The payment window couldn't open. Check your connection and try again." });
      });
    return () => {
      live = false;
    };
  }, [paying, router]);

  const methodBlocked = method === "cod" ? !codEnabled || overLimit : !online;
  const busy = pending || paying.phase === "window" || paying.phase === "confirming";
  const blocked = methodBlocked || bag.hasProblems;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-8 md:pt-10">
      <h1 className="text-5xl italic md:text-6xl">Checkout</h1>

      {/* Phones: the summary folds away above the form. */}
      <details className="group mt-6 border-y border-taupe/40 md:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm [&::-webkit-details-marker]:hidden">
          <span>
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span> your bag ({bag.count})
          </span>
          <span className="font-display text-lg tabular-nums">{formatINR(total.totalMinor)}</span>
        </summary>
        <div className="pb-6">
          <Summary bag={bag} totals={total} code={discount?.code ?? null} />
        </div>
      </details>

      <div className="mt-8 grid gap-12 md:mt-12 md:grid-cols-12 md:gap-8">
        <form ref={form} action={action} noValidate className="space-y-12 md:col-span-7">
          <input type="hidden" name="key" value={idempotencyKey} />

          {errorCount ? (
            <p role="alert" className="border-l-2 border-burgundy bg-champagne px-4 py-3 text-sm">
              {errorCount === 1 ? "One thing to fix below." : `${errorCount} things to fix below.`}
            </p>
          ) : null}

          <Step n={1} title="You">
            <Field label="Full name" name="name" autoComplete="name" defaultValue={v("name")} error={e("name")} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Mobile"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="98123 45678"
                defaultValue={v("phone")}
                error={e("phone")}
                hint="For the courier, and in case we need to reach you about your order."
              />
              <Field
                label="Email (optional)"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={v("email")}
                error={e("email")}
                hint="For your receipt."
              />
            </div>
          </Step>

          <Step n={2} title="Where it goes">
            {saved.length ? (
              <div className="space-y-3" role="radiogroup" aria-label="Your saved addresses">
                {saved.map((a) => (
                  <label key={a.id} className="choice-card">
                    <input type="radio" name="savedAddress" value={a.id} checked={where === a.id} onChange={() => setWhere(a.id)} className="mt-1 accent-burgundy" />
                    <span className="min-w-0 text-sm leading-relaxed">
                      <span className="block font-medium">{a.recipientName}</span>
                      <span className="block text-espresso-soft">{a.lines}</span>
                      <span className="block text-espresso-soft">{a.place}</span>
                      <span className="block tabular-nums text-espresso-soft">{formatMobile(a.phone)}</span>
                    </span>
                  </label>
                ))}
                <label className="choice-card">
                  <input type="radio" name="savedAddress" value="new" checked={where === "new"} onChange={() => setWhere("new")} className="mt-1 accent-burgundy" />
                  <span className="text-sm font-medium">Somewhere else</span>
                </label>
                {e("savedAddress") ? <p className="text-xs text-burgundy">{e("savedAddress")}</p> : null}
              </div>
            ) : null}
            {where === "new" ? (
              <div className={saved.length ? "fade-in space-y-5 pt-2" : "space-y-5"}>
                <Field label="House or flat, street" name="line1" autoComplete="address-line1" defaultValue={v("line1")} error={e("line1")} />
                <Field label="Area or locality (optional)" name="line2" autoComplete="address-line2" defaultValue={v("line2")} error={e("line2")} />
                <Field label="Landmark (optional)" name="landmark" defaultValue={v("landmark")} error={e("landmark")} hint="Helps the courier find you." />
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Pincode" name="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} defaultValue={v("pincode")} error={e("pincode")} />
                  <Field label="Town or city" name="city" autoComplete="address-level2" defaultValue={v("city")} error={e("city")} />
                  <label className="block">
                    <span className="text-sm">State</span>
                    <select
                      name="state"
                      autoComplete="address-level1"
                      defaultValue={v("state")}
                      aria-invalid={e("state") ? true : undefined}
                      className="field mt-1.5"
                    >
                      <option value="" disabled>
                        Choose
                      </option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {e("state") ? <span className="mt-1 block text-xs text-burgundy">{e("state")}</span> : null}
                  </label>
                </div>
                {account?.canSave ? (
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" name="saveAddress" defaultChecked={state.values ? state.values.saveAddress === "on" : true} className="size-4 accent-burgundy" />
                    Save it to your account for next time
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-espresso-soft">
                The courier asks for the name on the address.{" "}
                <Link href="/account/addresses" className="link">
                  Change your addresses
                </Link>
              </p>
            )}
          </Step>

          <Step n={3} title="How you'll pay">
            <div className="space-y-3" role="radiogroup" aria-label="How you'll pay">
              {online ? (
                <label className="choice-card">
                  <input type="radio" name="payment" value="online" checked={method === "online"} onChange={() => setMethod("online")} className="mt-1 accent-burgundy" />
                  <span>
                    <span className="font-medium">Pay now</span>
                    <span className="mt-1 block text-sm text-espresso-soft">UPI, cards or netbanking, through Razorpay. Your pieces are held while you pay.</span>
                    {online.testMode ? (
                      <span className="mt-2 inline-block bg-sand px-2 py-0.5 text-xs text-espresso">Test mode: no real money moves</span>
                    ) : null}
                  </span>
                </label>
              ) : null}
              {codEnabled ? (
                <label className="choice-card">
                  <input type="radio" name="payment" value="cod" checked={method === "cod"} onChange={() => setMethod("cod")} className="mt-1 accent-burgundy" />
                  <span>
                    <span className="font-medium">
                      Cash on delivery
                      {shown.cod.codFeeMinor ? <span className="font-normal text-espresso-soft"> · {formatINR(shown.cod.codFeeMinor)} extra</span> : null}
                    </span>
                    <span className="mt-1 block text-sm text-espresso-soft">
                      Pay in cash or by UPI to the courier when it arrives.
                    </span>
                  </span>
                </label>
              ) : null}
              {!online && !codEnabled ? <p className="text-sm text-espresso-soft">Checkout is paused for a moment. Please message us to order.</p> : null}
            </div>
            <input type="hidden" name="discountCode" value={discount?.code ?? ""} />
            <DiscountField
              applied={discount}
              rejected={e("discountCode") ?? null}
              onApply={setDiscount}
              phone={() => form.current?.querySelector<HTMLInputElement>("[name=phone]")?.value ?? ""}
            />
            <TextAreaField label="A note for us (optional)" name="note" defaultValue={v("note")} error={e("note")} hint="A gift, a delivery time, anything." />
          </Step>

          <div className="border-t border-taupe/40 pt-8">
            {state.message ? (
              <p role="alert" className="mb-5 border-l-2 border-burgundy bg-champagne px-4 py-3 text-sm">
                {state.message}
                {state.bagChanged ? (
                  <>
                    {" "}
                    <button type="button" className="link" onClick={openBag}>
                      Open your bag
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            {method === "cod" && overLimit ? (
              <p className="mb-5 text-sm text-espresso-soft">
                This order is over our cash-on-delivery limit.{online ? " Please pay now instead." : " Please message us and we'll arrange it."}
              </p>
            ) : null}
            {bag.hasProblems ? (
              <p className="mb-5 text-sm text-burgundy">
                Something in your bag has sold since you added it.{" "}
                <button type="button" className="link" onClick={openBag}>
                  Open your bag
                </button>
              </p>
            ) : null}

            {paying.phase === "dismissed" ? (
              <PaymentPaused
                lastError={paying.lastError}
                holdMinutes={holdMinutes}
                total={paying.session.amountMinor}
                onRetry={() => setPaying({ phase: "window", session: paying.session })}
                orderPath={paying.session.orderPath}
              />
            ) : paying.phase === "error" ? (
              <p role="alert" className="border-l-2 border-burgundy bg-champagne px-4 py-3 text-sm">
                {paying.message}{" "}
                <Link href={paying.orderPath} className="link">
                  See your order
                </Link>
              </p>
            ) : (
              <>
                <button type="submit" className="btn-primary w-full text-base" disabled={busy || blocked}>
                  {paying.phase === "confirming"
                    ? "Confirming your payment…"
                    : busy
                      ? method === "online"
                        ? "Opening payment…"
                        : "Placing your order…"
                      : method === "online"
                        ? `Pay ${formatINR(total.totalMinor)}`
                        : `Place order · ${formatINR(total.totalMinor)}`}
                </button>
                <p className="mt-3 text-center text-xs text-espresso-soft">
                  {method === "online"
                    ? "You'll pay in Razorpay's secure window. We never see your card or UPI details."
                    : `Nothing is paid now. You pay ${formatINR(total.totalMinor)} when it arrives.`}
                </p>
              </>
            )}
          </div>
        </form>

        <aside className="hidden md:col-span-4 md:col-start-9 md:block" aria-label="Your bag">
          <div className="sticky top-8">
            <p className="caption text-xl">Your bag</p>
            <div className="mt-4">
              <Summary bag={bag} totals={total} code={discount?.code ?? null} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PaymentPaused({
  lastError,
  holdMinutes,
  total,
  onRetry,
  orderPath,
}: {
  lastError: string | null;
  holdMinutes: number;
  total: number;
  onRetry: () => void;
  orderPath: string;
}) {
  return (
    <div role="status" className="space-y-4 bg-champagne p-5">
      <p className="text-sm">
        <span className="font-medium">{lastError ? "The payment didn't go through." : "Payment not finished."}</span>{" "}
        {lastError ? `${lastError} ` : ""}
        Your pieces are held for about {holdMinutes} minutes. Nothing has been charged.
      </p>
      <button type="button" className="btn-primary w-full" onClick={onRetry}>
        Pay {formatINR(total)}
      </button>
      <p className="text-center text-xs text-espresso-soft">
        Or come back to it from{" "}
        <Link href={orderPath} className="link">
          your order page
        </Link>
        .
      </p>
    </div>
  );
}

type Applied = { code: string; label: string; totals: Record<Method, OrderTotals>; overCodLimit: boolean };

/** "Have a code?" → a field and Apply; once applied, the code and Remove. */
function DiscountField({
  applied,
  rejected,
  onApply,
  phone,
}: {
  applied: Applied | null;
  rejected: string | null;
  onApply: (a: Applied | null) => void;
  phone: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (applied) {
    return (
      <p className="fade-in flex items-baseline justify-between gap-4 border border-dashed border-olive/60 bg-champagne/40 px-4 py-3 text-sm">
        <span>
          <span className="font-medium tracking-wide">{applied.code}</span> <span className="text-olive">· {applied.label}</span>
        </span>
        <button type="button" className="link text-xs" onClick={() => onApply(null)}>
          Remove
        </button>
      </p>
    );
  }
  if (!open && !rejected) {
    return (
      <button type="button" className="link-draw text-sm" onClick={() => setOpen(true)}>
        Have a code?
      </button>
    );
  }
  const apply = () =>
    start(async () => {
      const r = await previewDiscountAction(code, phone());
      if (r.ok) {
        setMessage(null);
        onApply({ code: r.code, label: r.label, totals: r.totals, overCodLimit: r.overCodLimit });
      } else setMessage(r.message);
    });
  return (
    <div className="fade-in">
      <label className="block text-sm" htmlFor="discount-input">
        Discount code
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="discount-input"
          value={code}
          onChange={(ev) => setCode(ev.target.value.toUpperCase())}
          onKeyDown={(ev) => {
            // Enter applies the code rather than placing the order.
            if (ev.key === "Enter") {
              ev.preventDefault();
              apply();
            }
          }}
          autoComplete="off"
          className="field min-w-0 flex-1 uppercase tracking-wide"
          aria-invalid={message || rejected ? true : undefined}
        />
        <button type="button" className="btn-outline shrink-0" disabled={pending || !code.trim()} onClick={apply}>
          {pending ? "…" : "Apply"}
        </button>
      </div>
      {message || rejected ? (
        <p role="alert" className="mt-1 text-xs text-burgundy">
          {message ?? rejected}
        </p>
      ) : null}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="flex items-baseline gap-3">
        <span className="folio not-italic tabular-nums">{String(n).padStart(2, "0")}</span>
        <span className="font-display text-3xl">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

type Extra = { label: string; error?: string; hint?: string };

function Field({ label, error, hint, ...input }: Extra & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input {...input} aria-invalid={error ? true : undefined} className="field mt-1.5" />
      {error ? <span className="mt-1 block text-xs text-burgundy">{error}</span> : hint ? <span className="mt-1 block text-xs text-espresso-soft">{hint}</span> : null}
    </label>
  );
}

function TextAreaField({ label, error, hint, ...input }: Extra & ComponentProps<"textarea">) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <textarea {...input} rows={3} maxLength={500} aria-invalid={error ? true : undefined} className="field mt-1.5 leading-relaxed" />
      {error ? <span className="mt-1 block text-xs text-burgundy">{error}</span> : hint ? <span className="mt-1 block text-xs text-espresso-soft">{hint}</span> : null}
    </label>
  );
}

function Summary({ bag, totals, code }: { bag: Bag; totals: OrderTotals; code: string | null }) {
  return (
    <div>
      <ul className="space-y-4">
        {bag.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-4">
            <div className="relative w-14 shrink-0">
              <Plate src={l.imageUrl} alt={l.imageAlt} tone={l.colourHex ?? l.tone} pieceNumber={l.pieceNumber} category={l.categorySlug} sizes="56px" />
              {l.quantity > 1 ? (
                <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-espresso text-[0.7rem] text-ivory tabular-nums">{l.quantity}</span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg italic leading-tight">{l.pieceName ?? l.name}</p>
              <p className="text-xs text-espresso-soft">{[l.colour, l.size].filter(Boolean).join(" · ")}</p>
            </div>
            <span className="text-sm tabular-nums">{formatINR(l.priceMinor * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-6 space-y-2 border-t border-taupe/40 pt-4 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatINR(totals.subtotalMinor)}</dd>
        </div>
        {totals.discountMinor ? (
          <div className="flex justify-between text-olive">
            <dt>Discount{code ? ` (${code})` : ""}</dt>
            <dd>−{formatINR(totals.discountMinor)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt>Shipping</dt>
          <dd>{totals.shippingMinor ? formatINR(totals.shippingMinor) : "Free"}</dd>
        </div>
        {totals.codFeeMinor ? (
          <div className="flex justify-between">
            <dt>Cash on delivery</dt>
            <dd>{formatINR(totals.codFeeMinor)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between border-t border-taupe/40 pt-3">
          <dt>Total</dt>
          <dd className="font-display text-2xl">{formatINR(totals.totalMinor)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-espresso-soft">Inclusive of all taxes.</p>
    </div>
  );
}
