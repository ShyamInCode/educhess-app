/* ============================================================
   Which sign-in methods the app offers.
   ------------------------------------------------------------
   Read from VITE_AUTH_METHODS so email and phone can be switched on later
   without a code change — the flows themselves are built and tested, they
   are simply not affordable to run yet:

     * email/password needs custom SMTP. Supabase's built-in sender is
       throttled to a handful of messages an hour and is explicitly not for
       production, so sign-up confirmations and password resets would be
       dropped for most people.
     * phone OTP needs a paid SMS provider, plus TRAI DLT sender
       registration before anything delivers reliably in India.
     * Google OAuth needs neither. It is included in Supabase's free plan
       and sends no email through Supabase at all, because the address
       arrives already verified.

   Hence the default of `google` alone.
   ============================================================ */

const VALID = ["google", "email", "phone"];

function parse(raw) {
  const requested = String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID.includes(s));
  // A typo in the env var must not lock everyone out of their own site.
  return requested.length ? requested : ["google"];
}

export const AUTH_METHODS = parse(import.meta.env.VITE_AUTH_METHODS ?? "google");

export const googleEnabled = AUTH_METHODS.includes("google");
export const emailEnabled = AUTH_METHODS.includes("email");
export const phoneEnabled = AUTH_METHODS.includes("phone");

/** The tabbed methods, in display order. Google is a button, not a tab. */
export const TAB_METHODS = ["email", "phone"].filter((m) => AUTH_METHODS.includes(m));
