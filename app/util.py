#Contains utility functions for the application
import bcrypt
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_HOST: str
    DATABASE_PORT: int
    DATABASE_NAME: str
    DATABASE_USER: str
    DATABASE_PASSWORD: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    AI_ENABLED: bool = True
    AI_DAILY_REQUEST_LIMIT: int = 3
    AI_CHAT_REPLY_LIMIT: int = 10
    AI_UNLIMITED_EMAILS: str = "aymenshamoon@gmail.com,test@gmail.com"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def ai_unlimited_emails(self) -> set[str]:
        return {
            email.strip().lower()
            for email in self.AI_UNLIMITED_EMAILS.split(",")
            if email.strip()
        }

settings = Settings()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False
