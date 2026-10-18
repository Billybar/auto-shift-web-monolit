from typing import Any, Optional

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.enums import ErrorCode


class AppError(Exception):
    """
    A failure the user can understand and act on (e.g. "this location has no shift definitions").
    Services raise it without knowing about HTTP; the handler below turns it into a JSON response.
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = 400,
        params: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message  # English, developer-facing; clients show their own text for the code
        self.status_code = status_code
        self.params = params or {}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """
    Returns an AppError as {"detail", "code", "params"}.
    `detail` stays a plain string so clients that only read `detail` (e.g. installed mobile builds) keep working.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code.value, "params": exc.params},
    )
