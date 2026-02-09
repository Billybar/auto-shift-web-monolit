from ortools.sat.python import cp_model
from constraints_manager import ConstraintManager


class ShiftOptimizer:
    def __init__(self, workplace_id, employees, shifts, weights):
        self.workplace_id = workplace_id
        self.employees = [e for e in employees if e.is_active]
        self.shifts = shifts
        self.weights = weights

        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        self.shift_vars = {}

    def _create_variables(self):
        """Initializes decision variables using DB-based IDs."""
        for emp in self.employees:
            for d in range(7):
                for s_def in self.shifts:
                    self.shift_vars[(emp.id, d, s_def.id)] = self.model.NewBoolVar(
                        f'shift_e{emp.id}_d{d}_s{s_def.id}'
                    )

    def solve(self, employee_settings_dict):
        """
        Prepares and solves the model.
        :param employee_settings_dict: Dict mapping emp_id to EmployeeSettings object
        """
        self._create_variables()

        manager = ConstraintManager(
            self.model, self.shift_vars, self.employees, self.shifts, self.weights
        )

        # Apply constraints and get objective terms
        # We no longer need a separate 'states' dict if we use fields from the Employee objects
        objective_terms = manager.apply_all_constraints(employee_settings_dict, {})

        # Set Objective: Minimize penalties
        self.model.Minimize(sum(objective_terms))

        status = self.solver.Solve(self.model)
        return status

    def get_results_as_dicts(self):
        """Returns the solution in a format ready for DB insertion."""
        assignments = []
        for (emp_id, day, shift_id), var in self.shift_vars.items():
            if self.solver.Value(var):
                assignments.append({
                    "workplace_id": self.workplace_id,
                    "employee_id": emp_id,
                    "shift_id": shift_id,
                    "day_index": day
                })
        return assignments