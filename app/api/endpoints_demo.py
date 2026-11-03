"""
Public demo: one-click sandboxes for visitors (only when DEMO_MODE is on; see app/services/demo_service.py).
On any other instance /session and /switch answer 404, and /status says the demo is off.
"""
import logging
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core import config, models, schemas
from app.core.database import get_db
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.services import auth_service, demo_service

logger = logging.getLogger(__name__)

router = APIRouter()

_RATE_WINDOW_SECONDS = 3600

# Sandbox creation times per client IP. In memory: the app runs as a single process
_sessions_by_ip: Dict[str, Deque[float]] = defaultdict(deque)
_sessions_lock = threading.Lock()


def _take_ip_quota(ip: str) -> bool:
    """Records a sandbox for `ip` and returns True, or False when the IP used up its hourly quota."""
    now = time.monotonic()
    with _sessions_lock:
        recent = _sessions_by_ip[ip]
        while recent and now - recent[0] > _RATE_WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= config.DEMO_MAX_SANDBOXES_PER_IP_PER_HOUR:
            return False
        recent.append(now)
        return True


def _client_ip(request: Request) -> str:
    """
    The visitor's IP for the per-IP limit: DEMO_CLIENT_IP_HEADER when the proxy sent it (Cloudflare
    overwrites CF-Connecting-IP, so a visitor can't fake it), else the connection's address.
    """
    if config.DEMO_CLIENT_IP_HEADER:
        forwarded = request.headers.get(config.DEMO_CLIENT_IP_HEADER, "").strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def _ensure_demo_mode() -> None:
    if not config.DEMO_MODE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


@router.get("/status", response_model=schemas.DemoStatusResponse)
def demo_status():
    """Public: tells the web client whether to offer the demo."""
    return {"enabled": config.DEMO_MODE, "sandbox_ttl_hours": config.DEMO_SANDBOX_TTL_HOURS}


@router.post("/session", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def start_demo_session(request: Request, db: Session = Depends(get_db)):
    """
    Public: creates a private, seeded sandbox and returns a token for its manager.
    Limited per client IP and in total (429 demo_limit_reached).
    """
    _ensure_demo_mode()

    if demo_service.count_active(db) >= config.DEMO_MAX_ACTIVE_SANDBOXES:
        logger.warning("Demo sandbox cap reached")
        raise AppError(ErrorCode.DEMO_LIMIT_REACHED, "Too many demo sandboxes, try again later", status_code=429)

    if not _take_ip_quota(_client_ip(request)):
        raise AppError(ErrorCode.DEMO_LIMIT_REACHED, "Too many demo sandboxes from this address, try again later", status_code=429)

    manager = demo_service.create_sandbox(db)
    logger.info(f"Demo sandbox created: organization {manager.organization_id}")
    return auth_service.issue_token(manager)


@router.post("/switch", response_model=schemas.Token)
def switch_demo_role(
    payload: schemas.DemoSwitchRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns a token for the manager or an employee of the caller's own sandbox,
    so a visitor can see both sides of the app. 404 outside a sandbox.
    """
    _ensure_demo_mode()

    target = demo_service.switch_role(db, current_user, payload.role)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo user not found")
    return auth_service.issue_token(target)
