from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import get_db
from dependencies.auth_dependency import get_current_user
from routes import sessions


class FakeDB:
    def rollback(self) -> None:
        return None


def _build_client(current_user_id: uuid.UUID) -> TestClient:
    app = FastAPI()
    app.include_router(sessions.router)

    fake_db = FakeDB()
    current_user = SimpleNamespace(id=current_user_id)

    app.dependency_overrides[get_db] = lambda: fake_db
    app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(app)


def _session_stub(*, session_id: uuid.UUID, creator_id: uuid.UUID, location_id: uuid.UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=session_id,
        location_id=location_id,
        creator_id=creator_id,
        title="Algorithms Review",
        max_participants=6,
        created_at=datetime.now(timezone.utc),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=2),
        is_active=True,
        current_usage_percent=25,
        participants=[SimpleNamespace(user_id=creator_id)],
        public=True,
    )


def test_create_session_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_create_study_session(
        db,
        *,
        creator_id,
        location_id,
        title,
        max_participants,
        ends_at,
        current_usage_percent,
        public,
    ):
        assert creator_id == current_user_id
        assert title == "Algorithms Review"
        assert max_participants == 6
        assert current_usage_percent == 25
        assert public is True
        return _session_stub(
            session_id=session_id,
            creator_id=creator_id,
            location_id=location_id,
        )

    monkeypatch.setattr(sessions.session_service, "create_study_session", fake_create_study_session)

    response = client.post(
        "/sessions",
        json={
            "location_id": str(location_id),
            "title": "Algorithms Review",
            "max_participants": 6,
            "ends_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "current_usage_percent": 25,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["id"] == str(session_id)
    assert body["data"]["location_id"] == str(location_id)
    assert body["data"]["current_usage_percent"] == 25
    assert body["data"]["participants"] == 1


def test_join_session_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    expected_session_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_join_study_session(db, *, session_id, user_id, current_usage_percent):
        assert session_id == expected_session_id
        assert user_id == current_user_id
        assert current_usage_percent == 50
        return "Successfully joined the study session."

    monkeypatch.setattr(sessions.session_service, "join_study_session", fake_join_study_session)

    response = client.post(
        f"/sessions/{expected_session_id}/join",
        json={"current_usage_percent": 50},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["message"] == "Successfully joined the study session."


def test_get_session_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    expected_session_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_get_study_session(db, *, session_id):
        assert session_id == expected_session_id
        return _session_stub(
            session_id=session_id,
            creator_id=current_user_id,
            location_id=location_id,
        )

    monkeypatch.setattr(sessions.session_service, "get_study_session", fake_get_study_session)

    response = client.get(f"/sessions/{expected_session_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["id"] == str(expected_session_id)
    assert body["data"]["location_id"] == str(location_id)
    assert body["data"]["participants"] == 1


def test_get_my_active_session_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_get_active_study_session_for_user(db, *, user_id):
        assert user_id == current_user_id
        return _session_stub(
            session_id=session_id,
            creator_id=current_user_id,
            location_id=location_id,
        )

    monkeypatch.setattr(
        sessions.session_service,
        "get_active_study_session_for_user",
        fake_get_active_study_session_for_user,
    )

    response = client.get("/sessions/me/active")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["id"] == str(session_id)
    assert body["data"]["location_id"] == str(location_id)
    assert body["data"]["participants"] == 1


def test_get_my_active_session_returns_null_when_missing(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_get_active_study_session_for_user(db, *, user_id):
        assert user_id == current_user_id
        return None

    monkeypatch.setattr(
        sessions.session_service,
        "get_active_study_session_for_user",
        fake_get_active_study_session_for_user,
    )

    response = client.get("/sessions/me/active")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": None,
        "error": None,
    }


def test_leave_session_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    expected_session_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_leave_study_session(db, *, session_id, user_id, current_usage_percent):
        assert session_id == expected_session_id
        assert user_id == current_user_id
        assert current_usage_percent == 75
        return "Successfully left the study session."

    monkeypatch.setattr(sessions.session_service, "leave_study_session", fake_leave_study_session)

    response = client.post(
        f"/sessions/{expected_session_id}/leave",
        json={"current_usage_percent": 75},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["message"] == "Successfully left the study session."


def test_update_session_usage_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    expected_session_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_update_session_usage_percent(db, *, session_id, user_id, current_usage_percent):
        assert session_id == expected_session_id
        assert user_id == current_user_id
        assert current_usage_percent == 100
        session = _session_stub(
            session_id=session_id,
            creator_id=current_user_id,
            location_id=location_id,
        )
        session.current_usage_percent = 100
        return session

    monkeypatch.setattr(
        sessions.session_service,
        "update_session_usage_percent",
        fake_update_session_usage_percent,
    )

    response = client.patch(
        f"/sessions/{expected_session_id}/usage",
        json={"current_usage_percent": 100},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["current_usage_percent"] == 100


def test_update_session_location_success(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_location_session(db, *, session_id, user_id, location_id):
        assert user_id == current_user_id
        return _session_stub(
            session_id=session_id,
            creator_id=current_user_id,
            location_id=location_id,
        )

    monkeypatch.setattr(sessions.session_service, "location_session", fake_location_session)

    response = client.patch(f"/sessions/{session_id}/location/{location_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["location_id"] == str(location_id)


def test_create_session_returns_404_when_location_missing(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_create_study_session(
        db,
        *,
        creator_id,
        location_id,
        title,
        max_participants,
        ends_at,
        current_usage_percent,
        public,
    ):
        raise LookupError("Location not found")

    monkeypatch.setattr(sessions.session_service, "create_study_session", fake_create_study_session)

    response = client.post(
        "/sessions",
        json={
            "location_id": str(location_id),
            "title": "Algorithms Review",
            "max_participants": 6,
            "ends_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "current_usage_percent": 25,
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Location not found",
    }


def test_update_session_location_returns_400_for_non_creator(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    location_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_location_session(db, *, session_id, user_id, location_id):
        raise ValueError("Only the session creator can change the location")

    monkeypatch.setattr(sessions.session_service, "location_session", fake_location_session)

    response = client.patch(f"/sessions/{session_id}/location/{location_id}")

    assert response.status_code == 400
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Only the session creator can change the location",
    }


def test_get_session_returns_404_when_missing(monkeypatch) -> None:
    current_user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    client = _build_client(current_user_id)

    def fake_get_study_session(db, *, session_id):
        raise LookupError("Study session not found")

    monkeypatch.setattr(sessions.session_service, "get_study_session", fake_get_study_session)

    response = client.get(f"/sessions/{session_id}")

    assert response.status_code == 404
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Study session not found",
    }
