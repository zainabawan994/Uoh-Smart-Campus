from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/uoh_campus"
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    # Session cookie (httpOnly, so page scripts can never read the login token).
    COOKIE_NAME: str = "uoh_session"
    COOKIE_SECURE: bool = False      # set true when the site is served over HTTPS
    COOKIE_SAMESITE: str = "lax"     # use "none" (with COOKIE_SECURE=true) only if frontend and API are on different sites
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    UOH_BASE_URL: str = "https://www.uoh.edu.pk"
    SCRAPE_INTERVAL_HOURS: int = 6
    # Comma-separated public pages (Facebook, Instagram, LinkedIn, society sites) scanned for events.
    EVENT_SOURCES: str = ""

    # Used to read photographed menus (cafe manager upload).
    ANTHROPIC_API_KEY: str = ""

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 5

    DB_ECHO: bool = False

    # "production" refuses to start while staff accounts still use the published seed passwords.
    ENVIRONMENT: str = "development"

    # First admin for a fresh (empty) database. Used only when no admin account exists yet.
    ADMIN_PASSWORD: str = ""
    ADMIN_REG_NO: str = "A00-0001"
    ADMIN_EMAIL: str = "admin@uoh.edu.pk"
    ADMIN_NAME: str = "Campus Administrator"

    # Built frontend (frontend/dist). When present, the backend serves the whole site from one domain.
    FRONTEND_DIST: str = "../frontend/dist"

    @field_validator("DATABASE_URL")
    @classmethod
    def use_asyncpg(cls, v: str) -> str:
        """Cloud hosts give postgres:// or postgresql:// URLs; SQLAlchemy async needs the asyncpg driver."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+asyncpg://" + v[len(prefix):]
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
