from typing import Any, Dict, Optional

from app.core.constants import DEFAULT_LOCATION_WEIGHTS, SOFT_PREFERENCE_MULTIPLIER
from app.core.enums import SoftPreference


def resolve_weights(weights: Any) -> Dict[str, int]:
    """
    Returns every penalty weight by name (the keys of DEFAULT_LOCATION_WEIGHTS).
    `weights` may be a LocationWeights row, a dict, or None; a missing or None value falls back
    to the default (an unsaved LocationWeights() has None in every column it was not given).
    """
    resolved: Dict[str, int] = {}
    for name, default in DEFAULT_LOCATION_WEIGHTS.items():
        value = weights.get(name) if isinstance(weights, dict) else getattr(weights, name, None)
        resolved[name] = value if value is not None else default
    return resolved


def personal_weight(base: int, level: Optional[SoftPreference]) -> int:
    """
    The location's weight scaled by one employee's preference level (a whole multiplier, so the
    result stays an integer for the CP-SAT objective). No level (no settings row) counts as 'normal'.
    """
    multiplier = SOFT_PREFERENCE_MULTIPLIER[SoftPreference(level) if level is not None else SoftPreference.NORMAL]
    return base * multiplier
