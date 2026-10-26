from dataclasses import dataclass
from typing import Optional

@dataclass
class EmployeeHistoricalState:
    """
    In-memory representation of an employee's state from the previous week.
    This data is calculated on-the-fly and passed to the Solver.
    """
    employee_id: int
    # Days worked in a row up to the day before the week
    history_streak: int = 0
    # Night shifts worked in a row up to the day before the week (for the 3-nights penalty)
    trailing_nights: int = 0
    # When the last shift before the week ended, in minutes from 00:00 of the week's first day
    # (negative = before it); None when there was no shift. The rest rules run from it.
    last_shift_end: Optional[int] = None
