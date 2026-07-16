# Farm Manager synchronization service

This optional service synchronizes farm records between installations while each app remains fully usable offline. It uses SQLite, bearer-token authentication, incremental download cursors, soft-delete propagation, and deterministic last-write-wins conflict handling.

## Run locally

Python 3.11 or newer is sufficient; there are no third-party packages.

```powershell
$env:SYNC_TOKEN = "replace-with-a-long-random-secret"
$env:SYNC_ALLOWED_ORIGIN = "http://localhost:5173"
python sync_server/server.py
```

The default URL is `http://127.0.0.1:8765`. Enter that URL and the same token in Farm Manager's Settings screen. The database is stored at `data/farm-sync.sqlite3` unless `SYNC_DB` is set.

Environment variables:

- `SYNC_TOKEN` (required, at least 16 characters)
- `SYNC_HOST` (default `127.0.0.1`; use `0.0.0.0` in a container)
- `SYNC_PORT` (default `8765`)
- `SYNC_DB` (default `data/farm-sync.sqlite3`)
- `SYNC_ALLOWED_ORIGIN` (default `*`; set the exact app origin in production)

## Production security

Put this service behind an HTTPS reverse proxy and use a long, unique token. Plain HTTP is intentionally accepted by the app only for localhost development. Restrict the allowed origin, protect and back up the SQLite file, and do not expose the health or sync service unnecessarily.

The service never receives app settings, including the synchronization token, PIN hash, or display preferences. Deleted business records are retained as soft-delete tombstones so deletion reaches other devices.

## Test

From the repository root:

```powershell
python -m unittest discover -s sync_server -p "test_*.py"
```
