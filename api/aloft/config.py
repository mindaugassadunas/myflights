from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Database ---
    database_url: str = Field(default="", validation_alias="DATABASE_URL")
    direct_database_url: str = Field(default="", validation_alias="DIRECT_DATABASE_URL")

    # --- OpenSky ---
    opensky_client_id: str = Field(default="", validation_alias="OPENSKY_CLIENT_ID")
    opensky_client_secret: str = Field(default="", validation_alias="OPENSKY_CLIENT_SECRET")
    opensky_token_url: str = Field(
        default="https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
        validation_alias="OPENSKY_TOKEN_URL",
    )
    opensky_api_base: str = Field(
        default="https://opensky-network.org/api",
        validation_alias="OPENSKY_API_BASE",
    )
    opensky_daily_credit_budget: int = Field(
        default=4000,
        validation_alias="OPENSKY_DAILY_CREDIT_BUDGET",
    )

    # --- AeroDataBox (RapidAPI) ---
    aerodatabox_api_key: str = Field(default="", validation_alias="AERODATABOX_API_KEY")
    aerodatabox_host: str = Field(
        default="aerodatabox.p.rapidapi.com",
        validation_alias="AERODATABOX_HOST",
    )

    # --- Anthropic ---
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-7", validation_alias="ANTHROPIC_MODEL")

    # --- Internal ---
    internal_api_key: str = Field(default="", validation_alias="INTERNAL_API_KEY")

    # --- Misc ---
    log_level: Literal["debug", "info", "warning", "error"] = Field(
        default="info", validation_alias="LOG_LEVEL"
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
