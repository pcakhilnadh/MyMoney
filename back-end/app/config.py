from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/postgres"
    google_client_id: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
    app_url: str = "http://localhost:5173"
    session_cookie_secure: bool | None = None
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1/chat/completions"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    expense_ai_provider: str = "deepseek"
    expense_ai_model: str = "deepseek-flash"
    max_image_upload_mb: int = 5

    model_config = {"env_file": ".env"}


settings = Settings()
