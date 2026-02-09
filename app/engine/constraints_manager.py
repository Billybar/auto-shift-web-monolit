from ortools.sat.python import cp_model
from models import Employee, ShiftDefinition, WorkplaceWeights, EmployeeSettings
from typing import List, Dict


class ConstraintManager:
    def __init__(self, model, shift_vars, employees, shifts, weights, num_days=7):
        self.model = model
        self.shift_vars = shift_vars
        self.employees = employees
        self.shifts = shifts
        self.weights = weights
        self.num_days = num_days

    def apply_all_constraints(self, employee_settings: Dict[int, EmployeeSettings], employee_states: Dict[int, any]):
        """
        Main entry point.
        :param employee_settings: Dictionary mapping employee_id to its settings from DB.
        :param employee_states: Dictionary mapping employee_id to its dynamic state (last week history).
        """
        self._add_hard_constraints(employee_settings)
        return self._get_objective_terms(employee_settings, employee_states)

    def _add_hard_constraints(self, employee_settings):
        # 1. Demand Constraint: Every shift must be filled
        for d in range(self.num_days):
            for s_def in self.shifts:
                # Sum of all employees assigned to this specific shift on this day
                shift_total = sum(self.shift_vars[(emp.id, d, s_def.id)] for emp in self.employees)
                # Must equal the required number of staff defined in DB
                self.model.Add(shift_total == s_def.num_staff)

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

    def _get_objective_terms(self, employee_settings, employee_states):
        objective_terms = []

        # Mapping to the actual columns in WorkplaceWeights model
        w = {
            'REST_GAP': self.weights.rest_gap,
            'TARGET_SHIFTS': self.weights.target_shifts,
            'CONSECUTIVE': self.weights.consecutive_nights
        }

        for emp in self.employees:
            # Note: We use the attributes directly from the Employee model history fields
            # as defined in models.py

            morning_shift_id = self.shifts[0].id
            evening_shift_id = self.shifts[1].id if len(self.shifts) > 1 else None

            # 1. History-based constraints (from Employee table fields)
            if emp.worked_last_sat_noon:  # From models.py
                # Penalty for working Sunday morning after Saturday noon
                objective_terms.append(self.shift_vars[(emp.id, 0, morning_shift_id)] * w['REST_GAP'])

            if emp.worked_last_sat_night and evening_shift_id:
                # Penalty for working Sunday evening after Saturday night
                objective_terms.append(self.shift_vars[(emp.id, 0, evening_shift_id)] * w['REST_GAP'])

            # 2. Target Shifts Delta calculation
            settings = employee_settings.get(emp.id)
            if settings:
                # Use the logic: target is halfway between min and max from EmployeeSettings
                target = (settings.min_shifts_per_week + settings.max_shifts_per_week) // 2

                all_emp_shifts = [self.shift_vars[(emp.id, d, s.id)] for d in range(self.num_days) for s in self.shifts]
                total_worked = sum(all_emp_shifts)

                delta = self.model.NewIntVar(0, self.num_days, f'delta_target_e{emp.id}')
                self.model.Add(total_worked - target <= delta)
                self.model.Add(target - total_worked <= delta)
                objective_terms.append(delta * w['TARGET_SHIFTS'])

        return objective_terms