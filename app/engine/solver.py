import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from ortools.sat.python import cp_model

from app.engine.constraints_manager import ConstraintManager
from app.engine.coverage import CoverageModel, EngineAssignment, EngineShortage
from app.engine.weights import resolve_weights

logger = logging.getLogger(__name__)

_MUST_WORK = ('must_work', 'MUST_WORK')
_CANNOT_WORK = ('cannot_work', 'CANNOT_WORK')


@dataclass(frozen=True)
class IgnoredMustWork:
    """
    A MUST_WORK request dropped because the employee holds no role any of its shifts needs that day.
    shift_id is the request's first shift.
    """
    employee_id: int
    shift_id: int
    day_idx: int


@dataclass(frozen=True)
class LoweredMinShifts:
    """An employee's weekly minimum, lowered to the number of days they can actually work."""
    employee_id: int
    requested: int
    applied: int


@dataclass
class SolveResult:
    # 'OPTIMAL' | 'FEASIBLE' | 'FAILED'
    status: str
    assignments: List[EngineAssignment] = field(default_factory=list)
    unfilled: List[EngineShortage] = field(default_factory=list)
    # Total penalty of the returned schedule (lower is better); None when FAILED
    penalty: Optional[int] = None
    # Why FAILED: 'infeasible' (the hard rules contradict each other) or 'time_limit'
    failure_reason: Optional[str] = None
    skipped_employee_ids: List[int] = field(default_factory=list)
    ignored_must_work: List[IgnoredMustWork] = field(default_factory=list)
    lowered_min_shifts: List[LoweredMinShifts] = field(default_factory=list)


