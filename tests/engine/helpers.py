from typing import Dict, Optional, Set, Tuple

from app.engine.solver import ShiftOptimizer, SolveResult

# The role every employee holds unless a test says otherwise
DEFAULT_POSITION = 1


def solve(
    employees,
    shifts,
    demand: Dict[tuple, int],
    *,
    weights=None,
    settings: Optional[dict] = None,
    states: Optional[dict] = None,
    constraints: Optional[list] = None,
    positions: Optional[Dict[int, Set[int]]] = None,
    primary: Optional[Dict[int, Optional[int]]] = None,
    num_days: int = 7,
    max_time_seconds: float = 10.0,
) -> SolveResult:
    """
    Runs the full two-phase solve.
    `demand` keys are (shift_id, day_idx, position_id), or (shift_id, day_idx) for DEFAULT_POSITION.
    By default every employee holds DEFAULT_POSITION as their primary role.
    """
    full_demand: Dict[Tuple[int, int, int], int] = {}
    for key, required in demand.items():
        full_demand[key if len(key) == 3 else (*key, DEFAULT_POSITION)] = required
    if positions is None:
        positions = {e.id: {DEFAULT_POSITION} for e in employees}
    if primary is None:
        primary = {e.id: DEFAULT_POSITION for e in employees}

    optimizer = ShiftOptimizer(
        employees, shifts, weights, full_demand, positions, primary,
        weekly_constraints=constraints, num_days=num_days, max_time_seconds=max_time_seconds, num_workers=4,
    )
    return optimizer.solve(settings or {}, states or {})


def worked(result: SolveResult, employee_id: int) -> int:
    """Number of shifts the employee got."""
    return sum(1 for a in result.assignments if a.employee_id == employee_id)
