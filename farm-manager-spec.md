# Mixed-Farm Manager — Build Specification (v4)

> **For Claude Code.** A modular farm-management app for a single small mixed farm (Bengaluru, India): **poultry + goats/sheep + commercial & feed crops**, all sharing land, labour, and water. Build a **shared core** once, then add **enterprise modules** that reuse it. **Poultry is module #1 and the priority** — build it fully first (it is specified in most detail); the others reuse the same primitives. Each enterprise gets its **own section** for easy navigation, and profit/loss is reported **both per-enterprise and consolidated**.
>
> **v4 pins down the previously-open decisions** (capital vs depreciation, cost-recovery definition, egg disposition/hatching, allocation timing, data durability, units) and adds a **Configurable Defaults** table (§14), a **worked example** (§15), and **acceptance criteria** (§16). Values marked `‹placeholder — confirm›` are safe defaults the owner should verify; they must be **editable settings, never hard-coded constants**.

---

## 1. Goal

Track **every cost and every income** across all farm activities so the owner sees, at any time:
- **Each enterprise's own P&L** (poultry, goats/sheep, each crop) — to know what's most and least profitable.
- **One consolidated farm P&L** — the whole operation's bottom line.
- **Fair comparison** between enterprises (profit, margin, **profit per acre**, **return per ₹**), since they all compete for the same land, cash, and labour.

Poultry's own model still holds and must stay visible: rearing cost recovered by egg sales, meat sales = profit.

---

## 2. Architecture Principle

**Shared core** (built once, enterprise-agnostic):
Enterprises registry · unified finance ledger · workers & labour · land plots & rotation cycles · shared feed sub-system · shared-cost allocation engine · consolidated + per-enterprise reporting.

**Enterprise modules** (each its own section/tab, each plugging into the core):
- **Poultry** — batches, mortality, health, eggs, bird sales, feed use.
- **Goats & Sheep** — herd, breeding, mortality, health, feed use, sales (live/meat/milk).
- **Crops** — commercial crops (roses, marigold, corn…) and feed crops (mulberry, fodder, maize); operations → harvest → sale, or harvest → feed for animals.

**Three rules keep the numbers honest:**
1. **Cost completeness** — nothing neglected (bought feed, home-grown feed inputs, wages, vaccination, water/electricity, infrastructure).
2. **Fair-share allocation** — shared land/labour/water and shared feed crops are split across enterprises; each is charged only its portion. No specialised entry is double-counted with the generic ledger.
3. **Actual prices, not market averages** — every purchase and sale is recorded at the **real transaction price the user enters** (what actually changed hands). Fetched market prices are a **reference signal only** and must never replace an actual transaction value. Local sales often beat the mandi/middleman average; the app captures that real (usually higher) price, and can display the gap vs market as an insight.

---

## 3. Recommended Tech Stack
PWA (installable, **fully offline**); React + TypeScript, mobile-first; IndexedDB via **Dexie.js** (SheetJS/`xlsx` for Excel I/O); Recharts; **Excel (.xlsx) as the human-facing export/import format** + silent one-tap Backup/Restore and a separate machine export for ML — see §11–12; ₹ INR, DD-MM-YYYY, land in **acres/guntas/cents** (1 acre = 40 guntas); optional PIN; optional Kannada labels. Phase-2 option: small SQLite sync backend. MVP is local.

**Units & conventions (canonical — one unit per measure, enforced everywhere):** eggs counted **per piece** (a "dozen" price is entered as price ÷ 12; store per-piece); milk in **litres**; animal/meat weight in **kg**; feed in **kg** (liquids litres); crop produce in **kg** unless the crop trades otherwise (flowers may be kg or bunch — store the unit on the record); money in **₹** rounded to 2 decimals; dates **DD-MM-YYYY**; every record stores an ISO timestamp internally for ML.

---

## 4. Data Model

### A. SHARED CORE

