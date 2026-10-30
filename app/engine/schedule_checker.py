"""
Checks a finished week (typically edited by hand after auto-assign) against the engine's rules.

Only the hard rules are checked, mirroring ConstraintManager._add_hard_constraints and
CoverageModel; the soft rules of the objective are not. Rest is measured with each row's own hours
(its start/end override, when set). Nothing looks past the end of the week.
"""
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Set, Tuple

from app.core import shift_timing
from app.engine.solver import is_eligible, workable_days

_MUST_WORK = ('must_work', 'MUST_WORK')
_CANNOT_WORK = ('cannot_work', 'CANNOT_WORK')


@dataclass(frozen=True)
class Placement:
    employee_id: int
    shift_id: int
    day_idx: int
    # None when the client didn't send one (installed mobile builds)
    position_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


@dataclass(frozen=True)
class CheckIssue:
    """One broken rule. Only the fields its code needs are set."""
    code: str
    employee_id: int
    # (shift_id, day_idx) of the placements to mark on the board; empty for weekly totals
    cells: Tuple[Tuple[int, int], ...] = ()
    day_idx: Optional[int] = None
    shift_id: Optional[int] = None
    shift_ids: Tuple[int, ...] = ()
    position_id: Optional[int] = None
    rest_minutes: Optional[int] = None
    days: Optional[int] = None
    count: Optional[int] = None
    limit: Optional[int] = None
    # The rest is counted from the employee's last shift of the previous week
    from_previous_week: bool = False


@dataclass
class CheckResult:
    violations: List[CheckIssue] = field(default_factory=list)


def _sort_key(issue: CheckIssue) -> Tuple[int, int, str]:
    days = [d for _, d in issue.cells] or ([issue.day_idx] if issue.day_idx is not None else [])
    return (min(days) if days else -1, issue.employee_id, issue.code)


