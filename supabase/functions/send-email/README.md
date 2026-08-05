# `send-email` Edge Function

Sends EduChess's branded confirmation emails through [Resend](https://resend.com).
Triggered by Supabase **Database Webhooks**, not called from the browser — the
anon key must never be able to make the site send mail.

## What it sends

| Webhook source table | Email | Sent to |
|---|---|---|
| `tournament_registrations` | Registration confirmed | `parent_email` |
| `workshop_registrations` | Registration confirmed | `parent_email` |
| `contact_submissions` | We received your enquiry | `email` |

Registration rows carry only the event's foreign key, so the function reads the
parent `tournaments` / `workshops` row back with the service-role client to fill
in the date, venue and fee.

## Environment

| Name | Set by | Notes |
|---|---|---|
| `RESEND_API_KEY` | you | `supabase secrets set RESEND_API_KEY=re_...` |
| `EMAIL_FROM` | you (optional) | defaults to `EduChess <noreply@educhess.in>`; the domain must be verified in Resend |
| `SITE_URL` | you (optional) | defaults to `https://educhess.in`; used for the logo and links |
| `WEBHOOK_SECRET` | you (optional) | the expected `Authorization: Bearer` value; defaults to the service-role key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | platform | injected automatically |

## Deploy

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase functions deploy send-email
```

The function checks the `Authorization` header itself and rejects anything that
doesn't match. If you set a `WEBHOOK_SECRET` that is **not** a JWT, also deploy
with `--no-verify-jwt`, otherwise the platform's own JWT gate rejects the
webhook before this code runs:

```bash
supabase functions deploy send-email --no-verify-jwt
```

Leaving `WEBHOOK_SECRET` unset (so it falls back to the service-role key, which
*is* a JWT) works with the default gate and needs no extra flag.

## Webhooks to create

Supabase dashboard → **Database → Webhooks → Create a new hook**, once per table:

- Table: `tournament_registrations` · Events: `Insert` · Type: HTTP Request ·
  Method `POST` · URL `https://<project-ref>.functions.supabase.co/send-email` ·
  Header `Authorization: Bearer <service-role key or WEBHOOK_SECRET>`
- Same again for `workshop_registrations`
- Same again for `contact_submissions`

## Testing

```bash
curl -X POST https://<project-ref>.functions.supabase.co/send-email \
  -H "Authorization: Bearer <service-role key>" \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"contact_submissions","record":{"name":"Test Parent","email":"you@example.com","grade":"6","struggles":"Wants to start chess"}}'
```

`supabase functions logs send-email` shows the Resend response when something
is rejected (unverified domain, bad key, invalid `from`).
