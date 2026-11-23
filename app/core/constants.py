from typing import Dict, Tuple

from app.core.enums import SoftPreference

# Default penalty weights for the solver, used whenever a location has not customized them.
# Single source of truth for LocationWeights (model defaults), the API schema, and the engine fallback.
DEFAULT_LOCATION_WEIGHTS: Dict[str, int] = {
    "target_shifts": 15,
    "rest_gap": 10,
    # Per pair of short rests in a row (e.g. night, evening, then morning), on top of rest_gap for each
    "two_rest_gaps": 15,
    # Per run of 3 nights in a row
    "consecutive_nights": 20,
    # Per pair of nights in a row; a 3-night run also counts as 2 pairs, on top of consecutive_nights
    "two_consecutive_nights": 10,
    "max_nights": 8,
    "max_mornings": 4,
    "max_evenings": 2,
    "min_nights": 1,
    "min_mornings": 1,
    "min_evenings": 1,
    # Per shift worked in a role other than the employee's primary one
    "secondary_position": 3,
    # Per "prefer to work" mark the employee didn't get. Keep it below target_shifts, so a preference
    # changes which shifts an employee gets, not how many
    "prefer_to": 5,
}

# Each employee's level scales the location's weight for them. Keep the multipliers whole numbers:
# the CP-SAT objective needs integers, and a fraction of a small weight (e.g. 1 × 0.5) would be
# rounded away
SOFT_PREFERENCE_MULTIPLIER: Dict[SoftPreference, int] = {
    SoftPreference.DONT_CARE: 0,
    SoftPreference.NORMAL: 1,
    SoftPreference.PREFER_NOT: 2,
    SoftPreference.AVOID: 4,
}

# The weights an employee can scale: (EmployeeSettings attribute, LocationWeights name)
PERSONAL_WEIGHTS: Tuple[Tuple[str, str], ...] = (
    ("rest_gap_pref", "rest_gap"),
    ("two_rest_gaps_pref", "two_rest_gaps"),
    ("two_consecutive_nights_pref", "two_consecutive_nights"),
    ("consecutive_nights_pref", "consecutive_nights"),
)

# Name of the role every location starts with (and that existing data was migrated to)
DEFAULT_POSITION_NAME = "כללי"
DEFAULT_POSITION_COLOR = "94A3B8"