def check_schedule(
    placements: Iterable[Placement],
    shifts,
    demand: Dict[Tuple[int, int, int], int],
    employee_positions: Dict[int, Set[int]],
    weekly_constraints: List[dict],
    employee_settings: Dict[int, object],
    employee_states: Dict[int, object],
    active_employee_ids: Iterable[int],
    num_days: int = 7,
) -> CheckResult:
    """
    :param placements: the week's rows; day_idx 0..num_days-1
    :param shifts: the location's ShiftDefinitions (raises InvalidShiftHours for invalid hours)
    :param demand, employee_positions, weekly_constraints: as for ShiftOptimizer
    :param employee_settings: employee_id -> EmployeeSettings
    :param employee_states: employee_id -> EmployeeHistoricalState
    :param active_employee_ids: the employees the "must happen" rules (must_work, weekly minimum)
        apply to; rules about the placements apply to whoever is placed
    """
    timings = shift_timing.build_timings(shifts)
    shift_ids = list(timings)
    result = CheckResult()
    violations = result.violations

    by_employee: Dict[int, List[Placement]] = {}
    for p in placements:
        by_employee.setdefault(p.employee_id, []).append(p)

    for emp_id, rows in by_employee.items():
        rows.sort(key=lambda p: (p.day_idx, timings[p.shift_id].start))
        state = employee_states.get(emp_id)
        settings = employee_settings.get(emp_id)

        # At most one shift per work day
        by_day: Dict[int, List[Placement]] = {}
        for p in rows:
            by_day.setdefault(p.day_idx, []).append(p)
        for d, same_day in sorted(by_day.items()):
            if len(same_day) > 1:
                violations.append(CheckIssue(
                    'two_shifts_same_day', emp_id, cells=tuple((p.shift_id, d) for p in same_day), day_idx=d,
                ))

        # Rest between shifts on different days, with each row's own hours
        spans = [
            (p, *shift_timing.placement_span(timings[p.shift_id], p.start_time, p.end_time)) for p in rows
        ]
        for i, (first, _, first_end) in enumerate(spans):
            for second, second_start, _ in spans[i + 1:]:
                if second.day_idx == first.day_idx:
                    continue
                rest = (second.day_idx - first.day_idx) * shift_timing.MINUTES_PER_DAY + second_start - first_end
                if rest < shift_timing.MIN_REST:
                    violations.append(CheckIssue(
                        'short_rest', emp_id,
                        cells=((first.shift_id, first.day_idx), (second.shift_id, second.day_idx)), rest_minutes=rest,
                    ))

        # The same across the week boundary
        if state is not None and state.last_shift_end is not None:
            for p, start, _ in spans:
                rest = p.day_idx * shift_timing.MINUTES_PER_DAY + start - state.last_shift_end
                if rest < shift_timing.MIN_REST:
                    violations.append(CheckIssue(
                        'short_rest', emp_id,
                        cells=((p.shift_id, p.day_idx),), rest_minutes=rest, from_previous_week=True,
                    ))

        # Days in a row, counting the streak at the end of the previous week
        history = state.history_streak if state else 0
        run = history
        for d in range(num_days + 1):
            if d < num_days and d in by_day:
                run += 1
                continue
            if run > shift_timing.MAX_WORK_STREAK and d > 0 and (d - 1) in by_day:
                run_start = d - run
                # Mark the days past the limit
                over = range(max(run_start + shift_timing.MAX_WORK_STREAK, 0), d)
                violations.append(CheckIssue(
                    'work_streak', emp_id,
                    cells=tuple((p.shift_id, day) for day in over for p in by_day[day]),
                    days=run, limit=shift_timing.MAX_WORK_STREAK,
                ))
            run = 0

        # Weekly maximum
        if settings is not None and len(rows) > settings.max_shifts_per_week:
            violations.append(CheckIssue(
                'max_shifts', emp_id, count=len(rows), limit=settings.max_shifts_per_week,
            ))

        # Roles: an employee fills only a role they hold
        held = employee_positions.get(emp_id, set())
        for p in rows:
            if p.position_id is not None and p.position_id not in held:
                violations.append(CheckIssue(
                    'position_not_held', emp_id, cells=((p.shift_id, p.day_idx),),
                    day_idx=p.day_idx, shift_id=p.shift_id, position_id=p.position_id,
                ))

    # Employee requests: blocks always count; a must_work counts as the engine reads it
    placed = {(p.employee_id, p.day_idx, p.shift_id) for rows in by_employee.values() for p in rows}
    active = set(active_employee_ids)
    blocked: Set[Tuple[int, int, int]] = set()
    for c in weekly_constraints:
        emp_id, d, group = c["employee_id"], c["day_idx"], [s for s in c["shift_ids"] if s in timings]
        if not group:
            continue
        if c["type"] in _CANNOT_WORK:
            blocked.update((emp_id, d, s) for s in group)
            for s in group:
                if (emp_id, d, s) in placed:
                    violations.append(CheckIssue(
                        'cannot_work', emp_id, cells=((s, d),), day_idx=d, shift_id=s,
                    ))
        elif c["type"] in _MUST_WORK and emp_id in active:
            # Dropped by the engine when none of the group's shifts needs one of the employee's roles
            if not any(is_eligible(demand, employee_positions, emp_id, d, s) for s in group):
                continue
            if not any((emp_id, d, s) in placed for s in group):
                violations.append(CheckIssue(
                    'must_work_missed', emp_id, day_idx=d, shift_ids=tuple(group),
                ))

    # Weekly minimum, lowered to the days the employee can work, as the engine does
    for emp_id in active:
        settings = employee_settings.get(emp_id)
        if settings is None or not employee_positions.get(emp_id):
            continue
        limit = min(
            settings.min_shifts_per_week,
            workable_days(demand, employee_positions, emp_id, shift_ids, blocked, num_days),
        )
        count = len(by_employee.get(emp_id, ()))
        if count < limit:
            violations.append(CheckIssue('min_shifts', emp_id, count=count, limit=limit))

    violations.sort(key=_sort_key)
    return result
