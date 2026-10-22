from typing import Any, Dict

from app.core.constants import DEFAULT_LOCATION_WEIGHTS


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
