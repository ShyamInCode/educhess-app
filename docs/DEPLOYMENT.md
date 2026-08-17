# EduChess — Deployment

Two things exist: a static frontend and a Supabase project. That is the whole
deployment. There are no Edge Functions to deploy, no backend service, no
Database Webhooks and no secrets outside the Supabase dashboard.

| Piece | Where | How |
|---|---|---|
| Frontend | Vercel / Netlify / Cloudflare Pages | git push, or `vercel --prod` |
| Database + Auth + Storage | Supabase | six SQL files, by hand, once |

The database half is `RESET-AND-APPLY.md` in the repo root. Do that first; this
file is only about putting the frontend online.

---

## 1. Before the first deploy

- [ ] **Regenerate any credential that has ever been committed.** For this
      project that is `RESET-AND-APPLY.md` step 1, and it is not optional — a
      `service_role` key and the legacy JWT secret were pushed to git history
      and bypass every policy in `supabase/03_rls.sql`.
- [ ] Confirm all six SQL files have been run, and that `03`'s and `04`'s
      self-check blocks passed.
- [ ] Decide the production domain. Below it is `https://educhess.in` —
      substitute yours, with no trailing slash.

---

## 2. Environment variables

Set these in the host's dashboard (Vercel → Project → Settings → Environment
Variables), for **Production** and **Preview**. There are three.

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | the anon public key | Public by design; RLS is the protection |
| `VITE_AUTH_METHODS` | `email,google` | Add `phone` only after an SMS provider + TRAI DLT registration |

> **`VITE_` variables are compiled into the bundle at build time.** Changing
> one in the dashboard does nothing until you **redeploy**.

Never put a *secret* here — anything `VITE_`-prefixed is readable by every
visitor. There is no server in this architecture to hold one, which is the
point: if you find yourself wanting a secret in the frontend, the thing you
want belongs in SQL.

---

## 3. Supabase dashboard configuration

**Authentication → URL Configuration**

- Site URL: `https://educhess.in`
- Redirect URLs: add `https://educhess.in/**` and, for local work,
  `http://localhost:5173/**`

Get this wrong and Google sign-in completes, then bounces the user to
`localhost`. It is the most common production auth failure.

**Authentication → Providers**

- **Email** enabled.
- **Google** enabled, with the client ID and secret from Google Cloud.

**Authentication → Emails**

Leave the templates on Supabase's defaults. The branded ones were dropped with
the rest of the server side; they are archived at
`docs/archive/auth-email-templates/` if you want to paste them back.

**Authentication → SMTP** — configure a custom SMTP provider before real
signup traffic. Supabase's built-in sender is throttled to a few messages an
hour and is not meant for production, so confirmation and reset emails will be
dropped for most people without it.

**There are no Database Webhooks to create.** If any exist from a previous
deployment, delete them — they point at an Edge Function that no longer
exists, and every delivery will fail.

---

## 4. Google Cloud Console

APIs & Services → Credentials → your OAuth 2.0 Web client:

- **Authorized JavaScript origins:** `https://educhess.in`,
  `http://localhost:5173`
- **Authorized redirect URIs:** `https://<ref>.supabase.co/auth/v1/callback`

The redirect URI is Supabase's callback, not your site. Only the origins list
changes when you add a domain.

---

## 5. Frontend host

SPA fallback config ships for every common host, so a hard refresh on
`/courses/chess` serves `index.html` instead of a 404:

- `vercel.json` — Vercel
- `public/_redirects` — Netlify, Cloudflare Pages

Build settings: build command `npm run build`, output directory `dist`,
Node 18 or newer.

**Vercel:** import the GitHub repo, add the §2 variables, deploy. Every push to
the default branch redeploys.

---

## 6. Post-deploy smoke test

The full list is `RESET-AND-APPLY.md` §7 — run that against production, not a
shorter version of it. The four that fail in distinct places and are worth
doing first:

- [ ] Hard-refresh `/courses/chess` → no 404 (SPA fallback is wired).
- [ ] Sign in with Google → you land back on **your** domain, not localhost.
- [ ] Signed out, in the console:
      `await supabase.from('lichess_puzzles').select('puzzle_id').limit(1)`
      → an error. If rows come back, `03_rls.sql` did not finish.
- [ ] Signed out, try to sign a paid video's `storage_path` → refused. If you
      get a URL, the `course-videos` bucket is still public.

---

## 7. Known limits of this deployment

- **Signed video URLs have a client-chosen lifetime.** The tier check happens
  when the URL is minted and never again, and `expiresIn` is a request
  parameter with no server to cap it. A paying subscriber can mint long-lived
  links for the catalogue their tier allows. See `docs/SYSTEM-OVERVIEW.md` §6.1.
- **No transactional email.** Registrations and contact submissions send
  nothing; admins see both in the panel.
- **Payments are stubbed.** Memberships are set by hand in Admin → Members.
- **No auto-renewal and no cron.** Expiry is applied at read time by
  `current_tier()`, which is why nothing needs to run on a schedule.
- **No tests.** Verification is the checklist in `RESET-AND-APPLY.md` §7.
