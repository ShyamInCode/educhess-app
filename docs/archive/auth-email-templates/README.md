# Supabase Auth email templates

These are **not** deployed by code. Supabase renders auth emails itself, from
templates stored in the dashboard, so each file here has to be pasted in by
hand — once, and again whenever it changes.

Supabase dashboard → **Authentication → Emails → Templates**:

| File | Template to paste it into |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `reset-password.html` | Reset password |

Paste the file contents into the **Message body** box, leave the subject as you
want it to read in an inbox (suggested: *Confirm your EduChess account* and
*Reset your EduChess password*), and save.

## Conventions

- Go template variables — `{{ .ConfirmationURL }}`, `{{ .Email }}`,
  `{{ .SiteURL }}`, `{{ .Token }}`. Keep the spaces inside the braces.
- `{{ .SiteURL }}` is whatever is set in **Authentication → URL Configuration**,
  and it is also where the logo is loaded from
  (`{{ .SiteURL }}/educhess_title.png`). If that URL is not publicly reachable,
  the logo will not render and the `alt` text shows instead.
- All CSS is inline. Gmail strips `<style>` blocks, so a stylesheet would
  silently lose the branding for most of the audience.
- These files are fragments, not whole documents: Supabase wraps them. No
  `<html>` or `<body>` tag.

The same brand shell is used by the `send-email` Edge Function
(`supabase/functions/send-email/templates.ts`). If you restyle one, restyle both
or the two halves of the account experience stop matching.
