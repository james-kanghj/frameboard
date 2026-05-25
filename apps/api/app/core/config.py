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

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
