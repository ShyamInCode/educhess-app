# EduChess — Deployment

Everything needed to put this online, in the order it has to happen. Skipping
around causes the two classic failures: Google sign-in redirecting to
`localhost` from production, and a payment that succeeds while the plan never
activates.

The app is a static SPA plus Supabase. Three things deploy separately:

| Piece | Where | How |
|---|---|---|
| Frontend | Vercel / Netlify / Cloudflare Pages | git push, or `vercel --prod` |
| Edge Functions | Supabase | `supabase functions deploy` |
| Database | Supabase | SQL editor, by hand |

---

## 0. Before the first deploy

- [ ] **Rotate any credential that has ever been committed.** Check the repo
      history for OAuth client secrets and API keys before making it public.
- [ ] Decide the production domain. Everything below refers to it as
      `https://educhess.in` — substitute yours, with no trailing slash.
- [ ] Confirm every migration in §5 has been run against the production
      Supabase project.

---

## 1. Environment variables — frontend

Set these in the host's dashboard (Vercel → Project → Settings → Environment
Variables), for **Production** and **Preview**.

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | the anon public key | Public by design; RLS is the protection |
| `VITE_AUTH_METHODS` | `google` | Add `email` only after custom SMTP; `phone` only after an SMS provider + TRAI DLT |
| `VITE_RAZORPAY_KEY_ID` | `rzp_live_...` | Publishable half only. Blank hides the pay buttons and falls back to a contact link |
| `VITE_API_URL` | *(leave empty)* | The FastAPI service is not deployed and nothing imports it |

> **`VITE_` variables are compiled into the bundle at build time.** Changing
> one in the dashboard does nothing until you **redeploy**. If you switch
> Razorpay from test to live and the old key is still being used, this is why.

Never put a key *secret* here. Anything `VITE_`-prefixed is readable by every
visitor.

---

## 2. Environment variables — Supabase Edge Functions

These are server-side secrets. They never touch the bundle.

```bash
supabase link --project-ref <your-project-ref>

# Transactional email
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set EMAIL_FROM="EduChess <noreply@educhess.in>"

# Razorpay
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=xxxxxxxxxxxx
supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx

# Shared: email logo/links, and the CORS allow-list for razorpay-order.
# Comma-separated. Include localhost or local checkout fails CORS.
supabase secrets set SITE_URL=https://educhess.in,http://localhost:5173
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them yourself.

`WEBHOOK_SECRET` (used by `send-email`) is optional and defaults to the
service-role key, which is what the Database Webhook UI pre-fills. Set it only
if you would rather not put that key in the webhook config — and if you do,
`send-email` then needs `--no-verify-jwt` as well, because a non-JWT bearer
fails the platform's own gate before the function runs.

**`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are different values.**
Using one for the other fails every signature check, silently.

---

## 3. Deploy the Edge Functions

```bash
supabase functions deploy send-email
supabase functions deploy razorpay-order
supabase functions deploy razorpay-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook is not optional. Razorpay does not send a
Supabase JWT, so the platform gate would reject it before the code runs. The
function verifies Razorpay's own HMAC instead.

---

## 4. Supabase dashboard configuration

**Authentication → URL Configuration**

- Site URL: `https://educhess.in`
- Redirect URLs: add `https://educhess.in/**` and, for local work,
  `http://localhost:5173/**`

Get this wrong and Google sign-in completes, then bounces the user to
`localhost`. It is the most common production auth failure.

**Authentication → Providers → Google**

- Enabled, with the client ID and client secret from Google Cloud.

**Authentication → Emails → Templates**

- Paste `emails/auth/confirm-signup.html` into *Confirm signup*
- Paste `emails/auth/reset-password.html` into *Reset password*

(Only reachable if you enable email sign-in. Harmless to set up in advance.)

**Database → Webhooks** — three hooks, all `INSERT`, HTTP POST to
`https://<ref>.functions.supabase.co/send-email`, header
`Authorization: Bearer <service-role key>`:

- `tournament_registrations`
- `workshop_registrations`
- `contact_submissions`

---

## 5. Migrations

Run in the SQL editor, in this order. All are safe to re-run.

Already applied to the live project:

1. `schema.sql`
2. `migration_admin_videos.sql`
3. `migration_chapters.sql`, `migration_chapter_delete.sql`
4. `migration_carousel.sql`, `migration_testimonials_gallery.sql`
5. `migration_contact_admin_view.sql`
6. `migration_lichess_puzzles.sql`, `migration_lichess_puzzles_rpc_v2.sql`
7. `migration_tournaments.sql`
8. `migration_security_fixes.sql`

The feature work, in order:

