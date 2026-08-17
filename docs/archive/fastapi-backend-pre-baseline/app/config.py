from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Backend configuration, loaded from environment / .env.

    NOTE the asymmetry with the frontend: the frontend's VITE_* vars are
    compiled into the public bundle and are therefore public. Everything here
    is server-only. In particular SUPABASE_JWT_SECRET and
    SUPABASE_SERVICE_ROLE_KEY must never be sent to the browser or committed.
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Supabase -------------------------------------------------------
    # Also the JWKS source: tokens are verified against
    # {supabase_url}/auth/v1/.well-known/jwks.json. Required for the current
    # asymmetric (ES256/RS256) signing keys.
    supabase_url: str = ""
    # LEGACY ONLY. The shared secret older projects signed with, at
    # Dashboard → Settings → JWT Keys → "Legacy JWT Secret". Projects using
    # the current asymmetric keys do not need this at all; set it only while
    # tokens issued under the old key are still in flight, then clear it.
    supabase_jwt_secret: str = ""
    # Set false to stop accepting HS256 tokens entirely. Do this once the
    # legacy key has been revoked and old tokens have expired — it removes a
    # whole class of forgery risk, since there is then no shared secret that
    # could leak. See app/auth.py for why the two schemes can coexist safely.
    allow_legacy_hs256: bool = True
    # Bypasses RLS. Only for trusted server-side writes (e.g. granting an
    # entitlement after a verified Razorpay webhook). Never expose.
    supabase_service_role_key: str = ""

    # --- HTTP -----------------------------------------------------------
    # Comma-separated list of allowed browser origins.
    cors_origins: str = "http://localhost:5173"

    environment: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
