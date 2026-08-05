# Razorpay membership payments

Two Edge Functions. Neither needs the FastAPI service in `backend/`.

| Function | Called by | JWT gate |
|---|---|---|
| `razorpay-order` | the browser, with the signed-in user's access token | on (default) |
| `razorpay-webhook` | Razorpay's servers | **off** — `--no-verify-jwt` |

## Why the split

`razorpay-order` exists because two things must never be in the browser: the
Razorpay **key secret**, and the **amount**. The amount is looked up from the
tier inside the function, so a tampered request can only ever buy the plan it
names at the price we set.

`razorpay-webhook` exists because the browser's checkout success callback
proves nothing. It can be called from a console, and it never fires at all if
the customer closes the tab after paying. The signed webhook is the only
trustworthy statement that money moved, so it — and only it — grants the
membership, via `record_razorpay_payment()`.

## Secrets

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=xxxxxxxxxxxx
supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx
```

`RAZORPAY_WEBHOOK_SECRET` is the string you type into Razorpay's webhook form,
not the key secret. They are different values; using one for the other fails
every signature check.

The **publishable** key id also goes in the frontend `.env` as
`VITE_RAZORPAY_KEY_ID`. That one is public by design. Leave it blank and the
upgrade buttons fall back to "Talk to us".

## Deploy

```bash
supabase functions deploy razorpay-order
supabase functions deploy razorpay-webhook --no-verify-jwt
```

## Webhook to create

Razorpay Dashboard → Settings → Webhooks → **Add New Webhook**

- URL: `https://<project-ref>.functions.supabase.co/razorpay-webhook`
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
- Active events: `payment.captured` and `order.paid`

Both events are sent for a single payment. That is fine —
`record_razorpay_payment()` locks the row and returns early if the payment is
already applied, so the second event does not buy a second month.

## Testing

Use Razorpay **Test Mode** keys (`rzp_test_...`) end to end first. Test card:
`4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234` when asked.

What to check:

1. Click *Get Pro* → the modal opens with the right amount.
2. Pay → the page says "Activating your plan…" and then "Pro is active".
3. `select * from payments order by created_at desc limit 1;` shows `paid`.
4. `select tier, tier_expires_at from profiles where id = '<uid>';` shows `pro`
   and a date one month out.
5. Replay the webhook from the Razorpay dashboard. Nothing changes: the
   response says `{"activated": false}` and the expiry does not move.
6. Point the webhook at the function with a wrong secret. It answers 401 and
   no membership is granted.

`supabase functions logs razorpay-webhook` shows signature failures and
unknown orders.

## If a payment succeeds but the plan doesn't switch

Almost always the webhook: wrong secret, wrong URL, or the function deployed
without `--no-verify-jwt`. Fix it and replay the event from the Razorpay
dashboard — activation is idempotent, so replaying is safe. Admin → Members
can set the tier by hand in the meantime.
