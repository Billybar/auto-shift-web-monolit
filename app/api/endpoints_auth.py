from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core.database import get_db
from app.core.models import User
from app.core.schemas import Token
from app.core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter()


@router.post("/login", response_model=Token)
def login_for_access_token(
        db: Session = Depends(get_db),
        form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    # 1. Find the user in the database by email (using SQLAlchemy 2.0 syntax)
    # The OAuth2 standard forces the field name 'username' from the client, but it contains the email.
    stmt = select(User).where(User.email == form_data.username)
    user = db.execute(stmt).scalar_one_or_none()

    # 2. Verify user exists and password is correct
    if not user or not verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password", # Updated error message for accuracy
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Create the JWT payload (claims)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token_data = {
        "sub": user.email,
        "role": user.role.value if user.role else "employee",
        "employee_id": user.employee_id,
        "organization_id": user.organization_id,
        "first_name": user.first_name,
        "last_name": user.last_name
    }

    # 4. Generate the token
    access_token = create_access_token(
        data=token_data, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}