**Enterprise** — id, name (Poultry / Goats & Sheep / Roses / Marigold / Corn / Mulberry…), type (livestock / commercial-crop / feed-crop), active. Most entries carry an `enterprise_id`; shared entries carry a split.

**Unified finance stream** — every money-out (specialised forms + generic Expense) and money-in (sales + OtherIncome) flows into one stream, each entry tagged to one enterprise **or** marked shared with a split. This drives all P&L.

**Worker** — id, name, wage_type (daily/monthly/piece), rate, phone, active.
**LabourLog** — worker_id, date, task, quantity (days/hrs/pieces), amount (→ money-out), **enterprise_allocation** (one enterprise or % split), paid flag. *A worker splitting the day between chickens and goats is split here.*

**LandPlot** — id, name, area (+unit), notes.
**PlotCycle** (rotation history) — plot_id, season_year, crop_or_use, enterprise_id, start/end dates. *Captures cyclical, non-permanent land use.* Land/cultivation costs attach here and flow to the serving enterprise.

**WeatherLog** (daily environment — a key predictor for ML) — date, temp_min, temp_max, rainfall_mm, humidity%, notes. Entered manually now; later auto-fetched from a weather API by farm location when online (history **and** forecast). Season (Kharif/Rabi/summer) is derived from date + `PlotCycle.season_year`.

**MarketPrice** (external market signal — price **and** supply) — date, commodity, variety, market/mandi, min_price, max_price, modal_price, **arrival_quantity** (the availability/supply proxy), unit, source. Auto-fetched daily from the **Agmarknet mandi feed via the data.gov.in OGD Catalog API** (min/max/modal price + arrivals across 3,000+ markets; free with an API key); manual entry fallback for local buyers or auction crops (e.g. flowers) with no API. Stored as a time-series per commodity+market. **Reference-only: MarketPrice is never used as the value of an actual buy or sell** — all P&L uses the real transaction price the user enters (Principle 3). It exists purely as a benchmark for best-time-to-sell insight, the local-vs-market gap, and ML. *Note: reliable public agri prices are **daily, not hourly**; don't design for an hourly feed that doesn't exist.*

**Expense** (generic — anything not covered by a specialised form) — date, category (utilities-electricity-water / infrastructure / equipment / transport / misc), amount (→ money-out), is_capital, **useful_life_months** (optional; only for capital items), enterprise tag or shared split, note.
> **Decision 1 — capital vs depreciation.** A capital item (shed, fencing, incubator) is recorded once and **tagged capital**, kept separate from recurring costs in every P&L. Default: its full amount is shown as a one-time outflow on its date. If `useful_life_months` is set, the app **also** shows a depreciated monthly view (straight-line = amount ÷ life) so long-run per-period profit isn't distorted by a big one-off. Both views available; never silently pick one.
**OtherIncome** — date, source, amount (→ money-in), enterprise tag, note.

**Shared-cost allocation engine** — directly-attributable costs assigned in full; shared costs split by manual % or a **driver**: bird-days / head-days (animals), area (land), hours-days (labour), harvest-share (feed crops).
> **Decision 4 — allocation timing.** Allocation is **recomputed on demand for the selected report period**, not posted as fixed journal entries. For each shared cost in the period, compute each enterprise's driver share (e.g. its bird-days ÷ total bird-days that period) and apply it. This keeps numbers correct when births/deaths/sales change counts mid-period. `bird_days(batch, period) = Σ over each day of live birds that day`.

### B. SHARED FEED SUB-SYSTEM (produced by Crops, consumed by animal modules)

