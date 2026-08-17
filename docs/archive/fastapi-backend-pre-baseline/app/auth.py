"""
Supabase JWT verification.

The frontend already authenticates against Supabase Auth; this backend does not
issue its own sessions. It simply *verifies* the access token the browser
already holds:

    Authorization: Bearer <supabase session.access_token>

Two signing schemes exist, and this module supports both:

  * **Asymmetric (current).** Supabase projects now sign with a per-project
    ECC P-256 or RSA key and publish the public half at
    ``{SUPABASE_URL}/auth/v1/.well-known/jwks.json``. This is the default path
    and needs only SUPABASE_URL — there is no shared secret to leak.

  * **Legacy HS256.** Older projects signed with a shared secret
    (Dashboard -> JWT Keys -> "Legacy JWT Secret"). After a project migrates,
    Supabase keeps the legacy key listed as PREVIOUS KEY so already-issued
    tokens stay valid until they expire. Set SUPABASE_JWT_SECRET to keep
    accepting those during the changeover, then set
    ALLOW_LEGACY_HS256=false and drop the secret once they have aged out
    (access tokens are short-lived — an hour by default).

Algorithm confusion
-------------------
Picking a verification key based on the token's own ``alg`` header is the
classic way JWT verification gets broken: an attacker flips ``alg`` to HS256
and signs with the *public* key, which they can simply download from the JWKS
endpoint, and a naive verifier accepts it.

The defence here is that key material is never chosen by the token:

  * ``alg: ES256``/``RS256``  -> key comes from JWKS, verified as that alg only.
  * ``alg: HS256``            -> key is *always* ``SUPABASE_JWT_SECRET``, never
                                 anything fetched from JWKS.

So a forged HS256 token signed with the public key has nothing to verify
against and is rejected. ``smoke_test.py`` asserts exactly this.
"""

from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError

from .config import Settings, get_settings

# Signature algorithms whose key comes from JWKS. Deliberately excludes "none"
# and every HMAC variant.
ASYMMETRIC_ALGS = ("ES256", "RS256")

# auto_error=False so we can raise our own 401 with a useful message, and so
# optional-auth routes can accept an absent header without blowing up.
_bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

_NOT_CONFIGURED = HTTPException(
    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    detail="Server auth is not configured",
)


class CurrentUser:
    """The verified caller. `id` is the Supabase auth user id (JWT `sub`)."""

    def __init__(self, claims: dict[str, Any]):
        self.claims = claims
        self.id: str = claims["sub"]
        self.email: str | None = claims.get("email")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"CurrentUser(id={self.id!r}, email={self.email!r})"


def jwks_url(settings: Settings) -> str | None:
    if not settings.supabase_url:
        return None
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache(maxsize=4)
def _jwk_client(url: str) -> PyJWKClient:
    """
    One long-lived client per JWKS URL.

    It caches the key set, so steady-state verification costs no network call.
    `lifespan` bounds how long a rotated-out key stays trusted.
    """
    return PyJWKClient(url, cache_keys=True, max_cached_keys=8, cache_jwk_set=True, lifespan=600)


def _signing_key(url: str, token: str):
    """
    Resolve the public key for this token's `kid`, refreshing once on a miss.

    Supabase key rotation ("Create Standby Key" then switch) introduces a new
    `kid` that our cached set won't have. Without the retry every request would
    401 until the cache expired.
    """
    try:
        return _jwk_client(url).get_signing_key_from_jwt(token).key
    except PyJWKClientError:
        _jwk_client.cache_clear()
        try:
            return _jwk_client(url).get_signing_key_from_jwt(token).key
        except PyJWKClientError:
            raise _UNAUTHENTICATED


def _verify(token: str, key: Any, algorithms: list[str]) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired — please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise _UNAUTHENTICATED


def _decode(token: str, settings: Settings) -> dict[str, Any]:
    url = jwks_url(settings)
    legacy_secret = settings.supabase_jwt_secret if settings.allow_legacy_hs256 else ""

    # Fail closed. Without a way to verify, accepting anything would be an
    # authentication bypass.
    if not url and not legacy_secret:
        raise _NOT_CONFIGURED

    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.InvalidTokenError:
        raise _UNAUTHENTICATED

    if alg in ASYMMETRIC_ALGS:
        if not url:
            raise _NOT_CONFIGURED
        # algorithms=[alg] and not the whole tuple: pin verification to the
        # single algorithm this key was published for.
        return _verify(token, _signing_key(url, token), [alg])

    if alg == "HS256":
        # The secret is the ONLY acceptable HMAC key — see the module docstring.
        if not legacy_secret:
            raise _UNAUTHENTICATED
        return _verify(token, legacy_secret, ["HS256"])

    # "none", unexpected algs, missing header.
    raise _UNAUTHENTICATED


async def require_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    """Dependency for routes that require a signed-in user."""
    if creds is None or not creds.credentials:
        raise _UNAUTHENTICATED
    return CurrentUser(_decode(creds.credentials, settings))


async def optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser | None:
    """
    Dependency for routes that work logged-out but personalise when signed in —
    e.g. puzzles, which stay free and unauthenticated but record progress for
    logged-in students.

    An invalid token is still rejected: silently treating a bad token as
    "anonymous" would hide bugs and make debugging auth issues miserable.
    """
    if creds is None or not creds.credentials:
        return None
    return CurrentUser(_decode(creds.credentials, settings))


RequireUser = Annotated[CurrentUser, Depends(require_user)]
OptionalUser = Annotated[CurrentUser | None, Depends(optional_user)]
