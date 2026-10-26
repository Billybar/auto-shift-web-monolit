from ortools.sat.python import cp_model
from app.core import shift_timing
from app.core.enums import ShiftCategory
from app.core.models import Employee, ShiftDefinition, LocationWeights, EmployeeSettings
from app.engine.weights import resolve_weights
from typing import List, Dict, Optional, Tuple

# The soft limits per shift category: EmployeeSettings attributes, which are also the weight names
CATEGORY_LIMITS = (
    (ShiftCategory.MORNING, 'min_mornings', 'max_mornings'),
    (ShiftCategory.EVENING, 'min_evenings', 'max_evenings'),
    (ShiftCategory.NIGHT, 'min_nights', 'max_nights'),
)


class ConstraintManager:
    """
    Hard rules and penalty terms over the shift variables y[(employee_id, day_idx, shift_id)].
    Demand coverage is not handled here; see CoverageModel.
    Shifts are read by their hours only (see app/core/shift_timing.py), so a location can have
    any number of them, in any order.
    """

    def __init__(self, model, shift_vars, employees, shifts, weights, num_days=7, min_shift_caps: Optional[Dict[int, int]] = None):
        """
        :param shifts: ShiftDefinitions with valid hours (raises InvalidShiftHours otherwise)
        :param min_shift_caps: employee_id -> the most shifts the employee can work this week;
            the hard weekly minimum is lowered to it so it can't make the model infeasible.
        """
        self.model = model
        self.shift_vars = shift_vars
        self.employees = employees
        self.shifts = shifts
        self.weights = weights
        self.num_days = num_days
        self.min_shift_caps = min_shift_caps or {}
        self.timings = shift_timing.build_timings(shifts)
        self.rest = shift_timing.rest_rules(self.timings.values())
        self.shifts_by_category: Dict[ShiftCategory, List[int]] = {category: [] for category in ShiftCategory}
        for timing in self.timings.values():
            self.shifts_by_category[timing.category].append(timing.shift_id)

    def apply_all_constraints(self, employee_settings: Dict[int, EmployeeSettings], employee_states: Dict[int, any], weekly_constraints: List[any]):
        """
        Main entry point.
        :param employee_settings: Dictionary mapping employee_id to its settings from DB.
        :param employee_states: Dictionary mapping employee_id to its dynamic state (last week history).
        """
        self._add_hard_constraints(employee_settings, employee_states, weekly_constraints)
        return self._get_objective_terms(employee_settings, employee_states)

    def _all_of(self, literals, name: str):
        """A BoolVar that is 1 exactly when every literal is 1."""
        all_true = self.model.NewBoolVar(name)
        self.model.AddBoolAnd(literals).OnlyEnforceIf(all_true)
        self.model.AddBoolOr([literal.Not() for literal in literals]).OnlyEnforceIf(all_true.Not())
        return all_true

    def _category_on_day(self, emp_id: int, d: int, category: ShiftCategory):
        """1 when the employee works a shift of `category` on day d (at most one, by the daily limit)."""
        shift_ids = self.shifts_by_category[category]
        if len(shift_ids) == 1:
            return self.shift_vars[(emp_id, d, shift_ids[0])]
        works = self.model.NewBoolVar(f'{category.value}_e{emp_id}_d{d}')
        self.model.Add(works == sum(self.shift_vars[(emp_id, d, s)] for s in shift_ids))
        return works

    def _rest_after_last_week(self, state) -> List[Tuple[int, int, int]]:
        """
        (day_idx, shift_id, rest in minutes) for each shift of this week that starts less than
        SHORT_REST after the employee's last shift of last week ended.
        """
        if state is None or state.last_shift_end is None:
            return []
        short = []
        for d in range(self.num_days):
            for shift_id, timing in self.timings.items():
                rest = d * shift_timing.MINUTES_PER_DAY + timing.start - state.last_shift_end
                if rest < shift_timing.SHORT_REST:
                    short.append((d, shift_id, rest))
        return short

    def _add_hard_constraints(self, employee_settings, employee_states, weekly_constraints):
        # 1. Demand coverage lives in CoverageModel (per role, with reported shortages)

        # 2. Daily Limit: One shift per day per employee
        for emp in self.employees:
            for d in range(self.num_days):
                self.model.Add(sum(self.shift_vars[(emp.id, d, s.id)] for s in self.shifts) <= 1)

        # 3. Weekly Limits (from EmployeeSettings)
        for emp in self.employees:
            settings = employee_settings.get(emp.id)
            if settings:
                all_emp_shifts = [self.shift_vars[(emp.id, d, s.id)] for d in range(self.num_days) for s in self.shifts]
                self.model.Add(sum(all_emp_shifts) <= settings.max_shifts_per_week)
                min_shifts = settings.min_shifts_per_week
                if emp.id in self.min_shift_caps:
                    min_shifts = min(min_shifts, self.min_shift_caps[emp.id])
                self.model.Add(sum(all_emp_shifts) >= min_shifts)

        # 4. Enforce Specific Weekly Employee Constraints (Time-offs / Blocks)
        if weekly_constraints:
            for constraint in weekly_constraints:
                emp_id = constraint["employee_id"]
                day_idx = constraint["day_idx"]
                shift_id = constraint["shift_id"]
                c_type = constraint["type"]

                # Ensure the constraint matches our shift variables
                if (emp_id, day_idx, shift_id) in self.shift_vars:
                    # Handle lowercase enum values or uppercase fallbacks
                    if c_type in ('cannot_work', 'CANNOT_WORK'):
                        # Hard block: Employee cannot be assigned to this shift
                        self.model.Add(self.shift_vars[(emp_id, day_idx, shift_id)] == 0)
                    elif c_type in ('must_work', 'MUST_WORK'):
                        # Forced assignment: Employee must work this shift
                        self.model.Add(self.shift_vars[(emp_id, day_idx, shift_id)] == 1)

        for emp in self.employees:
            # 5. Minimum rest: no two shifts less than MIN_REST apart (e.g. night, then the next morning)
            for first, second, offset in self.rest.hard:
                for d in range(self.num_days - offset):
                    self.model.Add(
                        self.shift_vars[(emp.id, d, first)] + self.shift_vars[(emp.id, d + offset, second)] <= 1
                    )

            # 5b. The same across the week boundary, from the end of the employee's last shift last week
            for d, shift_id, rest in self._rest_after_last_week(employee_states.get(emp.id)):
                if rest < shift_timing.MIN_REST:
                    self.model.Add(self.shift_vars[(emp.id, d, shift_id)] == 0)

        # 6. Max Work Streak (Maximum 7 consecutive working days, considering history)
        for emp in self.employees:
            work_days_vars = []
            for d in range(self.num_days):
                is_working_day = self.model.NewBoolVar(f'working_day_e{emp.id}_d{d}')
                # True if employee works any shift on day 'd'
                self.model.Add(sum(self.shift_vars[(emp.id, d, s.id)] for s in self.shifts) > 0).OnlyEnforceIf(
                    is_working_day)
                self.model.Add(sum(self.shift_vars[(emp.id, d, s.id)] for s in self.shifts) == 0).OnlyEnforceIf(
                    is_working_day.Not())
                work_days_vars.append(is_working_day)

            state = employee_states.get(emp.id)
            streak = state.history_streak if state else 0

            if streak > 0:
                limit = 7 - streak
                # Apply historical constraint if within current week
                if 0 < limit <= self.num_days:
                    self.model.Add(sum(work_days_vars[0:limit]) < limit)
            else:
                self.model.Add(sum(work_days_vars) < 7)

    def _get_objective_terms(self, employee_settings, employee_states):
        objective_terms = []

        # All weights from the DB model (LocationWeights), with fallback defaults
        w = {name.upper(): value for name, value in resolve_weights(self.weights).items()}

        for emp in self.employees:
            state = employee_states.get(emp.id)

            # 1. Short rest: MIN_REST to SHORT_REST between two shifts (e.g. evening, then the next morning)
            for first, second, offset in self.rest.soft:
                for d in range(self.num_days - offset):
                    short_rest = self._all_of(
                        [self.shift_vars[(emp.id, d, first)], self.shift_vars[(emp.id, d + offset, second)]],
                        f'short_rest_e{emp.id}_d{d}_s{first}_s{second}',
                    )
                    objective_terms.append(short_rest * w['REST_GAP'])

            # The same across the week boundary (the shorter gaps are blocked in the hard rules)
            for d, shift_id, rest in self._rest_after_last_week(state):
                if rest >= shift_timing.MIN_REST:
                    objective_terms.append(self.shift_vars[(emp.id, d, shift_id)] * w['REST_GAP'])

            # Variables needed for subsequent calculations
            settings = employee_settings.get(emp.id)
            if settings:
                # 2. Target Shifts Delta calculation
                # Use explicit target_shifts if available, otherwise fallback to the average
                target = settings.target_shifts if getattr(settings, 'target_shifts', None) is not None else (settings.min_shifts_per_week + settings.max_shifts_per_week) // 2

                all_emp_shifts = [self.shift_vars[(emp.id, d, s.id)] for d in range(self.num_days) for s in self.shifts]
                total_worked = sum(all_emp_shifts)

                delta = self.model.NewIntVar(0, self.num_days, f'delta_target_e{emp.id}')
                self.model.Add(total_worked - target <= delta)
                self.model.Add(target - total_worked <= delta)
                objective_terms.append(delta * w['TARGET_SHIFTS'])

                # 3. Shift category limits (min/max mornings, evenings, nights), over every shift of the
                # category; skipped when the location has none, so they can't add a constant penalty
                for category, min_attr, max_attr in CATEGORY_LIMITS:
                    shift_ids = self.shifts_by_category[category]
                    if not shift_ids:
                        continue
                    worked = sum(self.shift_vars[(emp.id, d, s)] for d in range(self.num_days) for s in shift_ids)
                    # Negative limits (the API doesn't reject them) are read as 0
                    max_value = getattr(settings, max_attr)
                    if max_value is not None:
                        excess = self.model.NewIntVar(0, self.num_days, f'{max_attr}_excess_e{emp.id}')
                        self.model.Add(worked <= max(max_value, 0) + excess)
                        objective_terms.append(excess * w[max_attr.upper()])
                    min_value = getattr(settings, min_attr)
                    if min_value is not None:
                        shortage = self.model.NewIntVar(0, max(min_value, 0), f'{min_attr}_shortage_e{emp.id}')
                        self.model.Add(worked + shortage >= min_value)
                        objective_terms.append(shortage * w[min_attr.upper()])

            # 4. Consecutive Nights Penalty (3 nights in a row, of any night shift)
            if self.shifts_by_category[ShiftCategory.NIGHT]:
                nights = [self._category_on_day(emp.id, d, ShiftCategory.NIGHT) for d in range(self.num_days)]

                # Part A: Check within the current week
                for d in range(self.num_days - 2):
                    is_three_nights = self._all_of(nights[d:d + 3], f'3nights_e{emp.id}_d{d}')
                    objective_terms.append(is_three_nights * w['CONSECUTIVE_NIGHTS'])

                # Part B: Carry-over from the nights in a row at the end of the previous week
                trailing = state.trailing_nights if state else 0
                if trailing >= 2 and self.num_days >= 1:
                    # The last two nights of last week, then the first night of this week
                    objective_terms.append(nights[0] * w['CONSECUTIVE_NIGHTS'])
                if trailing >= 1 and self.num_days >= 2:
                    # The last night of last week, then the first two nights of this week
                    is_three_nights = self._all_of(nights[0:2], f'3nights_carryover_e{emp.id}')
                    objective_terms.append(is_three_nights * w['CONSECUTIVE_NIGHTS'])

        return objective_terms