class ShiftOptimizer:
    """
    Builds and solves the weekly CP-SAT model.

    The solve has two phases, so filling the demand always comes first regardless of how large the
    penalties grow: phase 1 minimizes the number of unfilled role slots (S1); phase 2 keeps
    Σshort ≤ S1 and minimizes the penalties, starting from phase 1's solution.
    """

    def __init__(
        self,
        employees,
        shifts,
        weights,
        demand: Dict[Tuple[int, int, int], int],
        employee_positions: Dict[int, Set[int]],
        primary_position: Dict[int, Optional[int]],
        weekly_constraints: Optional[list] = None,
        num_days: int = 7,
        max_time_seconds: float = 60.0,
        num_workers: int = 8,
    ):
        """
        :param shifts: ShiftDefinitions with valid hours, in any order (the rules read each shift's hours)
        :param demand: (shift_id, day_idx, position_id) -> required employees; only active roles
        :param employee_positions: employee_id -> the active roles the employee holds
        :param primary_position: employee_id -> their primary role, or None
        :param weekly_constraints: dicts with employee_id, day_idx, shift_ids (the shifts of one
            constraints-board row), type. must_work means one of the shifts
        """
        self.employees = [e for e in employees if getattr(e, 'is_active', True)]
        self.shifts = shifts
        self.weights = weights
        self.demand = demand
        self.employee_positions = employee_positions
        self.primary_position = primary_position
        self.weekly_constraints = weekly_constraints or []
        self.num_days = num_days
        self.max_time_seconds = max_time_seconds
        self.num_workers = num_workers

    def _eligible(self, employee_id: int, day_idx: int, shift_id: int) -> bool:
        """True when the employee holds a role this shift needs on this day."""
        return any(
            self.demand.get((shift_id, day_idx, p), 0) > 0 for p in self.employee_positions.get(employee_id, ())
        )

    def _new_solver(self, time_limit: float) -> cp_model.CpSolver:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(time_limit, 0.1)
        solver.parameters.num_workers = self.num_workers
        return solver

    def solve(self, employee_settings: Dict[int, object], employee_states: Dict[int, object]) -> SolveResult:
        """
        :param employee_settings: employee_id -> EmployeeSettings
        :param employee_states: employee_id -> EmployeeHistoricalState
        """
        # --- Inputs the model can't satisfy are dropped up front, and reported ---
        staffable = [e for e in self.employees if self.employee_positions.get(e.id)]
        staffable_ids = {e.id for e in staffable}
        skipped = [e.id for e in self.employees if e.id not in staffable_ids]

        constraints, ignored = [], []
        blocked: Set[Tuple[int, int, int]] = set()
        for c in self.weekly_constraints:
            emp_id, day_idx, shift_ids = c["employee_id"], c["day_idx"], c["shift_ids"]
            if emp_id not in staffable_ids or not shift_ids:
                continue
            if c["type"] in _MUST_WORK:
                # "Works one of these shifts", over the shifts that need one of the employee's roles
                eligible = [s for s in shift_ids if self._eligible(emp_id, day_idx, s)]
                if not eligible:
                    ignored.append(IgnoredMustWork(employee_id=emp_id, shift_id=shift_ids[0], day_idx=day_idx))
                    continue
                c = {**c, "shift_ids": eligible}
            if c["type"] in _CANNOT_WORK:
                blocked.update((emp_id, day_idx, s) for s in shift_ids)
            constraints.append(c)

        caps, lowered = {}, []
        for emp in staffable:
            workable_days = sum(
                1 for d in range(self.num_days)
                if any(self._eligible(emp.id, d, s.id) and (emp.id, d, s.id) not in blocked for s in self.shifts)
            )
            caps[emp.id] = workable_days
            settings = employee_settings.get(emp.id)
            if settings is not None and settings.min_shifts_per_week > workable_days:
                lowered.append(LoweredMinShifts(emp.id, settings.min_shifts_per_week, workable_days))

        # --- Model ---
        model = cp_model.CpModel()
        shift_vars = {
            (emp.id, d, s.id): model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s.id}')
            for emp in staffable for d in range(self.num_days) for s in self.shifts
        }
        coverage = CoverageModel(
            model, shift_vars, staffable_ids, [s.id for s in self.shifts],
            self.demand, self.employee_positions, self.num_days,
        )
        manager = ConstraintManager(
            model, shift_vars, staffable, self.shifts, self.weights,
            num_days=self.num_days, min_shift_caps=caps,
        )
        penalty_terms = manager.apply_all_constraints(employee_settings, employee_states, constraints)
        penalty_terms += coverage.secondary_terms(
            self.primary_position, resolve_weights(self.weights)['secondary_position']
        )
        penalty = sum(penalty_terms)
        total_short = coverage.total_shortage()

        result = SolveResult(
            status='FAILED', skipped_employee_ids=skipped, ignored_must_work=ignored, lowered_min_shifts=lowered
        )
        started = time.monotonic()

        # --- Phase 1: fill as many role slots as possible ---
        model.minimize(total_short)
        phase1 = self._new_solver(self.max_time_seconds / 2)
        status1 = phase1.solve(model)
        if status1 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            result.failure_reason = 'infeasible' if status1 == cp_model.INFEASIBLE else 'time_limit'
            logger.info(f"Phase 1 found no schedule (status {phase1.status_name(status1)})")
            return result
        min_short = int(round(phase1.value(total_short)))
        result.assignments, result.unfilled = coverage.extract(phase1)
        # Phase 1 doesn't minimize the penalties, so this is only an upper bound for a fallback
        result.penalty = int(round(phase1.value(penalty)))
        result.status = 'FEASIBLE'

        # --- Phase 2: best quality without leaving more slots empty ---
        model.add(total_short <= min_short)
        model.clear_hints()
        for index in range(len(model.proto.variables)):
            var = model.get_int_var_from_proto_index(index)
            model.add_hint(var, phase1.value(var))
        model.minimize(penalty)
        remaining = self.max_time_seconds - (time.monotonic() - started)
        phase2 = self._new_solver(remaining)
        status2 = phase2.solve(model)
        if status2 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.warning(f"Phase 2 found no schedule (status {phase2.status_name(status2)}); using phase 1's")
            return result

        result.assignments, result.unfilled = coverage.extract(phase2)
        result.penalty = int(round(phase2.objective_value))
        both_optimal = status1 == cp_model.OPTIMAL and status2 == cp_model.OPTIMAL
        result.status = 'OPTIMAL' if both_optimal else 'FEASIBLE'
        logger.info(f"Solved: {result.status}, unfilled slots {min_short}, penalty {result.penalty}")
        return result
