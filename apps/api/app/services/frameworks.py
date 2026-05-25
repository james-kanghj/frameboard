# /apps/api/app/services/frameworks.py
#
# Single source of truth for the set of prioritization frameworks the API
# understands. Both the workspace.framework column constraint and the
# scoring-input validators read from here, so adding a new framework is a
# matter of updating this file + score_engine.py.

from __future__ import annotations

from typing import Literal, get_args

Framework = Literal["RICE", "ICE", "MoSCoW", "ValueEffort"]

SUPPORTED_FRAMEWORKS: tuple[str, ...] = get_args(Framework)
DEFAULT_FRAMEWORK: Framework = "RICE"


def is_supported(name: str) -> bool:
    return name in SUPPORTED_FRAMEWORKS