9. `migration_phase1_auth_methods.sql`
10. `migration_phase3_puzzle_attempts.sql`
11. `migration_phase4_workshops.sql`
12. `migration_phase5_admin_update_policies.sql`
13. `migration_phase5_capacity_enforcement.sql`
14. `migration_phase8_tiers.sql`
15. `migration_phase11_payments.sql`

> The ordering of items 1–8 is reconstructed from filenames and their stated
> prerequisites, not from a migration ledger — this project has never had one.
> For a rebuild from scratch, read each file's header comment first; several
> say explicitly what they must run after. Items 9–15 are exact.

`migration_puzzles.sql` and `migration_puzzles_v2.sql` are the retired
hand-generated puzzle set. Not needed; the app reads `lichess_puzzles`.

---

## 6. Google Cloud Console

APIs & Services → Credentials → your OAuth 2.0 Web client:

- **Authorized JavaScript origins:** `https://educhess.in`,
  `http://localhost:5173`
- **Authorized redirect URIs:** `https://<ref>.supabase.co/auth/v1/callback`

The redirect URI is Supabase's callback, not your site. Only the origins list
changes when you add a domain.

---

## 7. Razorpay

Live mode is gated on KYC approval and on these pages existing at reachable
URLs: Terms & Conditions, Privacy Policy, Refund/Cancellation Policy, Contact,
and a pricing page.

**As of this writing the site has Contact (`/contact`) and pricing
(`/upgrade`). Terms, Privacy and Refund do not exist and will block
activation.** The privacy policy is also the DPDP obligation — recording
`profiles.consent_at` proves consent was given, not that anyone was told what
happens to the data.

Then:

1. Generate **live** API keys → `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
2. Create a **new** webhook in Live mode (test and live webhooks are separate
   objects with separate secrets — this is the usual reason a live payment
   succeeds and the plan never activates):
   - URL `https://<ref>.functions.supabase.co/razorpay-webhook`
   - Events: `payment.captured`, `order.paid`
   - Secret → `RAZORPAY_WEBHOOK_SECRET`
3. Put the live publishable key in `VITE_RAZORPAY_KEY_ID` and **redeploy the
   frontend**.

Full detail and the test-mode walkthrough: `supabase/functions/RAZORPAY.md`.

---

## 8. Frontend host

The repo carries SPA fallback config for every common host, so a hard refresh
on `/courses/chess` serves `index.html` instead of a 404:

- `vercel.json` — Vercel
- `public/_redirects` — Netlify, Cloudflare Pages

Build settings: build command `npm run build`, output directory `dist`, Node 18
or newer.

**Vercel:** import the GitHub repo, add the §1 variables, deploy. Every push to
the default branch redeploys.

---

## 9. Post-deploy smoke test

Do these against production, in order. Each one fails in a distinct place.

- [ ] Home page loads; hard-refresh `/courses/chess` and confirm no 404 (SPA
      fallback).
- [ ] Sign in with Google. You land back on **your** domain, not localhost,
      and the nav shows your name.
- [ ] The "Complete your profile" dialog appears once, saves, and stays gone.
- [ ] `/puzzles` prompts sign-in when signed out; solve one signed in and watch
      the counter go 5 → 4.
- [ ] Exhaust a Free account's five puzzles: the upgrade card appears, and a
      sixth batch is refused by the server, not just hidden.
- [ ] `/upgrade` and `/about` both show Get Pro / Get Academy at the right
      prices.
- [ ] Buy Academy for real. `payments.status` becomes `paid`, `profiles.tier`
      becomes `academy`, expiry is a month out. Refund it from the Razorpay
      dashboard afterwards.
- [ ] Replay that webhook from the Razorpay dashboard: the response says
      `activated: false` and the expiry does not move.
- [ ] Submit the contact form → the acknowledgement email arrives.
- [ ] Register for a tournament → the confirmation email arrives.
- [ ] Admin panel loads for an admin account; the Members tab lists people.
- [ ] Course chapters show a padlock for a Free account.

If a step fails: `supabase functions logs <name>` for the functions, the
browser console for the frontend, and the Razorpay dashboard's webhook
delivery log for payments.

---

## 10. Known limits of this deployment

State these plainly to anyone asking what the product does.

- **Course video access is not enforced.** `course-videos` is a public bucket
  and `videos` is world-readable, so chapter padlocks are a UI boundary. A
  locked video's CDN URL is fetchable from the network tab while signed out.
  This is the top open item — see `docs/ROADMAP.md` P0-3.
- **No auto-renewal.** A month is bought at a time; nothing charges again and
  nothing warns a member before they lapse.
- **No refund flow in the app.** Refund in the Razorpay dashboard, then set the
  member back to Free in Admin → Members. Two places, by hand.
- **No cron.** Expiry is applied at read time, which is why nothing needs to
  run on a schedule — but it also means no scheduled reminders or reports.
- **No tests.** Verification is the checklist in §9.
