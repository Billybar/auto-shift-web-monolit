import os
from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext

# In production, NEVER hardcode the secret key!
# It should be loaded from the .env file using os.getenv("SECRET_KEY")
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-development-key-replace-me")
ALGORITHM = "HS256"
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
    now = datetime.utcnow()

    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    # 'iat' lets clients tell how old the token is and decide when to refresh it
    to_encode.update({"exp": expire, "iat": now})

    # Generate the signed JWT
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt