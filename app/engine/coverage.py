from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set, Tuple

from ortools.sat.python import cp_model


@dataclass(frozen=True)
class EngineAssignment:
    employee_id: int
    shift_id: int
    position_id: int
    day_idx: int


@dataclass(frozen=True)
class EngineShortage:
    """A role slot the solver could not fill: `missing` people short of the demand."""
    shift_id: int
    position_id: int
    day_idx: int
    missing: int


class CoverageModel:
    """
    The role layer on top of the shift variables y[(e, d, s)].

    x[(e, d, s, p)] = 1 when employee e fills role p in shift s on day d. It exists only where p is
    one of e's roles and the shift needs that role that day, and Σ_p x = y, so an employee fills
    exactly one role in each shift they work. Every hard rule and penalty keeps working on y.

    Coverage per (s, d, p): Σ_e x + short == demand, with short in [0, demand]. Slots can stay
    empty (reported as shortages) but a shift is never staffed above its demand.
    """

    def __init__(
        self,
        model: cp_model.CpModel,
        shift_vars: Dict[Tuple[int, int, int], cp_model.IntVar],
        employee_ids: Iterable[int],
        shift_ids: Iterable[int],
        demand: Dict[Tuple[int, int, int], int],
        employee_positions: Dict[int, Set[int]],
        num_days: int,
    ):
        self.model = model
        self.role_vars: Dict[Tuple[int, int, int, int], cp_model.IntVar] = {}
        self.shortages: Dict[Tuple[int, int, int], cp_model.IntVar] = {}

        shift_ids = list(shift_ids)
        shift_id_set = set(shift_ids)
        positions_needed: Dict[Tuple[int, int], List[int]] = {}
        for (s, d, p), required in sorted(demand.items()):
            if required > 0 and s in shift_id_set and 0 <= d < num_days:
                positions_needed.setdefault((s, d), []).append(p)

        for e in employee_ids:
            roles = employee_positions.get(e, set())
            for d in range(num_days):
                for s in shift_ids:
                    y = shift_vars[(e, d, s)]
                    eligible = [p for p in positions_needed.get((s, d), []) if p in roles]
                    if not eligible:
                        model.Add(y == 0)
                        continue
                    xs = []
                    for p in eligible:
                        x = model.NewBoolVar(f'role_e{e}_d{d}_s{s}_p{p}')
                        self.role_vars[(e, d, s, p)] = x
                        xs.append(x)
                    model.Add(sum(xs) == y)

        filled: Dict[Tuple[int, int, int], List[cp_model.IntVar]] = {}
        for (e, d, s, p), x in self.role_vars.items():
            filled.setdefault((s, d, p), []).append(x)

        for (s, d), positions in positions_needed.items():
            for p in positions:
                required = demand[(s, d, p)]
                short = model.NewIntVar(0, required, f'short_s{s}_d{d}_p{p}')
                model.Add(sum(filled.get((s, d, p), [])) + short == required)
                self.shortages[(s, d, p)] = short

    def total_shortage(self) -> cp_model.LinearExpr:
        return sum(self.shortages.values())

    def secondary_terms(self, primary_position: Dict[int, Optional[int]], weight: int) -> list:
        """
        Penalty terms for shifts worked outside the employee's primary role.
        Employees without a primary role are never penalized.
        """
        if weight <= 0:
            return []
        terms = []
        for (e, d, s, p), x in self.role_vars.items():
            primary = primary_position.get(e)
            if primary is not None and p != primary:
                terms.append(x * weight)
        return terms

    def extract(self, solver: cp_model.CpSolver) -> Tuple[List[EngineAssignment], List[EngineShortage]]:
        """Reads the solution: who fills which role where, and which slots stayed empty."""
        assignments = [
            EngineAssignment(employee_id=e, shift_id=s, position_id=p, day_idx=d)
            for (e, d, s, p), x in self.role_vars.items()
            if solver.Value(x)
        ]
        shortages = []
        for (s, d, p), short in self.shortages.items():
            missing = solver.Value(short)
            if missing > 0:
                shortages.append(EngineShortage(shift_id=s, position_id=p, day_idx=d, missing=missing))
        return assignments, shortages
