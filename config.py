from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    database_url_nomina: str = "postgresql://nomina_user:IESEFnomina@2026$@localhost:5432/iesef_nomina"
    jwt_secret: str = "dev-secret-local-iesef-2026"
    jwt_expire_hours: int = 8

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
