/*
  EduChess — create a Razorpay order for a membership upgrade.

  Called from the browser with the signed-in user's access token. Two things
  make this an Edge Function rather than browser code:

    1. Creating an order needs the Razorpay KEY SECRET, which can never ship
       in a JS bundle.
    2. The AMOUNT is decided here, from the tier. If the browser sent the
       amount, anyone could buy Academy for one rupee.

  Deploy:
    supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=xxx
    supabase functions deploy razorpay-order
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/*
  The price list. This MUST agree with src/lib/tiers.js — that file is what
  the customer sees, this is what they are charged, and a mismatch is a
  complaint rather than a bug report.
*/
const PRICES: Record<string, { amountPaise: number; label: string }> = {
  pro: { amountPaise: 199900, label: "EduChess Pro — 1 month" },
  academy: { amountPaise: 399900, label: "EduChess Academy — 1 month" },
};

/*
  SITE_URL is a comma-separated allow-list, not a single origin, because the
  same deployed function serves production AND whoever is running the dev
  server. Pinning it to one origin means local checkout fails CORS, which
  looks like a broken payment rather than a config choice. Empty falls back
  to "*" — fine here, since every route below re-checks the caller's token.

    supabase secrets set SITE_URL=https://educhess.in,http://localhost:5173
*/
const ALLOWED_ORIGINS = (Deno.env.get("SITE_URL") ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = (req.headers.get("Origin") ?? "").replace(/\/$/, "");
  const allow = !ALLOWED_ORIGINS.length
    ? "*"
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[razorpay-order] missing configuration");
    return json({ error: "Payments are not configured" }, 500);
  }

  // Who is asking? The token is verified by asking Supabase, not by trusting
  // any user id in the request body.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Sign in first" }, 401);

  const asUser = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: "Sign in first" }, 401);

  let payload: { tier?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const tier = String(payload?.tier ?? "");
  const price = PRICES[tier];
  if (!price) return json({ error: "Unknown plan" }, 400);

  // Razorpay's receipt field is capped at 40 characters.
  const receipt = `educhess_${tier}_${user.id.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 40);

  const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: price.amountPaise,
      currency: "INR",
      receipt,
      notes: { user_id: user.id, tier, product: price.label },
    }),
  });

  const orderBody = await orderRes.text();
  if (!orderRes.ok) {
    console.error(`[razorpay-order] Razorpay rejected the order: ${orderRes.status} ${orderBody}`);
    return json({ error: "Couldn't start the payment" }, 502);
  }

  const order = JSON.parse(orderBody) as { id: string; amount: number; currency: string };

  // Record it before returning. If this insert fails the webhook would have
  // no row to match later, and the customer would pay for nothing — so a
  // failure here has to abort the checkout, not be logged and ignored.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: insertError } = await admin.from("payments").insert({
    user_id: user.id,
    tier,
    months: 1,
    amount_paise: price.amountPaise,
    currency: order.currency,
    razorpay_order_id: order.id,
    status: "created",
  });
  if (insertError) {
    console.error(`[razorpay-order] couldn't record order ${order.id}: ${insertError.message}`);
    return json({ error: "Couldn't start the payment" }, 500);
  }

  return json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: RAZORPAY_KEY_ID,
    description: price.label,
  });
});
