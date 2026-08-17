from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import OptionalUser, RequireUser
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title="EduChess API",
    description="Backend for Champion Chess Academy — puzzles, payments, AI, video.",
    version="0.1.0",
    # Don't advertise the schema publicly in production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

# Explicit origins (not "*") — credentialed requests require it, and it keeps
# the surface tight. Set CORS_ORIGINS to your deployed frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, object]:
    """Liveness probe. Reports config presence WITHOUT leaking any values."""
    return {
        "status": "ok",
        "environment": settings.environment,
        "supabase_configured": bool(settings.supabase_url),
        "auth_configured": bool(settings.supabase_jwt_secret),
    }


@app.get("/me", tags=["auth"])
async def me(user: RequireUser) -> dict[str, str | None]:
    """
    Verifies the JWT bridge end to end. Call it from the browser with a live
    Supabase session; a 200 here means the frontend and backend agree on who
    you are, which everything else depends on.
    """
    return {"id": user.id, "email": user.email}


@app.get("/whoami", tags=["auth"])
async def whoami(user: OptionalUser) -> dict[str, object]:
    """Same, but for the logged-out-friendly path (puzzles use this shape)."""
    return {"authenticated": user is not None, "id": user.id if user else None}
