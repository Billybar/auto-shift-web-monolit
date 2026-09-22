from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core.database import get_db
from app.core.models import User
from app.core.schemas import Token, ForgotPasswordRequest, ResetPasswordRequest
from app.core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_password_hash
from app.services import auth_service

import logging
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/login", response_model=Token)
def login_for_access_token(
        db: Session = Depends(get_db),
        form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    # Log the exact payload received to isolate client-side modifications
    logger.info(f"LOGIN ATTEMPT - Raw username: '{form_data.username}', Length: {len(form_data.username)}")
    
    # 1. Find the user in the database by email (using SQLAlchemy 2.0 syntax)
    # The OAuth2 standard forces the field name 'username' from the client, but it contains the email.
    stmt = select(User).where(User.email == form_data.username)
    user = db.execute(stmt).scalar_one_or_none()

    # Log exactly which part of the authentication failed
    if not user:
        logger.warning(f"LOGIN FAILED - User not found for email: '{form_data.username}'")
    elif not verify_password(form_data.password, str(user.hashed_password)):
        logger.warning(f"LOGIN FAILED - Invalid password for email: '{form_data.username}'")

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


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks, # To send email asynchronously
    db: Session = Depends(get_db)
):
    # Find user by email
    stmt = select(User).where(User.email == payload.email)
    user = db.execute(stmt).scalar_one_or_none()

    # If user exists, generate OTP and schedule email
    if user:
        otp = auth_service.create_password_reset_otp(db, user)
        background_tasks.add_task(auth_service.send_password_reset_email, user.email, otp)
    
    # Always return the same response for security parity (prevent email enumeration)
    return {"message": "If that email address is in our database, we will send you an email to reset your password."}


# Reset password route
@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    # Find user by email
    stmt = select(User).where(User.email == payload.email)
    user = db.execute(stmt).scalar_one_or_none()

    if not user:
        # Generic error to avoid exposing user existence
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP or expired."
        )
    
    # Verify OTP using our service
    is_valid = auth_service.verify_and_clear_otp(db, user, payload.otp)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP or expired."
        )
    
    # Update password
    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return {"message": "Password has been reset successfully."}