**FeedType** — name, category (energy/protein/greens/mineral/complete), source (purchased/home-grown), unit; optional **CP%, energy kcal/kg, Ca%, cost/kg** for the optimizer.
**FeedPurchase** — date, feed_type, quantity, total_cost (→ money-out), supplier. *(Bought feed is permanent — not everything can be home-grown.)*
**FeedProductionUnit** — home-grown source (azolla pit, BSF bin, mulberry strip, maize plot); links to a PlotCycle so cultivation cost flows in.
**FeedProductionInput** — unit_id, date, input_type (seed/spawn, setup-material [capital], labour, water-electricity, fertiliser), amount (→ money-out), is_capital.
**FeedHarvest** — unit_id, date, quantity, **allocation split** across consuming enterprises (e.g. mulberry 40% poultry / 60% goats-sheep). Only each animal's share of cost is charged to it. `home_grown_cost_per_kg = Σinputs ÷ Σharvest`.
**FeedConsumption** (optional, per animal batch/herd) — links feed to a specific batch/herd for per-unit cost + FCR; else allocated by bird/head-days.
**Feed Optimizer** — per animal stage, target CP%/energy/Ca%; compute least-cost blend of home-grown + bought that meets targets; flag shortfalls + bought top-up. MVP: Pearson-square two-ingredient balance with live cost/nutrient readout; later: LP least-cost solver.

### C. POULTRY MODULE (priority — build fully first)

**Batch** — name, breed, purpose (layer/meat/dual), source (purchased/hatched), acquisition_date, stage & age at acquisition, initial_count, acquisition_cost, expected_lay_start (derived, editable), target_meat_age, notes; derived `current_count = initial + additions − mortality − sold`.
**MortalityEvent** — batch, date, count_lost, cause (disease/predator/heat/injury/unknown), note.
**HealthRecord** — batch, date, type (Ranikhet, Gumboro, Fowl Pox, deworming, vitamin, antibiotic), quantity, cost (→ money-out), next_due_date, note.
**EggProduction** — date, batch (optional), eggs_collected.
**EggDisposition** — date, quantity, type (**sold / home-use / set-for-hatching / broken-spoiled**). Sold → creates an EggSale. **Set-for-hatching links to a new Batch** (source_type = hatched): those eggs leave the sellable pool and become the acquisition of a home-hatched batch, with a `hatch_success_count` recorded when they hatch (unhatched eggs = a loss on that batch). This closes the loop between your own eggs and your next flock, so hatching neither looks like lost eggs nor free chicks.
> **Decision 3 — egg disposition.** Eggs are never assumed all-sold. Every egg is accounted as sold, eaten at home, set for hatching, or broken, so egg revenue and the hatching pipeline are both visible.
**EggSale** — date, quantity, price_per_egg (per piece), total (→ money-in), buyer.
**BirdSale** — date, batch (reduces count), count, sale_type (live/dressed), total_weight_kg, price_per_kg **or** per_bird, total (→ money-in), buyer.
(Feed use via shared Feed sub-system.)

### D. GOATS & SHEEP MODULE

