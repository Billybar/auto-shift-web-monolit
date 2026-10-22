from typing import Dict

# Default penalty weights for the solver, used whenever a location has not customized them.
# Single source of truth for LocationWeights (model defaults), the API schema, and the engine fallback.
DEFAULT_LOCATION_WEIGHTS: Dict[str, int] = {
    "target_shifts": 15,
    "rest_gap": 10,
    "consecutive_nights": 20,
    "max_nights": 8,
    "max_mornings": 4,
    "max_evenings": 2,
    "min_nights": 1,
    "min_mornings": 1,
    "min_evenings": 1,
    # Per shift worked in a role other than the employee's primary one
    "secondary_position": 3,
}

# Name of the role every location starts with (and that existing data was migrated to)
DEFAULT_POSITION_NAME = "כללי"
DEFAULT_POSITION_COLOR = "94A3B8"
