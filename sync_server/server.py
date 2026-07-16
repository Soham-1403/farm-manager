"""Small authenticated SQLite synchronization service for Farm Manager."""

from __future__ import annotations

import hmac
import json
import os
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ALLOWED_TABLES = frozenset(
    "enterprises expenses otherIncome workers labourLogs batches additions mortalities "
    "healthRecords eggProduction eggDispositions eggSales birdSales feedTypes feedPurchases "
    "feedUnits feedInputs feedHarvests feedConsumption landPlots plotCycles herds animals "
    "breedingEvents herdAdditions herdMortalities herdHealth weightLogs poultryWeights "
    "layingCountLogs herdSales cropCycles cropInputs cropHarvests cropSales weatherLogs "
    "marketPrices".split()
)
MAX_BODY_BYTES = 20 * 1024 * 1024


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


class SyncStore:
    def __init__(self, path: str | Path):
        self.path = str(path)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS records (
                    table_name TEXT NOT NULL,
                    record_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    PRIMARY KEY (table_name, record_key)
                );
                CREATE TABLE IF NOT EXISTS change_log (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    table_name TEXT NOT NULL,
                    record_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    device_id TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS change_log_seq ON change_log(seq);
                """
            )

    @staticmethod
    def _validate_change(change: Any) -> tuple[str, str, dict[str, Any]]:
        if not isinstance(change, dict):
            raise ValueError("Each change must be an object.")
        table = change.get("table")
        key = change.get("key")
        record = change.get("record")
        if table not in ALLOWED_TABLES:
            raise ValueError(f"Table is not syncable: {table}")
        if not isinstance(key, str) or not key:
            raise ValueError("Each change needs a non-empty key.")
        if not isinstance(record, dict) or record.get("id") != key:
            raise ValueError("Record id must match the change key.")
        if not _parse_timestamp(record.get("updatedAt")):
            raise ValueError("Record updatedAt must be an ISO timestamp.")
        return table, key, record

    def sync(self, device_id: str, cursor: int, changes: list[Any]) -> dict[str, Any]:
        if not isinstance(device_id, str) or not device_id.strip() or len(device_id) > 200:
            raise ValueError("deviceId must be a non-empty string of at most 200 characters.")
        if not isinstance(cursor, int) or isinstance(cursor, bool) or cursor < 0:
            raise ValueError("cursor must be a non-negative integer.")
        if not isinstance(changes, list):
            raise ValueError("changes must be an array.")

        validated = [self._validate_change(change) for change in changes]
        rejected_keys: set[tuple[str, str]] = set()
        accepted = 0
        rejected = 0

        with self._lock, closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            for table, key, record in validated:
                current = connection.execute(
                    "SELECT payload, updated_at, device_id FROM records WHERE table_name=? AND record_key=?",
                    (table, key),
                ).fetchone()
                payload = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
                if current is not None and payload == current["payload"]:
                    continue
                incoming_order = (_parse_timestamp(record["updatedAt"]), device_id)
                current_order = (_parse_timestamp(current["updated_at"]), current["device_id"]) if current else None
                if current_order is not None and incoming_order <= current_order:
                    rejected += 1
                    rejected_keys.add((table, key))
                    continue

                connection.execute(
                    """INSERT INTO records(table_name,record_key,payload,updated_at,device_id,version)
                       VALUES(?,?,?,?,?,1)
                       ON CONFLICT(table_name,record_key) DO UPDATE SET
                         payload=excluded.payload, updated_at=excluded.updated_at,
                         device_id=excluded.device_id, version=records.version+1""",
                    (table, key, payload, record["updatedAt"], device_id),
                )
                connection.execute(
                    "INSERT INTO change_log(table_name,record_key,payload,updated_at,device_id) VALUES(?,?,?,?,?)",
                    (table, key, payload, record["updatedAt"], device_id),
                )
                accepted += 1

            latest = connection.execute("SELECT COALESCE(MAX(seq),0) AS seq FROM change_log").fetchone()["seq"]
            changed_keys = {
                (row["table_name"], row["record_key"])
                for row in connection.execute(
                    "SELECT table_name,record_key FROM change_log WHERE seq>? AND seq<=?",
                    (cursor, latest),
                )
            }
            response_keys = changed_keys | rejected_keys
            response_changes: list[dict[str, Any]] = []
            for table, key in sorted(response_keys):
                row = connection.execute(
                    "SELECT payload,device_id FROM records WHERE table_name=? AND record_key=?",
                    (table, key),
                ).fetchone()
                if row:
                    response_changes.append(
                        {"table": table, "key": key, "record": json.loads(row["payload"]), "deviceId": row["device_id"]}
                    )
            connection.commit()

        return {
            "cursor": latest,
            "changes": response_changes,
            "accepted": accepted,
            "rejected": rejected,
            "conflicts": len(rejected_keys),
        }


class SyncHandler(BaseHTTPRequestHandler):
    store: SyncStore
    token: str
    allowed_origin: str

    def _headers(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", self.allowed_origin)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._headers(status)
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._headers(204)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "farm-manager-sync", "protocol": 1})
        else:
            self._json(404, {"error": "Not found."})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/sync":
            self._json(404, {"error": "Not found."})
            return
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {self.token}"
        if not hmac.compare_digest(supplied, expected):
            self._json(401, {"error": "Invalid synchronization token."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("Request body is empty or too large.")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Request body must be an object.")
            result = self.store.sync(payload.get("deviceId"), payload.get("cursor", 0), payload.get("changes"))
            self._json(200, result)
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "Synchronization failed on the server."})

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}")


def main() -> None:
    token = os.environ.get("SYNC_TOKEN", "")
    if len(token) < 16:
        raise SystemExit("Set SYNC_TOKEN to a secret value of at least 16 characters.")
    host = os.environ.get("SYNC_HOST", "127.0.0.1")
    port = int(os.environ.get("SYNC_PORT", "8765"))
    database = os.environ.get("SYNC_DB", "data/farm-sync.sqlite3")
    origin = os.environ.get("SYNC_ALLOWED_ORIGIN", "*")
    SyncHandler.store = SyncStore(database)
    SyncHandler.token = token
    SyncHandler.allowed_origin = origin
    server = ThreadingHTTPServer((host, port), SyncHandler)
    print(f"Farm Manager sync listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
