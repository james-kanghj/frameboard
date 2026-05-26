# /apps/api/app/services/score_engine.py
#
# Pure computation: takes a framework + an already-validated inputs dict
# and returns the numeric score. Input validation lives in the Pydantic
# schemas (one per framework) so this module stays small and dependency-
# free. Adding a new framework means: extend the Framework Literal,
# add a schema + branch here, and the rest of the API picks it up.

from __future__ import annotations

from typing import Any

# Numeric proxy values used to sort MoSCoW items on the board - higher
# = higher priority. Not exposed to the UI; the UI displays the label.
MOSCOW_RANKS: dict[str, int] = {
    "Must": 4,
    "Should": 3,
    "Could": 2,
    "Won't": 1,
}


def compute(framework: str, inputs: dict[str, Any]) -> float:
    """Returns the numeric score for the given framework. Raises ValueError
    for unknown frameworks or invalid input combinations that slip past
    schema validation (defensive - schemas should already have caught these)."""
    if framework == "RICE":
        reach = float(inputs["reach"])
        impact = float(inputs["impact"])
        confidence = float(inputs["confidence"])
        effort = float(inputs["effort"])
        if effort <= 0:
            raise ValueError("effort must be > 0")
        return round((reach * impact * confidence) / effort, 2)

    if framework == "ICE":
        impact = float(inputs["impact"])
        confidence = float(inputs["confidence"])
        ease = float(inputs["ease"])
        # ICE uses 1–10 scales; product (max 1000) is the score.
        return round(impact * confidence * ease, 2)

    if framework == "ValueEffort":
        value = float(inputs["value"])
        effort = float(inputs["effort"])
        if effort <= 0:
            raise ValueError("effort must be > 0")
        return round(value / effort, 2)

    if framework == "MoSCoW":
        bucket = str(inputs["bucket"])
        if bucket not in MOSCOW_RANKS:
            raise ValueError(
                f"bucket must be one of {list(MOSCOW_RANKS)}, got {bucket!r}"
            )
        # No formula - bucket maps to a numeric rank for sortability.
        return float(MOSCOW_RANKS[bucket])

    raise ValueError(f"unknown framework: {framework!r}")
