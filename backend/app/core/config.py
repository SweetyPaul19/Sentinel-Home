import os
import hmac
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent
# Support both local development (backend/.env) and a root-level .env while
# allowing Render or the shell to override either file.
load_dotenv(BACKEND_DIR / ".env", override=False)
load_dotenv(PROJECT_DIR / ".env", override=False)


class Settings:
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "sentinelhome")
    PERSISTENCE = os.getenv("PERSISTENCE", "memory").lower()
    REDIS_URI = os.getenv("REDIS_URI", "redis://localhost:6379")
    TWILIO_SID = os.getenv("TWILIO_SID", "")
    TWILIO_TOKEN = os.getenv("TWILIO_TOKEN", "")
    TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
    TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")
    TWILIO_WHATSAPP_CONTENT_SID = os.getenv("TWILIO_WHATSAPP_CONTENT_SID", "")
    TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT = int(
        os.getenv("TWILIO_WHATSAPP_TEMPLATE_VARIABLE_COUNT", "0")
    )
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").lstrip("@")
    TELEGRAM_LINK_TOKEN_TTL_SECONDS = int(
        os.getenv("TELEGRAM_LINK_TOKEN_TTL_SECONDS", "600")
    )
    TELEGRAM_API_BASE_URL = os.getenv(
        "TELEGRAM_API_BASE_URL", "https://api.telegram.org"
    ).rstrip("/")
    TWILIO_VOICE_URL = os.getenv("TWILIO_VOICE_URL", "")
    PUBLIC_BACKEND_URL = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
    AUTO_SEND_ALERTS = os.getenv("AUTO_SEND_ALERTS", "false").lower() == "true"
    AUTO_ESCALATE_ALERTS = os.getenv("AUTO_ESCALATE_ALERTS", "false").lower() == "true"
    ALERT_CONFIRMATION_TIMEOUT_MINUTES = int(
        os.getenv("ALERT_CONFIRMATION_TIMEOUT_MINUTES", "5")
    )
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")
    APP_ENV = os.getenv("APP_ENV", "development")
    ENABLE_SCHEDULER = os.getenv("ENABLE_SCHEDULER", "false").lower() == "true"
    MONITOR_INTERVAL_MINUTES = int(os.getenv("MONITOR_INTERVAL_MINUTES", "30"))
    SIMULATION_PASSWORD = os.getenv("SIMULATION_PASSWORD", "")
    SESSION_SECRET = os.getenv("SESSION_SECRET", "sentinelhome-local-session-secret")
    SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"

    def simulation_password_matches(self, candidate: str) -> bool:
        return bool(self.SIMULATION_PASSWORD) and hmac.compare_digest(
            str(candidate or ""), self.SIMULATION_PASSWORD
        )

settings = Settings()
