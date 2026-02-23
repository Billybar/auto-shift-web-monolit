from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core import models, schemas
from app.core.security import SECRET_KEY, ALGORITHM

# This tells FastAPI where the client can get the token.
# The URL must match the route we created in endpoints_auth.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
        token: str = Depends(oauth2_scheme),
        db: Session = Depends(get_db)
) -> models.User:
    """
    Decodes the JWT token, extracts the username, and fetches the user from the database.
    This dependency will be injected into protected routes.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode the token using our secret key
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")

        if username is None:
            raise credentials_exception

        # Optional: load token data into our Pydantic schema for structure verification
        token_data = schemas.TokenData(
            username=username,
            role=payload.get("role"),
            employee_id=payload.get("employee_id")
        )
    except jwt.PyJWTError:
        # Catches expired tokens, invalid signatures, etc.
        raise credentials_exception

    # Fetch the user from the database to ensure they still exist
    user = db.query(models.User).filter(models.User.username == token_data.username).first()
    if user is None:
        raise credentials_exception

    return user


def get_current_admin_user(
        current_user: models.User = Depends(get_current_user)
) -> models.User:
    """
    A specific guard for Admin-only routes.
    It first calls get_current_user to authenticate, then checks the role.
    """
    if current_user.role != schemas.RoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation forbidden: Admin privileges required."
        )
    return current_user