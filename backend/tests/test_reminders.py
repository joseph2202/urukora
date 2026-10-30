"""SQLite tests exercise persistence, owner isolation, retries and safe leases."""

import pytest
from urukora.config import settings
from urukora.reminders import (
    MAX_ACTIVE, MAX_DELAY_SECONDS, ReminderError,
    cancel_reminder, claim_due, create_reminder,
    init_reminders, list_reminders, mark_delivered,
    mark_delivery_failed, parse_delay,
)


@pytest.fixture(autouse=True)
def db_per_test(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "reminders.db"))
    init_reminders()


@pytest.mark.parametrize(("value", "seconds"), [
    ("1m", 60), ("10M", 600), ("2h", 7200), ("1d", 86400), ("30d", MAX_DELAY_SECONDS),
])
def test_duration(value, seconds):
    assert parse_delay(value) == seconds


@pytest.mark.parametrize("value", [
    "0m", "-2h", "31d", "1s", "1.5h", "2h more", "١٠m", "10000m", "",
])
def test_bad_duration(value):
    with pytest.raises(ReminderError):
        parse_delay(value)


def test_owner_scoped_list_and_cancel():
    mine = create_reminder(10, 10, "My private message", 60, "ar", now=100)
    other = create_reminder(20, 20, "Other user's reminder", 60, now=100)
    assert [r.id for r in list_reminders(10)] == [mine.id]
    assert not cancel_reminder(10, other.id)
    assert [r.id for r in list_reminders(20)] == [other.id]
    assert cancel_reminder(10, mine.id)
    assert list_reminders(10) == []
    assert not cancel_reminder(10, mine.id)


def test_private_chat_and_message_limits():
    with pytest.raises(ReminderError):
        create_reminder(10, -100, "group chat", 60)
    with pytest.raises(ReminderError):
        create_reminder(10, 10, "  ", 60)
    with pytest.raises(ReminderError):
        create_reminder(10, 10, "X" * 281, 60)


def test_active_quota_enforced():
    for i in range(MAX_ACTIVE):
        create_reminder(10, 10, f"task {i}", 60, now=10)
    with pytest.raises(ReminderError):
        create_reminder(10, 10, "too many", 60, now=10)
    # Another user is unaffected.
    assert create_reminder(20, 20, "allowed", 60, now=10)


def test_not_sent_before_due_and_sent_only_once():
    created = create_reminder(10, 10, "Don't forget", 60, now=100)
    assert claim_due(now=159) == []
    jobs = claim_due(now=160)
    assert len(jobs) == 1
    assert jobs[0].id == created.id
    assert jobs[0].attempts == 1
    assert claim_due(now=161) == []
    assert mark_delivered(jobs[0])
    assert not mark_delivered(jobs[0])
    assert claim_due(now=400) == []


def test_failure_backoff_and_retry():
    created = create_reminder(10, 10, "retry test", 60, now=100)
    first = claim_due(now=160)[0]
    assert mark_delivery_failed(first, now=161) == "retry"
    assert claim_due(now=220) == []
    second = claim_due(now=221)[0]
    assert second.id == created.id and second.attempts == 2
    assert mark_delivered(second)


def test_expired_lease_recovered_without_double_claim():
    create_reminder(10, 10, "test lease", 60, now=100)
    first = claim_due(now=160)[0]
    assert claim_due(now=279) == []
    recovered = claim_due(now=280)[0]
    assert recovered.id == first.id
    assert recovered.lease_token != first.lease_token
    assert not mark_delivered(first)
    assert mark_delivered(recovered)


def test_cancel_only_pending_and_retry_exhaustion():
    reminder = create_reminder(10, 10, "test cancel", 60, now=100)
    current_time = 160
    for attempt in range(5):
        job = claim_due(now=current_time)[0]
        assert not cancel_reminder(10, job.id)
        state = mark_delivery_failed(job, now=current_time)
        assert state == ("failed" if attempt == 4 else "retry")
        current_time += 2000
    assert list_reminders(10) == []
    assert claim_due(now=current_time) == []
