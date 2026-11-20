# app/engine/inputs.py
"""
Typed inputs of the engine. Services build them from ORM rows; this module imports nothing but
app.core.enums, so the engine stays free of the DB and HTTP layers.
"""
from dataclasses import dataclass
from typing import Tuple

from app.core.enums import ConstraintType


@dataclass(frozen=True)
class WeeklyConstraintInput:
    """
    One mark on the constraints board: on day_idx the employee cannot work / must work / prefers
    to work one of shift_ids, the shifts of one constraints-board row.
    """
    employee_id: int
    day_idx: int
    shift_ids: Tuple[int, ...]
    type: ConstraintType
