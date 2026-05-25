from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env.development", ".env.production"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_debug: bool = True
    app_secret_key: str = "dev-secret-change-me"

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_cors_origins: str = "http://localhost:3000"

    database_url: str = "postgresql+psycopg://frameboard:frameboard@localhost:5432/frameboard"

    jwt_secret_key: str = "dev-jwt-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    # NextAuth signs session JWTs with this secret using HS256; the
    # backend uses the same secret to verify the Authorization: Bearer
    # token on every authenticated request. Keep in sync with the
    # frontend's NEXTAUTH_SECRET env var.
    nextauth_secret: str = "dev-nextauth-secret-change-me"

    # Self-host / dev escape hatch. When set to "1" or "true", the
    # backend skips JWT verification and treats every request as the
    # `dev_user_email` user — useful for local development, tests, and
    # contributors who haven't set up OAuth yet. Production / public
    # deployments must leave this unset (or "0") so requests without a
    # valid session JWT are rejected.
    auth_disabled: str = "0"
    dev_user_email: str = "dev@frameboard.local"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]

    @property
    def auth_is_disabled(self) -> bool:
        return self.auth_disabled.strip().lower() in ("1", "true", "yes")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
