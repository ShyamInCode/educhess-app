/*
  EduChess — Razorpay webhook. This is what actually grants a membership.

  The browser's checkout success callback grants nothing: it can be forged
  from a console, and it never fires if the customer closes the tab after
  paying. Razorpay's signed webhook is the only trustworthy statement that
  money changed hands, so activation lives here and nowhere else.

  Deploy (note the flag — Razorpay does not send a Supabase JWT, so the
  platform's own gate has to be off and this function does the checking):
    supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxx
    supabase functions deploy razorpay-webhook --no-verify-jwt
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Constant-time compare, so a wrong signature can't be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Razorpay signs the RAW request body. It has to be verified byte for byte,
 * before parsing — re-serialising the JSON would change the bytes and every
 * signature would fail.
 */
async function signatureMatches(rawBody: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return safeEqual(toHex(mac), signature.toLowerCase());
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[razorpay-webhook] missing configuration");
    return json({ error: "Not configured" }, 500);
  }

  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await req.text();
  if (!signature || !(await signatureMatches(rawBody, signature))) {
    console.error("[razorpay-webhook] signature mismatch");
    return json({ error: "Invalid signature" }, 401);
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string } };
      order?: { entity?: { id?: string } };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const name = event.event ?? "";
  // Both of these mean "the money is ours". Razorpay sends both for a single
  // payment, and record_razorpay_payment() is idempotent so the second is a
  // no-op rather than a second month.
  if (name !== "payment.captured" && name !== "order.paid") {
    return json({ ignored: name }, 200);
  }

  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id ?? "";
  const paymentId = payment?.id ?? "";
  if (!orderId) return json({ error: "No order id in payload" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("record_razorpay_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });

  if (error) {
    // Returning 5xx makes Razorpay retry, which is what we want for a
    // transient database problem. An unknown order is the exception: it will
    // never resolve, so it is logged and accepted to stop the retry storm.
    if (/UNKNOWN_ORDER/.test(error.message)) {
      console.error(`[razorpay-webhook] no payments row for order ${orderId}`);
      return json({ error: "Unknown order" }, 200);
    }
    console.error(`[razorpay-webhook] activation failed for ${orderId}: ${error.message}`);
    return json({ error: "Activation failed" }, 500);
  }

  return json({ activated: data === true, order_id: orderId }, 200);
});
