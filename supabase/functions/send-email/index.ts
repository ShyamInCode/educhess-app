/*
  EduChess — transactional email sender.

  Triggered by Supabase Database Webhooks (INSERT on three tables) and relays
  a branded email through Resend. This exists instead of the FastAPI service in
  `backend/` because that service is written but not deployed, and confirmation
  emails should not wait on a deployment story.

  Deploy:
    supabase secrets set RESEND_API_KEY=re_xxx
    supabase functions deploy send-email
  See README.md in this folder for the webhook wiring.
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  contactAcknowledgement,
  tournamentRegistration,
  workshopRegistration,
  type Built,
} from "./templates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "EduChess <noreply@educhess.in>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Database Webhooks are configured with a fixed Authorization header. By
// default that is the service-role key (what the Supabase dashboard pre-fills);
// set WEBHOOK_SECRET if you would rather not put the key in the webhook config.
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? SERVICE_ROLE_KEY;

/** Length-independent-ish comparison, so a wrong token can't be timed out byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(req: Request): boolean {
  // No secret configured means anyone who finds the URL can make us send mail.
  // Fail closed rather than silently accepting everything.
  if (!WEBHOOK_SECRET) return false;
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  return safeEqual(token, WEBHOOK_SECRET);
}

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

/**
 * A registration row carries only the event's FK, so the details a parent
 * actually needs (date, venue, fee) have to be read back here. Uses the
 * service-role client: an unpublished or full event still has to send its
 * confirmation, and RLS would hide the row from an anon read.
 */
async function fetchParent(table: string, id: unknown): Promise<Record<string, unknown> | null> {
  if (!admin || id === null || id === undefined) return null;
  const { data, error } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[send-email] could not load ${table}#${id}: ${error.message}`);
    return null;
  }
  return data ?? null;
}

/** Map a webhook payload to a rendered email, or null if we don't send for it. */
async function build(table: string, record: Record<string, any>): Promise<{ to: string; mail: Built } | null> {
  switch (table) {
    case "tournament_registrations": {
      if (!record.parent_email) return null;
      const tournament = await fetchParent("tournaments", record.tournament_id);
      return { to: record.parent_email, mail: tournamentRegistration(record, tournament) };
    }
    case "workshop_registrations": {
      if (!record.parent_email) return null;
      const workshop = await fetchParent("workshops", record.workshop_id);
      return { to: record.parent_email, mail: workshopRegistration(record, workshop) };
    }
    case "contact_submissions": {
      if (!record.email) return null;
      return { to: record.email, mail: contactAcknowledgement(record) };
    }
    default:
      return null;
  }
}

async function sendViaResend(to: string, mail: Built): Promise<Response> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  return res;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    console.error("[send-email] RESEND_API_KEY is not set");
    return new Response(JSON.stringify({ error: "Email is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { type?: string; table?: string; record?: Record<string, any> };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const table = payload?.table ?? "";
  const record = payload?.record ?? null;
  if (!table || !record) {
    return new Response(JSON.stringify({ error: "Missing table or record" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const built = await build(table, record);
  if (!built) {
    // Not an error: a webhook may fire for a row with no address to write to.
    // 200 so Supabase doesn't retry something that will never succeed.
    return new Response(JSON.stringify({ skipped: true, table }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await sendViaResend(built.to, built.mail);
  const body = await res.text();
  if (!res.ok) {
    console.error(`[send-email] Resend rejected ${table} mail: ${res.status} ${body}`);
    return new Response(JSON.stringify({ error: "Send failed", status: res.status }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true, table }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
