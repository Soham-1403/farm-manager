# Mixed Farm Manager

Live application: **https://farm-management-1.web.app**

An installable, offline-first mixed-farm management PWA implementing Phases One–Three from `farm-manager-spec.md`.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. Use **Settings → Backup now** regularly and save the resulting `.farmbackup` file to Files or Drive.

## Verification

```powershell
npm.cmd test
npm.cmd run build
```

Production files are generated in `dist/`. Serve that folder over HTTPS (or localhost) to enable installation and the service worker.

For a phone-ready HTTPS deployment, follow [`DEPLOYMENT.md`](DEPLOYMENT.md). Firebase Hosting is the primary deployment; a GitHub Pages workflow is also included.

## Implemented coverage

- Enterprise registry and a unified finance ledger
- Recurring/capital expenses, other income, cash/depreciated P&L views
- Workers and labour with validated enterprise percentage splits
- Poultry batches, additions, mortality, health, egg collection/disposition, egg sales, hatching links, and bird sales
- Batch current count, mortality, cost recovery, gap/surplus, and bird-sale surplus visibility
- Poultry growth/weight logs, feed-consumption costing, FCR, hen-day rate, cost/egg, cost/kg meat, labour/bird, home-grown feed share, recovery projection, mortality/feed/lay/meat alerts, and editable poultry defaults
- Enterprise and consolidated date-filtered P&L with auditable direct-versus-shared cost breakdowns and driver bases, deduplicated unified cash ledger, and detailed poultry/herd/crop performance reports
- Multi-sheet Excel export including ledger, module performance, all entities, and normalized ML training data
- Full IndexedDB backup/restore, persistent-storage request, and stale-backup reminder
- PWA manifest, responsive mobile UI, and offline service worker
- Purchased and home-grown feed with lot/expiry inventory, FIFO balances, multi-batch/herd issues, stage-based reorder forecasts, feed-cost drift, cost/kg, Pearson balance, and constrained LP least-cost optimization
- Land plots with acre/gunta/cent conversion, rotation history, and period-recomputed animal-day, area, labour-quantity and feed-harvest-share allocation drivers
- Complete goats/sheep module: herds, tagged breeding animals and parentage, kidding/lambing follow-ups, additions, mortality alerts, health reminders, feed costing, explicit weight logs, growth/FCR, birth survival, and validated live/meat/milk sales
- Complete commercial/feed crop workflow with plot-capacity validation, cycle status management, operations, repeated harvests, unit-level sale inventory, feed-crop cost routing and allocations, yield/cost/margin/break-even dashboards, and linked correction history
- Profit/acre and return/₹ comparison, deterministic whole-farm insights, actual-vs-mandi selling signals with safe unit normalization, crop yield/revenue forecasts, livestock break-even, feed-price drift, mortality/wage indicators, and threshold-based weather warnings
- Manual and online-cached weather/market history, including offline weather fallback, with actual sale prices kept separate from reference prices
- Comprehensive normalized ML training CSV covering finance, labour, poultry, feed, livestock, crops, weather and market predictors/outcomes
- Validated multi-sheet Excel re-import with enum, numeric, date, allocation, duplicate-tag and referential checks plus transactional writes
- Optional hashed startup PIN, shared correction/archive history, persistent alert snooze/dismiss, consolidated trend view, and land-overlap/capacity safeguards
- Authenticated automatic multi-device synchronization through Firebase Authentication and Cloud Firestore, with deterministic conflict handling and soft-delete propagation

Online weather uses configured coordinates (Bengaluru defaults) and needs no API key. Market fetching requires the user's data.gov.in API key under **Insights & Market → Online data settings**; the current Agmarknet resource ID is prefilled, and optional state, district, and nearby-market filters narrow the daily feed. Manual weather and market entry remain available offline. **Corrections & Archive** provides soft-delete and restore across record types; permanent deletion is intentionally unavailable because the specification requires full historical and linked-report integrity.

## Automatic Firebase synchronization

Enable Email/Password Authentication and create the Firestore database in the configured Firebase project. Deploy `firestore.rules`, then sign into the same Firebase user under **Settings → Automatic device synchronization** on every installation. The app reconciles records after saves, at startup, when connectivity returns, and every five minutes while it is open. Firestore listeners deliver remote changes in real time.

Only farm data records synchronize. Local settings—including the app PIN—remain on the device. Records remain usable offline in IndexedDB, and queued local changes are uploaded after reconnection. Continue making regular `.farmbackup` files because synchronization is not a backup replacement.

The earlier standalone SQLite synchronization service remains under `sync_server/` for self-hosted or migration use, but it is not required for the Firebase deployment.
