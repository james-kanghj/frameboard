import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_rice_score_basic():
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": "FEAT-001",
            "reach": 1000,
            "impact": 2,
            "confidence": 0.8,
            "effort": 4,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["framework"] == "RICE"
    assert data["score"] == 400.0
    assert data["item_id"] == "FEAT-001"


def test_rice_rejects_zero_effort():
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": "FEAT-002",
            "reach": 1000,
            "impact": 2,
            "confidence": 0.8,
            "effort": 0,
        },
    )
    assert response.status_code == 422


def test_ice_score_basic():
    response = client.post(
        "/v1/score/ice",
        json={
            "item_id": "FEAT-003",
            "impact": 8,
            "confidence": 7,
            "ease": 6,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["framework"] == "ICE"
    assert data["score"] == 336.0


@pytest.mark.parametrize("confidence", [-0.1, 1.5, 2.0])
def test_rice_rejects_invalid_confidence(confidence):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": "FEAT-004",
            "reach": 1000,
            "impact": 1,
            "confidence": confidence,
            "effort": 1,
        },
    )
    assert response.status_code == 422


def test_healthcheck():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
