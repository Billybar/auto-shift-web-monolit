# app/core/config.py
"""
Every setting the backend reads from the environment (and .env). Other modules import these
constants instead of calling os.getenv themselves. Required settings fail here, at import time.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Environment mode: "production" drops the localhost origins from CORS
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Database connection string
DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Add it to .env or the Docker configuration (see .env.example)")

# Signs every JWT. There is no fallback: a missing key must stop the app at startup
# rather than sign tokens with a value anyone can read in the source.
SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set. Add it to .env (see .env.example)")
# Tokens are signed with the shared SECRET_KEY, so only HMAC algorithms make sense here
ALGORITHM = os.getenv("ALGORITHM", "HS256")
if ALGORITHM not in ("HS256", "HS384", "HS512"):
    raise RuntimeError(f"Unsupported JWT ALGORITHM '{ALGORITHM}'; use HS256, HS384 or HS512")
# Sliding session: clients renew the token via /api/auth/refresh, so this is the inactivity window
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "90"))

# SMTP and Email configurations
SMTP_SERVER = os.getenv("SMTP_SERVER", "mail.your-server.de")
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", SMTP_USERNAME)

# Scheduling engine: total time budget per auto-assign run (kept below the web client's 300 s timeout)
# and the number of CP-SAT search workers
SOLVER_MAX_SECONDS = float(os.getenv("SOLVER_MAX_SECONDS", 60))
SOLVER_NUM_WORKERS = int(os.getenv("SOLVER_NUM_WORKERS", 8))

# Public demo (a separate instance; see docker-compose.demo.yml). Each visitor gets a private sandbox
# organization that is deleted after DEMO_SANDBOX_TTL_HOURS
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
DEMO_SANDBOX_TTL_HOURS = float(os.getenv("DEMO_SANDBOX_TTL_HOURS", 48))
DEMO_MAX_SANDBOXES_PER_IP_PER_HOUR = int(os.getenv("DEMO_MAX_SANDBOXES_PER_IP_PER_HOUR", 5))
DEMO_MAX_ACTIVE_SANDBOXES = int(os.getenv("DEMO_MAX_ACTIVE_SANDBOXES", 1000))
# Request header with the visitor's IP, set by the proxy in front (Cloudflare: CF-Connecting-IP).
# Empty: the connection's own address
DEMO_CLIENT_IP_HEADER = os.getenv("DEMO_CLIENT_IP_HEADER", "")
