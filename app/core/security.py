from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from passlib.context import CryptContext

from app.core import config

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
        expire = now + timedelta(days=config.ACCESS_TOKEN_EXPIRE_DAYS)

    # 'iat' lets clients tell how old the token is and decide when to refresh it
    to_encode.update({"exp": expire, "iat": now})

    # Generate the signed JWT
    encoded_jwt = jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)
    return encoded_jwt