from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(credentials: LoginRequest):
    """
    Mock login endpoint.
    In production, use OAuth2 with Password (hashing and JWT tokens).
    """
    if credentials.username == "admin" and credentials.password == "admin":
        return {"access_token": "fake-super-secret-token", "token_type": "bearer"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password"
    )