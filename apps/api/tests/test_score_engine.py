# /apps/api/tests/test_score_engine.py
#
# Unit tests for the pure compute function - input validation lives in
# the Pydantic schemas (covered separately by test_scores.py).

from __future__ import annotations

import pytest

from app.services.score_engine import compute


def test_rice_formula():
    score = compute("RICE", {"reach": 1000, "impact": 2, "confidence": 0.8, "effort": 4})
    # (1000 * 2 * 0.8) / 4 = 400
    assert score == 400


def test_rice_rounds_to_two_decimals():
    score = compute("RICE", {"reach": 1000, "impact": 1, "confidence": 0.333, "effort": 7})
    # 1000*1*0.333/7 ≈ 47.5714
    assert score == 47.57


def test_rice_rejects_zero_effort():
    with pytest.raises(ValueError, match="effort"):
        compute("RICE", {"reach": 100, "impact": 1, "confidence": 1, "effort": 0})


def test_ice_formula():
    assert compute("ICE", {"impact": 8, "confidence": 7, "ease": 9}) == 504


def test_value_effort_formula():
    # 8 / 2 = 4
    assert compute("ValueEffort", {"value": 8, "effort": 2}) == 4


def test_value_effort_rejects_zero_effort():
    with pytest.raises(ValueError, match="effort"):
        compute("ValueEffort", {"value": 5, "effort": 0})


@pytest.mark.parametrize(
    "bucket,expected",
    [("Must", 4), ("Should", 3), ("Could", 2), ("Won't", 1)],
)
def test_moscow_ranks(bucket, expected):
    assert compute("MoSCoW", {"bucket": bucket}) == expected


def test_moscow_rejects_unknown_bucket():
    with pytest.raises(ValueError, match="bucket"):
        compute("MoSCoW", {"bucket": "Maybe"})


def test_unknown_framework():
    with pytest.raises(ValueError, match="unknown framework"):
        compute("PIE", {"x": 1})
