import tempfile
import unittest
from pathlib import Path

from server import SyncStore


def record(record_id: str, updated_at: str, deleted_at=None):
    result = {"id": record_id, "name": "Layer flock", "createdAt": updated_at, "updatedAt": updated_at}
    if deleted_at:
        result["deletedAt"] = deleted_at
    return result


class SyncStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = SyncStore(Path(self.temp.name) / "sync.sqlite3")

    def tearDown(self):
        self.temp.cleanup()

    def test_push_and_incremental_pull(self):
        first = self.store.sync("device-a", 0, [{"table": "batches", "key": "b1", "record": record("b1", "2026-01-01T00:00:00.000Z")}])
        self.assertEqual(first["accepted"], 1)
        self.assertEqual(len(first["changes"]), 1)
        second = self.store.sync("device-b", 0, [])
        self.assertEqual(second["changes"][0]["record"]["id"], "b1")
        caught_up = self.store.sync("device-b", second["cursor"], [])
        self.assertEqual(caught_up["changes"], [])

    def test_stale_push_returns_server_winner_even_at_current_cursor(self):
        latest = self.store.sync("device-z", 0, [{"table": "batches", "key": "b1", "record": record("b1", "2026-02-01T00:00:00.000Z")}])
        stale = self.store.sync("device-a", latest["cursor"], [{"table": "batches", "key": "b1", "record": record("b1", "2026-01-01T00:00:00.000Z")}])
        self.assertEqual(stale["accepted"], 0)
        self.assertEqual(stale["conflicts"], 1)
        self.assertEqual(stale["changes"][0]["record"]["updatedAt"], "2026-02-01T00:00:00.000Z")

    def test_identical_replay_is_not_reported_as_a_conflict(self):
        item = record("b1", "2026-02-01T00:00:00.000Z")
        first = self.store.sync("device-a", 0, [{"table": "batches", "key": "b1", "record": item}])
        replay = self.store.sync("device-b", first["cursor"], [{"table": "batches", "key": "b1", "record": item}])
        self.assertEqual(replay["accepted"], 0)
        self.assertEqual(replay["conflicts"], 0)
        self.assertEqual(replay["changes"], [])

    def test_soft_delete_is_a_normal_change(self):
        initial = self.store.sync("device-a", 0, [{"table": "batches", "key": "b1", "record": record("b1", "2026-01-01T00:00:00.000Z")}])
        deleted = record("b1", "2026-03-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z")
        result = self.store.sync("device-a", initial["cursor"], [{"table": "batches", "key": "b1", "record": deleted}])
        self.assertEqual(result["accepted"], 1)
        self.assertEqual(result["changes"][0]["record"]["deletedAt"], deleted["deletedAt"])

    def test_settings_are_never_accepted(self):
        with self.assertRaisesRegex(ValueError, "not syncable"):
            self.store.sync("device-a", 0, [{"table": "settings", "key": "syncToken", "record": record("syncToken", "2026-01-01T00:00:00.000Z")}])

    def test_timestamp_offsets_are_compared_as_instants(self):
        first = record("b1", "2026-01-01T10:00:00+05:30")
        older = record("b1", "2026-01-01T04:00:01Z")
        self.store.sync("device-a", 0, [{"table": "batches", "key": "b1", "record": first}])
        result = self.store.sync("device-z", 0, [{"table": "batches", "key": "b1", "record": older}])
        self.assertEqual(result["accepted"], 0)
        self.assertEqual(result["changes"][0]["record"]["updatedAt"], first["updatedAt"])


if __name__ == "__main__":
    unittest.main()
