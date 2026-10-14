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
}
