import { supabase } from "./supabaseClient";

/* ============================================================
   Razorpay Checkout, loaded on demand.
   ------------------------------------------------------------
   The checkout script is ~100 KB and only matters to the small number of
   visitors who reach the upgrade page, so it is injected on the first
   click rather than shipped in the bundle.

   Nothing here grants a membership. The success callback only tells us
   the customer got through the modal — the signed webhook is what
   actually sets the tier, so after a payment we poll the profile rather
   than assume.
   ============================================================ */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || "";

/** Is online payment configured at all? Buttons hide themselves when not. */
export const paymentsEnabled = !!RAZORPAY_KEY_ID;

let scriptPromise = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      // Let a later attempt retry: a blocked or flaky first load should not
      // permanently disable the only way to pay.
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Run the upgrade flow for `tier`.
 *
 * Resolves `{ status: "paid" | "dismissed" }`. "paid" means the customer
 * completed the Razorpay modal — NOT that the membership is live. Ask the
 * server for that; see waitForTier below.
 */
export async function startUpgrade({ tier, profile, user }) {
  if (!paymentsEnabled) throw new Error("Online payment isn't set up yet.");

  // The order — and, importantly, the amount — is created server-side.
  const { data, error } = await supabase.functions.invoke("razorpay-order", { body: { tier } });
  if (error) throw new Error("Couldn't start the payment. Please try again.");
  if (!data?.order_id) throw new Error(data?.error || "Couldn't start the payment.");

  await loadCheckout();

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: data.key_id || RAZORPAY_KEY_ID,
      order_id: data.order_id,
      amount: data.amount,
      currency: data.currency || "INR",
      name: "EduChess",
      description: data.description || `EduChess ${tier}`,
      prefill: {
        name: profile?.name || "",
        email: user?.email || "",
        contact: user?.phone ? `+${String(user.phone).replace(/^\+/, "")}` : "",
      },
      theme: { color: "#d4af37" },
      handler: () => resolve({ status: "paid" }),
      modal: {
        ondismiss: () => resolve({ status: "dismissed" }),
      },
    });
    checkout.on("payment.failed", (response) => {
      reject(new Error(response?.error?.description || "The payment didn't go through."));
    });
    checkout.open();
  });
}

/**
 * Poll until the membership shows up, or give up.
 *
 * Razorpay's webhook usually lands within a second or two, but it is an
 * independent network hop and the customer is staring at the screen. Polling
 * is how we tell "still processing" apart from "something went wrong", rather
 * than showing success the moment the modal closes.
 */
export async function waitForTier({ refreshProfile, expectedTier, attempts = 8, delayMs = 1500 }) {
  for (let i = 0; i < attempts; i++) {
    const fresh = await refreshProfile();
    if (fresh?.tier === expectedTier) return fresh;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