**Herd/Batch** — name, species (goat/sheep), breed, purpose (meat/milk/breeding), acquisition_date, initial_count, acquisition_cost, notes; derived current_count.
**Animal** (optional, for breeding stock) — tag, species, sex, breed, dob/acquisition, dam/sire (optional), status (active/sold/died).
**BreedingEvent (kidding/lambing)** — date, dam (or herd), number_born, number_survived.
**MortalityEvent** — herd/animal, date, count_lost, cause, note.
**HealthRecord** — herd, date, type (PPR, Enterotoxaemia, FMD, deworming…), cost (→ money-out), next_due_date.
**WeightLog** (optional) — animal/herd, date, weight → growth/FCR.
**Sale** — date, herd, count, sale_type (live/meat/**milk**), weight_kg or litres, price per kg/litre/head, total (→ money-in), buyer.
(Feed use via shared Feed sub-system; grazing/fodder crops via Crops module + FeedHarvest allocation.)

### E. CROPS MODULE (commercial + feed crops)

**CropCycle** — plot (LandPlot), crop, enterprise, type (commercial/feed), sowing_date, expected_harvest, area_used, status. (Extends PlotCycle for rotation history.)
**CropOperationInput** — cycle, date, input_type (land-prep, seed/sapling, fertiliser, pesticide, irrigation, labour, other), amount (→ money-out), is_capital.
**CropHarvest** — cycle, date, quantity, unit. Flowers/some crops harvest **repeatedly** — support many harvests per cycle.
  - Commercial → **CropSale** (date, produce, quantity, price/unit, buyer, total → money-in).
  - Feed crop → routed to **FeedHarvest** with allocation to animals.

---

## 5. Metrics & Two-Level P&L

**Per-enterprise P&L:** revenue − (direct costs + allocated shared costs) = net profit; margin %. Plus **profit per acre** (land occupied) and **return per ₹** (net ÷ costs) for fair comparison across very different enterprises.

**Consolidated farm P&L:** sum of enterprises, with each shared cost counted **once**; shows each enterprise's contribution and the farm bottom line. Filterable by period.

**Comparison view:** rank enterprises by net profit, margin, profit/acre, and return/₹ — the "what's working, what isn't" screen.

**Poultry headline — Decision 2 (defined precisely):** track two running cumulatives per batch from day one: `cumulative_cost_to_date` (acquisition + allocated feed + labour + health + shared share, still accruing during laying) and `cumulative_egg_revenue_to_date`. `rearing_cost_recovered% = cumulative_egg_revenue ÷ cumulative_cost ×100`. The batch is "recovered" at ≥100%; from then on, **bird-sale revenue is surplus/profit**. Show the %, the ₹ gap remaining, and a projected recovery date from the recent laying rate. (The denominator keeps growing rather than freezing at lay-start, so ongoing feed during laying is honestly counted.) Also: cost_per_egg, cost_per_kg_meat, mortality %, hen-day %, labour cost per bird.

**Cross-cutting:** mortality % (poultry & small ruminants), FCR where feed consumption logged, % feed home-grown vs bought.

---

## 6. Navigation & Screens

**Home / Farm Overview** — consolidated P&L, enterprise tiles (each showing its net + margin), comparison snapshot, alerts.
**Enterprise sections (own tabs):**
- **Poultry** — dashboard, batches, mortality, health, eggs, sales.
- **Goats & Sheep** — herd, breeding, mortality, health, weights, sales.
- **Crops** — cycles by plot, operations/inputs, harvests, crop sales.
**Shared sections:**
- **Feed** — types, purchases, home-grown units/harvests, optimizer.
- **Workers & Labour** — workers, labour log with enterprise split, wages due/paid.
- **Farm & Land** — enterprises, plots, rotation cycles, shared-cost split defaults.
- **Finance** — generic expenses, other income, full ledger.
- **Reports** — per-enterprise P&L, consolidated P&L, comparison, trends; **Excel export**.
- **Insights & Assistant** — offline insight cards (top/worst enterprise, mortality spike, best selling window from MarketPrice, feed-cost drift); optional AI assistant for plain-language questions over the data (see §13).
- **Market** — daily mandi price + arrivals for the farm's commodities & nearby markets; best-time-to-sell view; manual entry for auction/local prices.
- **Settings** — **Backup / Restore** (one tap, no technical jargon), Excel export/import, **ML data export** (developer-facing), defaults, PIN, language.

Keep each enterprise self-contained; don't crowd multiple enterprises onto one screen.

---

## 7. Alerts
Vaccination/health due (all animals); poultry lay-start & meat-ready; small-ruminant kidding/lambing follow-ups; feed reorder; mortality spike; wages due; crop harvest window.

---

## 8. Build Order

**Phase 1 — MVP (poultry + core):** Enterprises, unified finance ledger, generic Expense + OtherIncome, Workers + Labour (with split), **full Poultry module**, per-enterprise + consolidated P&L (even if poultry is the only enterprise at first), Dashboard with per-batch recovery, **Excel export + one-tap Backup/Restore**.

**Phase 2 — shared depth + second animal:** Feed sub-system (purchases, home-grown units/inputs/harvests with multi-animal split), HealthRecord + reminders, shared-cost allocation engine, LandPlots + rotation cycles, **Goats & Sheep module**, comparison basics (profit, margin), alerts.

**Phase 3 — crops + intelligence:** **Crops module** (commercial + feed crops), Feed Optimizer (Pearson → LP), profit-per-acre & return-per-₹ comparison, FCR, break-even projections, whole-farm consolidated reporting polish, **WeatherLog + MarketPrice auto-fetch, offline Insights layer, optional AI assistant, ML machine export (CSV/Parquet)**, Kannada, optional sync backend. *(Weather + market logging are low-effort — enable them as early as Phase 2 so history starts accumulating. The offline Insights cards can ship before any AI assistant.)*

---

## 9. Non-Functional
Fully offline; installable; ₹ + DD-MM-YYYY; large touch targets; fast entry.
> **Decision 5 — data durability (be realistic).** A phone PWA **cannot** silently write backup files to disk, and the browser may evict IndexedDB storage. So: (a) call `navigator.storage.persist()` to request durable storage; (b) **prompt the user to export a backup on a regular cadence** (e.g. weekly) — a real .xlsx/backup file they save to Files or Google Drive; (c) show "last backup: N days ago" and warn if stale. "Never lose data" is delivered by **routine user-saved exports**, not by an impossible silent auto-write. This is why the Phase-2 sync backend matters for a financial record.

## 10. Design Reminders
- Build the **shared core once**; enterprises are thin modules reusing it. Don't fork logic per enterprise.
- **Every enterprise is charged only its fair share** of shared land, labour, water, and feed crops.
- Keep **directly-attributable vs shared-and-allocated** costs visibly separate in every P&L.
- Ship **poultry first, end-to-end**, before adding goats/sheep or crops — a working module beats a half-built everything.

---

## 11. Data & File Formats

**Human-facing = Excel (.xlsx).** All export, import, and bulk viewing/editing use Excel, not CSV or JSON — the users are non-technical and need something readable.
- **Export:** one workbook, **one sheet per entity** (Batches, Mortality, Feed, Labour, Sales, Expenses, per-enterprise P&L, consolidated P&L…), with clear headers, ₹ and date formatting, and a summary sheet. Reports also export to Excel.
- **Import:** users can edit a sheet in Excel and re-import; validate on import (types, dates, enums, referential integrity) and show a clear error report rather than failing silently.
- Use SheetJS (`xlsx`) for read/write.

**Backup/Restore = one tap, plain language.** A full snapshot is exported/imported behind a plain **"Backup" / "Restore"** button (underlying file may be JSON, but the word "JSON" is never shown and the user never edits it). Because a PWA can't write silently, "Backup" produces a file the user saves to Files/Drive; the app tracks and displays time since last backup and nudges when overdue.

**Machine export = separate, developer-facing.** For the ML pipeline, generate clean **CSV or Parquet** of the normalized tables (or task-specific denormalized "training tables"). This is distinct from the Excel export and is exposed under Settings → ML data export, not in the everyday user flow.

---

## 12. Data for Machine Learning (long-term goal)

The owner intends to use this data to train models that **optimize and predict** — e.g. what to cultivate next, when to harvest, expected yield, mortality risk, least-cost feed, and price timing. The app must therefore **collect ML-ready data from day one**, because model quality is capped by data quality and history depth.

**Design constraints to enforce now:**
- **Everything timestamped.** Every event, cost, sale, harvest, and log carries a date (and created/updated timestamps). The data is fundamentally time-series.
- **Controlled vocabularies, not free text.** Causes of death, feed categories, crop names, health types, units, enterprises — all from fixed enums/lookup lists, so records are consistent and joinable across seasons. Free-text only for notes.
- **Consistent units & stable IDs.** One canonical unit per measure; immutable IDs on every record for clean joins across tables.
- **Keep full history — never hard-delete.** Use status flags / soft-deletes so corrections and history remain. Models learn from the past, including mistakes.
- **Capture the predictors, not just outcomes.** Log the inputs that drive results: **weather (WeatherLog), season, input quantities (feed, fertiliser, water), labour, own prices, and external market price + arrivals/supply (MarketPrice)** — alongside the outcomes (yield, eggs, growth, mortality, revenue). Crop prices move with supply as well as weather/season, so **market arrivals are a first-class predictor**, not a nice-to-have. Sale records already provide an own-price time-series; MarketPrice adds the wider market and supply signal.
- **Granularity.** Prefer daily logs where practical (feed given, eggs collected, mortality, weather); coarse data limits what a model can learn.

**Set expectations:** predictions become trustworthy only after **several seasons/cycles** of clean, consistent records accumulate. The payoff of disciplined logging now is a usable model later. Aggregating multiple seasons is also why the Phase-2/3 sync backend matters — ML wants the whole history in one place.

**Example future models (informative, not to build in MVP):** crop-choice recommender (weather + season + past yields + prices → best crop per plot), harvest-timing predictor, yield/egg-rate forecaster, mortality-risk early warning, and least-cost ration optimizer fed by logged feed costs and nutrition.

---

## 13. Online Integrations & AI (layered on the offline core)

These are **online, optional** features. The app must stay fully usable offline without them; they enrich data and insight when connectivity is available. All fetched data is **cached locally** and timestamped so it also feeds the ML history.

**Market price + supply (Agmarknet / data.gov.in).**
- Fetch the **daily** mandi feed: min/max/modal price **and arrival quantity** per commodity, variety, and market. Arrivals = the availability/supply signal the owner wants.
- Let the user pick their commodities and nearby markets; fetch on a daily schedule when online; store as a MarketPrice time-series.
- **Manual entry fallback** for local buyers and auction crops (flowers) that have no API. *Do not promise hourly data — the public feed is daily.*

**Weather (weather API by geolocation).**
- Fetch **daily history + short-range forecast** (temp, rainfall, humidity) for the farm location; write to WeatherLog; manual fallback offline.
- Forecast supports operational decisions (harvest/spray timing); history feeds prediction models.

**AI — two clearly separated layers:**
1. **Offline Insights (no AI model needed, ship first).** Deterministic, rules-based cards computed from the local data: most/least profitable enterprise, profit-per-acre ranking, mortality spike alerts, best recent selling window (from MarketPrice), feed-cost drift, wages-due. Reliable, instant, works with no connectivity. This delivers most of the "quick grasp" value.
2. **Optional AI Assistant (plain-language Q&A / summaries).** Answers questions like "which crop made the most per acre last season?" or "summarise this month's poultry costs." Pluggable provider:
   - **Cloud LLM API when online** — best quality; needs internet, an API key, and sends data to the provider (note the privacy trade-off to the user).
   - **Small on-device model** (e.g. via an in-browser runtime) for **offline/private** use — honestly limited in capability and heavy to load; treat as a fallback, not the default.
   - Keep the assistant **optional and isolated** so the core app never depends on it.

> Distinction to keep clear: the **predictive ML models** (yield, price, crop-choice, mortality) from §12 are trained on the accumulated data and are a *later* deliverable; the **AI Assistant** here is a conversational layer over current data. Different things — don't conflate them.

**Practical caveats to surface to the owner:** these features need connectivity and possibly free API keys (data.gov.in) or paid ones (some weather/LLM services); market data is daily; on-device AI is weak; and all of it is Phase-3 work that sits on top of a solid offline core — not a reason to delay Phase 1.

---

## 14. Configurable Defaults (editable settings — NOT hard-coded)

All values below are **editable in Settings**. Ship with these placeholder defaults and clearly mark them "confirm with owner/vet." Never bury them as constants in code.

| Setting | Placeholder default | Notes |
|---|---|---|
| Naati (country) lay-start age | `‹~150–180 days — confirm›` | drives `expected_lay_start` |
| Giriraja/Swarnadhara lay-start age | `‹~140–160 days — confirm›` | if improved birds used |
| Target meat-sale age | `‹~180 days — confirm›` | drives meat-ready alert |
| Layer daily feed intake | `‹~100–120 g/bird/day — confirm›` | feed-requirement & reorder estimate |
| Grower daily feed intake | `‹~50–90 g/bird/day — confirm›` | |
| Layer ration targets | `‹CP 16–18%, ME 2600–2700 kcal/kg, Ca 3.5–4% — confirm›` | Feed Optimizer (Phase 3) |
| Grower ration targets | `‹CP 16%, ME 2600 kcal/kg — confirm›` | |
| Mortality-spike threshold | `‹≥3 deaths in 3 days OR >2% of batch/week — confirm›` | triggers alert |
| Feed reorder trigger | `‹7 days of stock remaining — confirm›` | |
| Capital useful life (default) | `‹60 months — confirm›` | for optional depreciation view |
| Vaccination schedule (Ranikhet etc.) | `‹standard schedule — confirm with vet›` | drives due-date reminders |
| Backup reminder cadence | `weekly` | durability nudge |

> These placeholders are **starting points, not advice.** The owner/vet must confirm them; poultry figures in particular vary by breed and local practice.

---

## 15. Worked Example (Phase 1 — pins expected behaviour)

*Illustrative numbers to verify the build, not real data.*

Batch "A" — 50 naati chicks bought 01-02-2026 at ₹60/chick → acquisition ₹3,000.
- 05-02-2026: MortalityEvent, 3 lost (disease). → current_count 47; mortality_rate = 3÷50 = **6%**.
- Feb–Jul: FeedPurchase entries totalling ₹4,000 allocated to Batch A; LabourLog ₹1,500 (poultry share); HealthRecord vaccinations ₹500. → cumulative_cost ≈ **₹9,000**.
- From ~Jul (≈150 days): EggProduction logged daily. Say 40 hens lay, 30 eggs/day.
- EggDisposition: 20 sold, 5 home-use, 5 set-for-hatching. EggSale 20 × ₹8 = ₹160/day.
- After selling 2,000 eggs total → cumulative_egg_revenue ₹16,000 (net of ongoing feed, say cost now ₹12,000).

**Expected screen outputs:**
- Batch A card: current_count, mortality 6%, `rearing_cost_recovered% = 16,000 ÷ 12,000 = 133%` → **recovered; surplus ₹4,000**.
- 5 eggs/day set-for-hatching appear as a new hatched Batch "A-H", not as lost eggs.
- A subsequent BirdSale of 10 spent hens at ₹500 each = ₹5,000 → shown as **profit on top** of recovery.
- Poultry P&L: revenue (egg + bird) − (acquisition + feed + labour + health), capital shown separately.

If the build reproduces these numbers from these inputs, the core logic is correct.

---

## 16. Acceptance Criteria (definition of done)

**Phase 1 (poultry + core) is done when:**
1. Can create a batch; current_count auto-updates from mortality, additions, and bird sales.
2. Mortality rate, cumulative cost, cumulative egg revenue, and `rearing_cost_recovered%` compute correctly (matches §15).
3. Every egg is dispositioned (sold/home/hatching/broken); set-for-hatching creates a linked hatched batch.
4. Labour can be split across enterprises; only poultry's share hits poultry cost.
5. Capital vs recurring costs are separated; optional depreciation view works.
6. Per-enterprise **and** consolidated P&L render (even with poultry alone) for a chosen period.
7. Excel export produces a multi-sheet workbook; Backup/Restore round-trips all data; "last backup" age is shown.
8. All enums/units follow §3/§Units; every record carries a timestamp.
9. Works fully offline; installs to home screen.

**Phase 2 done when:** feed sub-system (bought + home-grown with multi-animal split) feeds per-batch cost; shared-cost allocation recomputes per period; goats/sheep module mirrors poultry; health reminders fire; weather + market logging capturing data.

**Phase 3 done when:** crops module complete; Feed Optimizer produces a least-cost blend; profit-per-acre & return-per-₹ comparison ranks enterprises; market/weather auto-fetch + offline Insights live; ML machine export produces clean tables.
