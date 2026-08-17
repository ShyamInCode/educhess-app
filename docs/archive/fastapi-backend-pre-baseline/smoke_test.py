"""
Auth bridge smoke test.

Covers both signing schemes and, most importantly, asserts that the
algorithm-confusion attack against the asymmetric path fails. Re-run after any
change to app/auth.py — it is the most security-sensitive file here.

    .venv/Scripts/python smoke_test.py
"""

import base64
import hashlib
import hmac
import json
import os
import time

os.environ.update({
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_JWT_SECRET": "test-secret-not-real",
    "ENVIRONMENT": "development",
})

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import auth
from app.config import get_settings
from app.main import app

c = TestClient(app)
S = "test-secret-not-real"

failures = []


def check(label, got, want):
    ok = got == want
    if not ok:
        failures.append(f"{label}: expected {want}, got {got}")
    print(f"{'PASS' if ok else 'FAIL'}  {label:<44} {got}")


def me(token):
    return c.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code


def claims(**over):
    base = {"sub": "user-123", "email": "a@b.com", "aud": "authenticated",
            "exp": int(time.time()) + 3600}
    base.update(over)
    return base


# --------------------------------------------------------------------------
# Asymmetric (ES256) — what Supabase issues now.
# --------------------------------------------------------------------------
priv = ec.generate_private_key(ec.SECP256R1())
pub = priv.public_key()
other_priv = ec.generate_private_key(ec.SECP256R1())

priv_pem = priv.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)
other_pem = other_priv.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)
pub_pem = pub.public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
)

# Stand in for the network JWKS fetch: always hand back our public key.
auth._signing_key = lambda url, token: pub  # noqa: SLF001

def es256(key_pem=priv_pem, **over):
    return jwt.encode(claims(**over), key_pem, algorithm="ES256", headers={"kid": "test-key"})


print("\n-- asymmetric ES256 (current Supabase scheme) --")
check("valid ES256 accepted", me(es256()), 200)
check("ES256 signed by another key rejected", me(es256(other_pem)), 401)
check("ES256 expired rejected", me(es256(exp=int(time.time()) - 10)), 401)
check("ES256 wrong audience rejected", me(es256(aud="anon")), 401)

print("\n-- algorithm confusion (the attack this design exists to stop) --")


def raw_jwt(header: dict, payload: dict, secret: bytes | None) -> str:
    """
    Hand-assemble a JWT.

    PyJWT refuses to *encode* HS256 with an asymmetric key ("should not be used
    as an HMAC secret"), which is a good guard — but an attacker has no reason
    to use PyJWT. Building the token directly is what the real attack looks
    like, so that is what gets tested here.
    """
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")  # noqa: E731
    signing_input = b64(json.dumps(header).encode()) + b"." + b64(json.dumps(payload).encode())
    if secret is None:  # alg=none carries an empty signature
        return (signing_input + b".").decode()
    sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
    return (signing_input + b"." + b64(sig)).decode()


# Attacker downloads the public key from the JWKS endpoint and signs an HS256
# token with it, hoping the server verifies HMAC using that same public key.
forged = raw_jwt({"alg": "HS256", "typ": "JWT"}, claims(), pub_pem)
check("HS256 forged with the PUBLIC key rejected", me(forged), 401)
check("alg=none rejected", me(raw_jwt({"alg": "none", "typ": "JWT"}, claims(), None)), 401)

# --------------------------------------------------------------------------
# Legacy HS256 — accepted only while the shared secret is configured.
# --------------------------------------------------------------------------
print("\n-- legacy HS256 --")
def hs256(secret=S, **over):
    return jwt.encode(claims(**over), secret, algorithm="HS256")

check("legacy HS256 accepted while enabled", me(hs256()), 200)
check("HS256 wrong secret rejected", me(hs256("WRONG")), 401)
check("HS256 expired rejected", me(hs256(exp=int(time.time()) - 10)), 401)
check("HS256 wrong audience rejected", me(hs256(aud="anon")), 401)

os.environ["ALLOW_LEGACY_HS256"] = "false"
get_settings.cache_clear()
check("legacy HS256 refused once disabled", me(hs256()), 401)
check("ES256 still accepted with legacy off", me(es256()), 200)
os.environ["ALLOW_LEGACY_HS256"] = "true"
get_settings.cache_clear()

# --------------------------------------------------------------------------
# General
# --------------------------------------------------------------------------
print("\n-- general --")
check("no token rejected", c.get("/me").status_code, 401)
check("garbage token rejected", me("not.a.jwt"), 401)
check("health ok", c.get("/health").status_code, 200)
check("whoami anonymous ok", c.get("/whoami").status_code, 200)
check("whoami authenticated", c.get("/whoami", headers={"Authorization": f"Bearer {es256()}"}).json()["authenticated"], True)

print()
if failures:
    print(f"{len(failures)} FAILURE(S):")
    for f in failures:
        print("  -", f)
    raise SystemExit(1)
print("All auth checks passed.")
