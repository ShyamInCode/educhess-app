# EduChess API

FastAPI service for the things the browser must not be trusted with: payment
verification, signed URLs for paid video, AI calls, and PGN→video jobs.

Supabase stays the source of truth for auth, data and storage. This service
**verifies** the JWT the frontend already holds — it does not issue sessions.

## Run locally

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

cp .env.example .env        # then fill in SUPABASE_JWT_SECRET
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Interactive docs at <http://localhost:8000/docs> (disabled when
`ENVIRONMENT=production`).

## How tokens are verified

Supabase projects sign access tokens with an **asymmetric key** (Settings →
JWT Keys shows `ECC (P-256)` or RSA) and publish the public half at
`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. That is the default path here
and needs only `SUPABASE_URL` — there is no shared secret to leak.

Projects that predate the change signed with a shared secret (HS256). After
migrating, Supabase keeps the old key listed as PREVIOUS KEY so unexpired
tokens still work, so `SUPABASE_JWT_SECRET` is still accepted during that
window. Clear it and set `ALLOW_LEGACY_HS256=false` once those have aged out.

**Why both can coexist safely:** the verification key is never chosen by the
token. `alg: ES256/RS256` resolves its key from JWKS; `alg: HS256` *always*
uses `SUPABASE_JWT_SECRET` and never a JWKS key. That closes the classic
algorithm-confusion hole where an attacker flips `alg` to HS256 and signs with
the public key they downloaded from the JWKS endpoint.

## Verify the auth bridge

```bash
.venv/Scripts/python smoke_test.py
```

17 assertions, exits non-zero on any failure. Covers ES256 (valid, wrong key,
expired, wrong audience), the legacy HS256 path with the kill switch on and
off, and — importantly — that a **hand-crafted HS256 token signed with the
ES256 public key is rejected**, plus `alg: none`. Re-run this after any change
to `app/auth.py`; it's the single most security-sensitive file here.

End-to-end from the browser, with a real session:

```js
import { api } from "./lib/api";
await api.health();   // { status: "ok", auth_configured: true }
await api.me();       // { id, email }  ← 200 means the bridge works
```

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness + config presence (never leaks values) |
| `GET /me` | required | verifies the JWT bridge; returns caller identity |
| `GET /whoami` | optional | logged-out-friendly shape, used by free features |

## Configuration

See `.env.example`. Two genuine secrets:

- `SUPABASE_JWT_SECRET` — verifies user tokens. Anyone holding it can
  impersonate any user.
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS. Only for trusted server-side
  writes (e.g. granting an entitlement after a **verified** Razorpay webhook).

Neither may ever reach the browser or be committed. Contrast with the
frontend's `VITE_*` vars, which are public by design.

## Deploy

`Dockerfile` is ready for Railway / Fly.io / Render. Set the env vars in the
platform dashboard, and set `CORS_ORIGINS` to your deployed frontend origin
(not `*`). Then set `VITE_API_URL` in the frontend to this service's URL.

## Conventions

- Money in **integer paise**, never floats.
- Never trust a client-reported payment outcome — verify the Razorpay signature
  server-side and treat the webhook as the source of truth (see
  `docs/ROADMAP.md` P4.5).
- Fail closed: if auth config is missing, return 500 rather than accepting
  unverified tokens.
