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

   The default is `email,google`. Email/password is on because the app is
   expected to offer it; Google stays because accounts already exist that
   signed up with it, and dropping the provider would lock those people out
   of an account they can still see is theirs.

   The SMTP caveat above is real and unchanged — configure custom SMTP before
   real signup traffic. Auth emails now use Supabase's DEFAULT templates; the
   branded ones went with the rest of the server side and are archived under
   docs/archive/auth-email-templates/ if you want them back in the dashboard.
   ============================================================ */

const VALID = ["google", "email", "phone"];
const DEFAULT_METHODS = ["email", "google"];

function parse(raw) {
  const requested = String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID.includes(s));
  // A typo in the env var must not lock everyone out of their own site.
  return requested.length ? requested : DEFAULT_METHODS;
}

export const AUTH_METHODS = parse(
  import.meta.env.VITE_AUTH_METHODS ?? DEFAULT_METHODS.join(",")
);

export const googleEnabled = AUTH_METHODS.includes("google");
export const emailEnabled = AUTH_METHODS.includes("email");
export const phoneEnabled = AUTH_METHODS.includes("phone");

/** The tabbed methods, in display order. Google is a button, not a tab. */
export const TAB_METHODS = ["email", "phone"].filter((m) => AUTH_METHODS.includes(m));
