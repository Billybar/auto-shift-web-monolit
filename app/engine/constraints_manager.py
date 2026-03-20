from ortools.sat.python import cp_model
from app.core.models import Employee, ShiftDefinition, LocationWeights, EmployeeSettings
from typing import List, Dict


class ConstraintManager:
    def __init__(self, model, shift_vars, employees, shifts, demands, weights, num_days=7):
        self.model = model
        self.shift_vars = shift_vars
        self.employees = employees
        self.shifts = shifts
        self.demands = demands
        self.weights = weights
        self.num_days = num_days

    def apply_all_constraints(self, employee_settings: Dict[int, EmployeeSettings], employee_states: Dict[int, any], weekly_constraints: List[any]):
        """
        Main entry point.
        :param employee_settings: Dictionary mapping employee_id to its settings from DB.
        :param employee_states: Dictionary mapping employee_id to its dynamic state (last week history).
        """
        self._add_hard_constraints(employee_settings, employee_states, weekly_constraints)
        return self._get_objective_terms(employee_settings, employee_states)

    def _add_hard_constraints(self, employee_settings, employee_states, weekly_constraints):
        # 1. Demand Constraint: Every shift must be filled
        for d in range(self.num_days):
            for s_def in self.shifts:
                # Sum of all employees assigned to this specific shift on this day
                shift_total = sum(self.shift_vars[(emp.id, d, s_def.id)] for emp in self.employees)

                # Assume the default is the general number of staff defined for the shift
                required_staff = getattr(s_def, 'default_staff_count', 1)

                # Find if we have a specific demand from the UI
                for dem in self.demands:
                    # Updated field names based on our new DB models
                    if dem.shift_definition_id == s_def.id and dem.day_of_week == d:
                        required_staff = dem.required_employees
                        break

                # CRITICAL BUG FIX: Actually enforce the demand constraint!
                self.model.Add(shift_total == required_staff)

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
                self.model.Add(sum(all_emp_shifts) >= settings.min_shifts_per_week)

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

        # 5. Prevent Back-to-Back Shifts
        # Assuming shifts are ordered chronologically by start time
        for emp in self.employees:
            for d in range(self.num_days - 1):
                if len(self.shifts) > 1:
                    morning_shift_id = self.shifts[0].id
                    # Cannot work any late shift today and then morning shift tomorrow
                    for s_idx in range(1, len(self.shifts)):
                        late_shift_id = self.shifts[s_idx].id
                        self.model.Add(
                            self.shift_vars[(emp.id, d, late_shift_id)] +
                            self.shift_vars[(emp.id, d + 1, morning_shift_id)] <= 1
                        )

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

            state = employee_states.get(emp.id, {})
            streak = state.get('history_streak', 0)

            if streak > 0:
                limit = 7 - streak
                # Apply historical constraint if within current week
                if 0 < limit <= self.num_days:
                    self.model.Add(sum(work_days_vars[0:limit]) < limit)
            else:
                self.model.Add(sum(work_days_vars) < 7)

    def _get_objective_terms(self, employee_settings, employee_states):
        objective_terms = []

        # Mapping all weights from the DB model (LocationWeights) with fallback defaults
        def get_safe_weight(attr_name, default_value):
            val = getattr(self.weights, attr_name, default_value)
            return val if val is not None else default_value

        # Mapping all weights using the safety helper
        w = {
            'REST_GAP': get_safe_weight('rest_gap', 40),
            'TARGET_SHIFTS': get_safe_weight('target_shifts', 40),
            'CONSECUTIVE_NIGHTS': get_safe_weight('consecutive_nights', 100),
            'MAX_NIGHTS': get_safe_weight('max_nights', 50),
            'MAX_MORNINGS': get_safe_weight('max_mornings', 4),
            'MAX_EVENINGS': get_safe_weight('max_evenings', 2),
            'MIN_NIGHTS': get_safe_weight('min_nights', 5),
            'MIN_MORNINGS': get_safe_weight('min_mornings', 4),
            'MIN_EVENINGS': get_safe_weight('min_evenings', 2)
        }

        for emp in self.employees:
            # Map shift IDs assuming chronological order (Morning, Evening, Night)
            morning_shift_id = self.shifts[0].id if len(self.shifts) > 0 else None
            evening_shift_id = self.shifts[1].id if len(self.shifts) > 1 else None
            night_shift_id = self.shifts[2].id if len(self.shifts) > 2 else None

            # 1. History-based rest gap constraints
            state = employee_states.get(emp.id, {})

            if state.get('worked_last_sat_noon', False) and morning_shift_id:
                objective_terms.append(self.shift_vars[(emp.id, 0, morning_shift_id)] * w['REST_GAP'])

            if state.get('worked_last_sat_night', False) and evening_shift_id:
                objective_terms.append(self.shift_vars[(emp.id, 0, evening_shift_id)] * w['REST_GAP'])

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

                # 3. Shift Type Limits (Min/Max Mornings, Evenings, Nights)
                if morning_shift_id:
                    mornings = [self.shift_vars[(emp.id, d, morning_shift_id)] for d in range(self.num_days)]
                    if settings.max_mornings is not None:
                        ex_m = self.model.NewIntVar(0, self.num_days, f'ex_morn_e{emp.id}')
                        self.model.Add(sum(mornings) <= settings.max_mornings + ex_m)
                        objective_terms.append(ex_m * w['MAX_MORNINGS'])
                    if settings.min_mornings is not None:
                        sh_m = self.model.NewIntVar(0, self.num_days, f'sh_morn_e{emp.id}')
                        self.model.Add(sum(mornings) + sh_m >= settings.min_mornings)
                        objective_terms.append(sh_m * w['MIN_MORNINGS'])

                if evening_shift_id:
                    evenings = [self.shift_vars[(emp.id, d, evening_shift_id)] for d in range(self.num_days)]
                    if settings.max_evenings is not None:
                        ex_e = self.model.NewIntVar(0, self.num_days, f'ex_eve_e{emp.id}')
                        self.model.Add(sum(evenings) <= settings.max_evenings + ex_e)
                        objective_terms.append(ex_e * w['MAX_EVENINGS'])
                    if settings.min_evenings is not None:
                        sh_e = self.model.NewIntVar(0, self.num_days, f'sh_eve_e{emp.id}')
                        self.model.Add(sum(evenings) + sh_e >= settings.min_evenings)
                        objective_terms.append(sh_e * w['MIN_EVENINGS'])

                if night_shift_id:
                    nights = [self.shift_vars[(emp.id, d, night_shift_id)] for d in range(self.num_days)]
                    if settings.max_nights is not None:
                        ex_n = self.model.NewIntVar(0, self.num_days, f'ex_night_e{emp.id}')
                        self.model.Add(sum(nights) <= settings.max_nights + ex_n)
                        objective_terms.append(ex_n * w['MAX_NIGHTS'])
                    if settings.min_nights is not None:
                        sh_n = self.model.NewIntVar(0, self.num_days, f'sh_night_e{emp.id}')
                        self.model.Add(sum(nights) + sh_n >= settings.min_nights)
                        objective_terms.append(sh_n * w['MIN_NIGHTS'])

            # 4. Consecutive Nights Penalty (3 nights in a row)
            if night_shift_id:
                # Part A: Check within the current week
                for d in range(self.num_days - 2):
                    is_three_nights = self.model.NewBoolVar(f'3nights_e{emp.id}_d{d}')
                    self.model.AddBoolAnd([
                        self.shift_vars[(emp.id, d, night_shift_id)],
                        self.shift_vars[(emp.id, d + 1, night_shift_id)],
                        self.shift_vars[(emp.id, d + 2, night_shift_id)]
                    ]).OnlyEnforceIf(is_three_nights)

                    self.model.AddBoolOr([
                        self.shift_vars[(emp.id, d, night_shift_id)].Not(),
                        self.shift_vars[(emp.id, d + 1, night_shift_id)].Not(),
                        self.shift_vars[(emp.id, d + 2, night_shift_id)].Not()
                    ]).OnlyEnforceIf(is_three_nights.Not())

                    objective_terms.append(is_three_nights * w['CONSECUTIVE_NIGHTS'])

                # Part B: Check carry-over from the previous week's weekend
                worked_fri = state.get('worked_last_fri_night', False)
                worked_sat = state.get('worked_last_sat_night', False)

                if worked_fri and worked_sat:
                    # Penalize Sunday night if they worked Friday and Saturday nights
                    is_3rd_sun = self.model.NewBoolVar(f'3nights_sun_e{emp.id}')
                    self.model.Add(self.shift_vars[(emp.id, 0, night_shift_id)] == 1).OnlyEnforceIf(is_3rd_sun)
                    self.model.Add(self.shift_vars[(emp.id, 0, night_shift_id)] == 0).OnlyEnforceIf(is_3rd_sun.Not())
                    objective_terms.append(is_3rd_sun * w['CONSECUTIVE_NIGHTS'])

                elif worked_sat:
                    # Penalize Monday night if they worked Saturday and Sunday nights
                    is_3rd_mon = self.model.NewBoolVar(f'3nights_mon_e{emp.id}')
                    self.model.AddBoolAnd([
                        self.shift_vars[(emp.id, 0, night_shift_id)],
                        self.shift_vars[(emp.id, 1, night_shift_id)]
                    ]).OnlyEnforceIf(is_3rd_mon)

                    self.model.AddBoolOr([
                        self.shift_vars[(emp.id, 0, night_shift_id)].Not(),
                        self.shift_vars[(emp.id, 1, night_shift_id)].Not()
                    ]).OnlyEnforceIf(is_3rd_mon.Not())

                    objective_terms.append(is_3rd_mon * w['CONSECUTIVE_NIGHTS'])

        return objective_terms