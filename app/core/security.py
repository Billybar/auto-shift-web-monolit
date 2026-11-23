import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv()

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

# Configure passlib to use the bcrypt algorithm for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain text password against the hashed version from the DB.
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Returns a secure bcrypt hash of the given password.
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a JSON Web Token (JWT) with an expiration time.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)

    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    # 'iat' lets clients tell how old the token is and decide when to refresh it
    to_encode.update({"exp": expire, "iat": now})

    # Generate the signed JWT
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt