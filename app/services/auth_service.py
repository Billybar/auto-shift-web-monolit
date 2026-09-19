# app/services/auth_service.py

import secrets
import smtplib
import string
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from email.message import EmailMessage

from app.core import models, config
from app.core.security import get_password_hash # Assuming this exists for passwords

# Configurable constants
OTP_LENGTH = 6
OTP_EXPIRE_MINUTES = 15

def generate_otp() -> str:
    """Generates a secure, random numeric OTP."""
    alphabet = string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(OTP_LENGTH))

def create_password_reset_otp(db: Session, user: models.User) -> str:
    """
    Generates an OTP, hashes it, saves the hash and expiration to the user model,
    and returns the plain OTP (to be sent via email).
    """
    plain_otp = generate_otp()
    
    # We hash the OTP just like a password for security
    hashed_otp = get_password_hash(plain_otp)
    
    # Set expiration time (timezone aware)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)
    
    # Update user record
    user.reset_otp = hashed_otp
    user.reset_otp_expires_at = expires_at
    
    db.commit()
    db.refresh(user)
    
    return plain_otp

def send_password_reset_email(email: str, otp: str):
    """
    Sends an actual email containing the OTP using SMTP over SSL.
    """
    # Create the email structure
    msg = EmailMessage()
    msg["Subject"] = "Password Reset Request - AutoShift"
    msg["From"] = config.SENDER_EMAIL
    msg["To"] = email
    
    # Email body (plain text, you can upgrade to HTML later if needed)
    body = (
        f"Hello,\n\n"
        f"We received a request to reset your password for your AutoShift account.\n"
        f"Your password reset code is: {otp}\n\n"
        f"This code is valid for {OTP_EXPIRE_MINUTES} minutes.\n"
        f"If you did not request this, please ignore this email.\n\n"
        f"Best regards,\nThe AutoShift Team"
    )
    msg.set_content(body)

    try:
        # Connect using standard SMTP (not SMTP_SSL)
        with smtplib.SMTP(config.SMTP_SERVER, config.SMTP_PORT) as server:
            server.ehlo()
            # Upgrade the connection to TLS
            server.starttls()
            server.ehlo()
            # Authenticate
            server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            # Send the email
            server.send_message(msg)
            print(f"Successfully sent OTP email to {email}", flush=True)

    except Exception as e:
        print(f"Failed to send email to {email}. Error: {e}", flush=True)

def verify_and_clear_otp(db: Session, user: models.User, plain_otp: str) -> bool:
    """
    Verifies the provided OTP against the hashed one in the DB and checks expiration.
    If valid, clears the OTP fields to prevent reuse.
    """
    from app.core.security import verify_password # Assuming this exists

    if not user.reset_otp or not user.reset_otp_expires_at:
        return False
        
    # Check expiration
    if datetime.now(timezone.utc) > user.reset_otp_expires_at:
        return False
        
    # Verify the hash
    if not verify_password(plain_otp, user.reset_otp):
        return False
        
    # OTP is valid, clear it so it can't be used again
    user.reset_otp = None
    user.reset_otp_expires_at = None
    db.commit()
    
    return True