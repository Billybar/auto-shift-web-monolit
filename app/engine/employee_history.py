from dataclasses import dataclass

@dataclass
class EmployeeHistoricalState:
    """
    In-memory representation of an employee's state from the previous week.
    This data is calculated on-the-fly and passed to the Solver.
    """
    employee_id: int
    history_streak: int = 0
    worked_last_fri_night: bool = False
    worked_last_sat_noon: bool = False
    worked_last_sat_night: bool = False