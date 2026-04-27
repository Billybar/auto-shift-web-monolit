from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.orm import Session
from sqlalchemy import select

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
    This dependency will be injected into protected - routes.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode the token using our secret key
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")

        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)

        # Optional: load token data into our Pydantic schema for structure verification
        token_data = schemas.TokenData(
            email=email,
            role=payload.get("role"),
            employee_id=payload.get("employee_id")
        )
    except jwt.PyJWTError:
        # Catches expired tokens, invalid signatures, etc.
        raise credentials_exception

    # Fetch the user from the database to ensure they still exist
    stmt = select(models.User).where(models.User.email == token_data.email)
    user = db.execute(stmt).scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user

def get_current_admin_user(
        current_user: models.User = Depends(get_current_user)
) -> models.User:
    if current_user.role != schemas.RoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation forbidden: Admin privileges required."
        )
    return current_user

def get_current_manager_user(
        current_user: models.User = Depends(get_current_user)
) -> models.User:
    """
    Guard for Manager-level routes. Allows ADMIN and MANAGER.
    """
    if current_user.role not in [schemas.RoleEnum.ADMIN, schemas.RoleEnum.MANAGER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation forbidden: Manager privileges required."
        )
    return current_user

def get_current_scheduler_user(
        current_user: models.User = Depends(get_current_user)
) -> models.User:
    """
    Guard for Scheduler-level routes. Allows ADMIN, MANAGER, and SCHEDULER.
    """
    if current_user.role not in [schemas.RoleEnum.ADMIN, schemas.RoleEnum.MANAGER, schemas.RoleEnum.SCHEDULER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation forbidden: Scheduler privileges required."
        )
    return current_user