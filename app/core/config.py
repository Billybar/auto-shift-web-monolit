# app/core/config.py

import os
from dotenv import load_dotenv

load_dotenv()

# SMTP and Email configurations
SMTP_SERVER = os.getenv("SMTP_SERVER", "mail.your-server.de")
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", SMTP_USERNAME)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")