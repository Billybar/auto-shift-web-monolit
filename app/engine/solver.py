from ortools.sat.python import cp_model
from app.engine.constraints_manager import ConstraintManager


class ShiftOptimizer:
    def __init__(self, location_id, employees, shifts, demands, weights, weekly_constraints=None):
        self.location_id = location_id
        self.employees = [e for e in employees if e.is_active]
        self.shifts = shifts
        self.demands = demands
        self.weights = weights
        self.weekly_constraints = weekly_constraints or []  # Store constraints safely

        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        self.shift_vars = {}
        self.status = None # Track solver status safely

    def _create_variables(self):
        """Initializes decision variables using DB-based IDs."""
        for emp in self.employees:
            for d in range(7):
                for s_def in self.shifts:
                    # Create a boolean variable: 1 if employee 'emp.id' works shift 's_def.id' on day 'd', else 0
                    self.shift_vars[(emp.id, d, s_def.id)] = self.model.NewBoolVar(
                        f'shift_e{emp.id}_d{d}_s{s_def.id}'
                    )

    def solve(self, employee_settings_dict, employee_states_dict):
        """
        Prepares and solves the model.
        :param employee_settings_dict: Dict mapping emp_id to EmployeeSettings object
        :param employee_states_dict: Dict mapping emp_id to historical state dict
        """
        self._create_variables()

        manager = ConstraintManager(
            self.model, self.shift_vars, self.employees, self.shifts, self.demands, self.weights
        )


        # Apply constraints using the in-memory states dict
        objective_terms = manager.apply_all_constraints(employee_settings_dict, employee_states_dict,
                                                        self.weekly_constraints)
        # Set Objective: Minimize penalties (soft constraints violations)
        self.model.Minimize(sum(objective_terms))

        status = self.solver.Solve(self.model)
        return status

    def get_results_as_dicts(self):
        """Returns the solution in a format ready for DB insertion."""
        assignments = []
        for (emp_id, day, shift_id), var in self.shift_vars.items():
            if self.solver.Value(var):
                assignments.append({
                    "workplace_id": self.location_id,
                    "employee_id": emp_id,
                    "shift_id": shift_id,
                    "day_index": day
                })
        return assignments