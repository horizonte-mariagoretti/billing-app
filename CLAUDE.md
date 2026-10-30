# Hori-Admin — Project Reference

**Version:** 1.20.0 | **Stack:** React 19 + Vite 8 — runs as **Electron 41 desktop app** (better-sqlite3) **OR** as a **static web app** on GitHub Pages (sql.js WASM + GitHub Contents API)

> Single source of truth. Read this; read nothing else.

---

## What the app is

Desktop billing tool for freelancers. Manages clients, products/services, invoices, quotes. Generates PDFs in EN/DE/FR. Fully offline — no server, no cloud, all data in local SQLite file.

---

## How to run

```bash
# Electron (default — desktop, local SQLite)
npm run dev       # Vite + Electron dev with HMR
npm run build     # Build dist/ + dist-electron/
# After build: npx electron .

# Web (browser, GitHub Pages, sql.js + GitHub repo persistence)
npm run dev:web   # BUILD_TARGET=web vite — pure browser, no Electron plugins
npm run build:web # Static build for GitHub Pages
npm run preview   # Serve production build at :4173
```

Runtime detection: `window.__ELECTRON_PRELOAD__ === true` ⇒ Electron path. Falsy ⇒ web path. The `<Bootstrap>` component picks the right persistence/PDF handlers.

**Web mode boot**: PAT prompt → `verifyAccess` → fetch `data/invoiceforge.db` → init sql.js → run migrations → install shim that rebinds `window.electron.db` to the WASM engine → mount `<App>`. From here, every hook + page works unmodified.

---

## Directory structure

```
Billing_App/
├── electron/
│   ├── main.js          # Electron main process — BrowserWindow, IPC handlers
│   ├── database.js      # SQLite schema + migrations (schema_version table)
│   └── preload.js       # contextBridge: exposes window.electron.db.{query,run,transaction}
├── src/
│   ├── main.jsx         # React root mount + pre-Bootstrap noop shim for window.electron.db
│   ├── Bootstrap.jsx    # Web/Electron orchestrator. Web: gates on PAT, loads sql.js, fetches DB, debounces sync.
│   ├── Bootstrap.css
│   ├── App.jsx          # Central state: view, isEditing, editingData, appSettings
│   ├── index.css        # Global design tokens (CSS vars) + base styles + shared classes
│   ├── constants.js     # DOC_TYPES, LANGUAGES, CURRENCIES, UNITS, DUE_DATE_MONTHS
│   ├── components/
│   │   ├── Layout.jsx          # Shell: sidebar + header. Owns sidebarCollapsed state.
│   │   ├── Layout.css
│   │   ├── Sidebar.jsx         # Nav + collapse toggle. Props: collapsed, onToggleCollapse.
│   │   ├── Sidebar.css
│   │   ├── Button.jsx          # variant=primary|secondary|outline|ghost|danger, size=sm|md|lg
│   │   ├── Button.css
│   │   ├── Input.jsx           # Labeled input wrapper with error state
│   │   ├── DecimalInput.jsx    # German decimal field (comma); onChange gives dot-number. Use instead of type="number".
│   │   ├── JobCalendar.jsx     # Month calendar of jobs (Arbeiten calendar view)
│   │   ├── ClientPicker.jsx / .css      # Searchable client combobox + "Neuen Kunden anlegen" (ClientModal). Props: clients, value, onChange(id), onClientCreated(client)
│   │   ├── JobDocumentDialog.jsx / .css # Wage source + preview before creating an offer/invoice from a job (one line per distinct Hori-hours value)
│   │   ├── JobLinesDialog.jsx / .css    # Editor "Aus Arbeit laden…": pick a job, append its grouped Hori-hours lines
│   │   ├── ActionDateField.jsx / .css  # Date picker of a Verkaufsaktion (no visible label, tooltip only) next to the year switcher (shared `DatePicker`, `initialView` = month opened first); its month decides where the action's Saldo counts in the Dashboard Umsatz
│   │   ├── FinanceEntryModal.jsx       # Add/edit popup for one manual Lasagnen entry (kind 'expense' | 'income': description, category, amount); optional `categories` ([{value,label}]) overrides the Lasagnen list (Glühwein Finanzen); onSave throws to show a save error
│   │   ├── GluehweinCatalog.jsx / .css  # Glühwein tab "Sortiment" (value `catalog`): finished products only; sold per Verkaufseinheit (`gw_items.unit`: Glas/Becher/Shot…), bought per Einkaufseinheit (`buy_unit`, `buy_pack_price`, content = `pack_size`); derived cost/margin/packs to buy/Umsatz/Rohgewinn (`utils/gluehweinCatalogMath.js`); recipe products show cost "über Rezept". "Artikel hinzufügen" lives in the page header next to the year switcher (`HEADER_ACTIONS` + `addRequest` in Gluehwein.jsx)
│   │   ├── RecipeEditor.jsx / .css      # Popup: ingredients + qty per unit of one Glühwein product (`gw_recipe`)
│   │   ├── GluehweinKasse.jsx / .css    # Glühwein tab "Kasse": Kartenzahlung field + Bargeldkasse (Start/Ende count per denomination 0,10–200 €, Differenz, Summe); counts as Einnahmen live in Finanzen/Übersicht/Dashboard; "Kasse übernehmen" locks it, "Kasse entsperren" unlocks (`sales_kasse.locked`, `sales_kasse_counts`)
│   │   ├── GluehweinSchichten.jsx / .css # Glühwein tab "Schichten": consecutive sale days form one continuous calendar block (`GluehweinShiftCalendar`, `utils/shiftLayout.js`); per-day shifts with free start/end (end before start = past midnight), add/edit modal (`GluehweinShiftModal`), copy shifts from another day, template shifts; Hori list sortable with Anteil % heat bar
│   │   ├── GluehweinShiftSettingsModal.jsx / .css # Popup: `gluehwein_mandatory_shifts`, bonus on/factor, `gluehwein_shift_templates`
│   │   ├── GluehweinEinkaufsliste.jsx / .css # Glühwein tab "Einkaufsliste": computed list + "Zutaten" (`gw_ingredients`, own modal) + recipes;  planned qty through recipes, whole packs, cost (`utils/gluehweinShoppingList.js`)
│   │   ├── GluehweinFinanzen.jsx / .css # Glühwein tab "Finanzen": `sales_entries` (Einnahmen/Ausgaben, own categories incl. Standmiete) + Saldo, via `FinanceEntryModal`
│   │   ├── LasagnenFinance.jsx / .css  # Lasagnen tab "Finanzen": summary cards (Einnahmen, Ausgaben, Saldo) + "Einnahme hinzufügen" (secondary) / "Ausgabe hinzufügen" (primary) buttons (open `FinanceEntryModal`) + one list of all Einnahmen (per Hori from the Übersicht, read-only; manual) and Ausgaben, filter Alle/Einnahmen/Ausgaben, fixed column widths. Props: year, yearLocked, income{total}, incomeEntries, formatCurrency, locale, search, onError
│   │   ├── JobRateSource.jsx / .css     # Shared "Aus Produkt | Manuell" wage switch + live line preview (state: hooks/useJobRateSource.js)
│   │   ├── Input.css
│   │   ├── SortableTh.jsx       # Sortable <th> (props: column, label, align left|right, sort, onSort). Right-aligned: arrow before label; unsorted: arrow hidden, space kept
│   │   ├── DataTable.css        # Shared table look (.data-table-container, .data-table, .num, .dt-mono/.dt-strong/.dt-muted, .dt-sort-btn, .dt-heat bar) — Horis + Lasagnen Übersicht
│   │   ├── SettingsFieldsModal.jsx / .css # Popup editing a few settings keys (decimal via DecimalInput / whole-number count), saves via useSettings.saveSettings
│   │   ├── StatusBadge.jsx     # draft|sent|paid|overdue|cancelled|accepted|declined|converted
│   │   ├── StatusBadge.css
│   │   ├── ConfirmDialog.jsx   # Modal confirm/cancel dialog with focus trap
│   │   ├── ConfirmDialog.css
│   │   ├── CategoryEditor.jsx  # Shared editor for product categories
│   │   ├── CategoryEditor.css
│   │   └── ErrorBoundary.jsx   # React error boundary
│   ├── pages/
│   │   ├── Dashboard.jsx / .css      # KPI stats, revenue chart, recent docs, quick actions
│   │   ├── Dashboard2.jsx / .css     # Dashboard 2.0 (sidebar: Übersicht): scout-year cockpit in the classic Dashboard's design (reuses Dashboard.css: stat cards, chart card, recent cards, red quick-stat, quick-actions). Hero = Umsatz + Vorjahr comparison (same period) + month columns with Vorjahr ticks + Jahresplan strip (today, action dates, Arbeiten); rail = Offene Posten + Braucht Aufmerksamkeit; then three stat cards, one card per Verkaufsaktion, Nächste Arbeiten, Aktivste Horis. Props: settings, onNavigate(view). Classic Dashboard stays as is
│   │   ├── DocumentList.jsx / .css   # Table of invoices or quotes (search, edit, delete)
│   │   ├── DocumentEditor.jsx / .css # Create/edit form + preview mode + lifecycle actions
│   │   ├── DocumentPreview.jsx / .css# Print/PDF HTML render (language-aware)
│   │   ├── Clients.jsx / .css        # Client CRUD table + modal (live validation)
│   │   ├── Products.jsx / .css       # Product cards + category chips + modal
│   │   ├── Arbeiten.jsx / .css       # Work dates (times/open end), assigned Horis, planned vs actual hours, links to client/quote/invoice
│   │   ├── Horis.jsx / .css          # Helpers overview: hours, share %, camp contribution reduced by work share and the Lasagnen + Glühwein bonus (added up, max 100 %; tooltip shows each %), matrix view
│   │   ├── Lasagnen.jsx / .css       # Per-Hori lasagne orders: Bolo/Veggie counts, Anteil %, Bonus % (if on), Betrag min, Betrag final (red when < calculated Betrag min), Bezahlt (locks the row). Übersicht (3 summary boxes, price box opens SettingsFieldsModal) / Einkaufsliste (Veggie ingredient totals, `utils/lasagnaShoppingList.js`) / Finanzen (`LasagnenFinance`)
│   │   ├── SalesActionPage.jsx / .css # Base page of a Verkaufsaktion: search bar, action date picker (`ActionDateField`), year switcher; content still empty. Prop: action (entry of `SALES_ACTIONS`)
│   │   ├── Gluehwein.jsx / .css      # Glühweinbude: search bar (Sortiment, Finanzen), year switcher, tabs Übersicht (Verkaufstage, Kasse, Saldo) / Sortiment / Kasse / Schichten / Einkaufsliste / Finanzen
│   │   ├── Baseball.jsx              # Baseballturnier: thin wrapper around `SalesActionPage` (blank for now)
│   │   └── Settings.jsx / .css       # Tabbed settings: Company / Billing / Numbering / Translations
│   ├── hooks/
│   │   ├── useDatabase.js      # query(sql,params), run(sql,params), transaction([ops])
│   │   ├── useDocuments.js     # fetchDocuments, saveDocument, deleteDocument, transitionDocument, fetchPayments
│   │   ├── useSettings.js      # loadSettings, saveSettings, getNextDocumentNumber, incrementDocumentNumber
│   │   ├── useJobs.js          # CRUD for jobs (Arbeiten) + job_assignments
│   │   ├── useJobRateSource.js # Products + "Aus Produkt | Manuell" wage state for JobRateSource (resolved name/rate/productId)
│   │   ├── useHoris.js         # CRUD for horis + per-Hori hours/share aggregation; fetchGluehweinShifts(year) (Glühwein shift count per Hori, for the bonus)
│   │   ├── useTableSort.js     # Shared sort state: cycle none → asc → desc → none, sortRows(rows, accessors, {tieBreak, locale})
│   │   ├── useDashboard2.js    # loadDashboard(year): one load for Dashboard 2.0 (invoices by month/open/overdue, open quotes, Verkaufsaktionen incl. `lasagnaSummary`, Arbeiten incl. dates, Horis, and `prev` = the Vorjahr's Umsatz per month); scoutMonthKeys(year)
│   │   ├── useActionDate.js    # useActionDate(dateKey): date of a Verkaufsaktion for the selected scout year (year_settings), setDate(value) with scout-year range check + lock
│   │   ├── useSalesActions.js  # fetchSalesActionSaldi(): Saldo of every Verkaufsaktion per scout year + the month it counts in (for the Dashboard); fetchActionSaldo(action,year,settings); hasSaldoSource(action) (Lasagnen, Glühwein)
│   │   ├── useLasagnenExpenses.js # fetchExpenses(year), saveExpense(year, exp) (insert/update, YEAR_LOCKED check), deleteExpense(year, id)
│   │   ├── useGluehweinCatalog.js # fetchItems(year) (products + that year\'s terms + recipe), saveItem, deleteItem (soft), saveTerms(year,itemId,terms), saveRecipe(productId,rows); ingredients: `useGluehweinIngredients.js`
│   │   ├── useSalesDays.js     # useSalesDays(action): fetchDays(year), addDay(year,date), deleteDay(id)
│   │   ├── useSalesKasse.js    # useSalesKasse(action): fetchKasse(year), saveCard, saveCount(year,phase,cents,qty), lockKasse/unlockKasse; shared read `loadKasse` (also used by useSalesActions)
│   │   ├── useSalesEntries.js  # useSalesEntries(action): fetchEntries(year), saveEntry(year,entry), deleteEntry(id)
│   │   ├── useGluehweinShifts.js # useGluehweinShifts(action): fetchShifts(year), addSlots(dayId,templates), addSlot, updateSlot, copySlots, removeSlot, assign/unassign(shiftId,horiId)
│   │   ├── useLasagnen.js      # fetchOrders (all Horis LEFT JOIN lasagna_orders), saveOrder (upsert by hori_id)
│   │   ├── useCurrency.js      # formatCurrency(amount, currency)
│   │   └── useFocusTrap.js     # Keyboard focus trap for modals
│   ├── db/
│   │   ├── sqliteEngine.js      # sql.js (WASM) wrapper. Web target only. Rebinds window.electron.db.
│   │   └── migrations.js        # Schema + migrations 0–39 (runtime-agnostic).
│   ├── sync/
│   │   ├── config.js            # Owner/repo/branch defaults + localStorage keys.
│   │   ├── githubSync.js        # GitHub Contents API client (fetchDb, pushDb, verifyAccess).
│   │   ├── SyncStatusBadge.jsx  # Header pill: Synced/Unsaved/Saving/Saved/Conflict/Error.
│   │   ├── SyncStatusBadge.css
│   │   ├── SyncConflictModal.jsx # 409/422 resolution UI (discard local | force overwrite).
│   │   └── SyncConflictModal.css
│   ├── auth/
│   │   ├── GitHubAuth.jsx       # First-run PAT prompt + verifyAccess gate.
│   │   └── GitHubAuth.css
│   └── utils/
│       ├── documentLifecycle.js  # Status FSM (pure functions, no DB)
│       ├── jobHours.js           # Pure helpers: planned/actual hours, work share, camp contribution reduction
│       ├── jobDocumentLines.js   # Pure: groupHoriHours, formatClockRange, buildJobItems (job → offer/invoice lines)
│       ├── heatColor.js          # Shared red→yellow→green heat scale for share bars
│       ├── lasagnaFinance.js     # Pure: lasagnaAmounts(row,settings), lasagnaSummary({orders,settings,manual}), lasagnaSaldo(...), SALES_ACTIONS, salesActionMonthKey(action,year,date), EXPENSE_CATEGORIES, incomeFor(row,min), INCOME_CATEGORIES, categoriesFor(kind), incomeTotals(rows,minFor), incomeEntries(rows,minFor,nameFor), expenseTotal(list)
│       ├── lasagnaBonus.js       # Pure: lasagnaShares(rows), bonusReductionPct({sharePct,enabled,factor}), applyBonus(contribution,pct), lasagnaBonusFromSettings(settings)
│       ├── gluehweinFinance.js   # Pure: saldo(entries, kasseLines) → {income,expense,saldo}, DENOMS, kasseCash, kasseIncome, saldoMonthKey(days,action,year) (month of the first sale day)
│       ├── gluehweinShoppingList.js # Pure: buildShoppingList({products,ingredients,productTerms,ingredientTerms,recipe}) → rows (Zutat/Produkt, need, stock, toBuy, packs, cost) + total
│       ├── gluehweinBonus.js     # Pure: gluehweinShares(rows) (extra shifts above mandatory / all extra shifts), gluehweinBonusFromSettings(settings); re-exports bonusReductionPct, applyBonus
│       ├── campContribution.js   # Lagerbeitrag formula: base, minimum, reduction per %
│       └── validators.js         # Email regex, phone (libphonenumber-js), VAT (VIES), address (Nominatim)
├── CLAUDE.md            # ← this file
├── CHANGELOG.md         # Version history
├── PROJECT_RECAP.md     # Legacy overview (superseded by this file)
├── package.json         # version field is the app version shown in sidebar
└── index.html           # Vite entry
```

---

## Web target — sync model

Static SPA on GitHub Pages. SQLite DB binary lives at `data/invoiceforge.db` in a private repo (default: `Lexon245/maria-goretti-invoices`). Browser uses **sql.js** (WASM) to read/mutate; **GitHub Contents API** to fetch on boot and PUT on debounced save.

- **Boot**: `Bootstrap` reads PAT from `localStorage` → `githubSync.fetchDb()` → `sqliteEngine.init(bytes)` → `runMigrations()` → `installAsElectronShim()` rebinds `window.electron.db` so the rest of the app sees the same surface.
- **Save**: every mutation marks the engine dirty and emits an event. After 3 s of idle (`SYNC_DEBOUNCE_MS`), `Bootstrap` exports bytes and `PUT`s to the Contents API with the cached SHA. On `beforeunload`, a `keepalive: true` fetch flushes any pending bytes.
- **Conflict**: 409/422 SHA mismatch → `SyncConflictModal`. Two paths: discard local + reload, or re-fetch SHA and force-overwrite.
- **Auth**: fine-grained PAT in `localStorage` under key `mg-invoices-pat`. Required scope: `Contents: Read and write` on the data repo only. Sign-out wipes the key. CSP `<meta>` in `index.html` restricts `connect-src` so leaked tokens can't be exfiltrated to a foreign origin.

## IPC bridge (Electron ↔ React)

`preload.js` exposes three methods via `contextBridge`:

| Method | Signature | Notes |
|--------|-----------|-------|
| `window.electron.db.query` | `(sql, params?) → row[]` | SELECT |
| `window.electron.db.run` | `(sql, params?) → { changes, lastInsertRowid }` | INSERT/UPDATE/DELETE |
| `window.electron.db.transaction` | `(ops: {sql,params}[]) → results[]` | Atomic multi-statement |

`useDatabase` hook wraps these with error logging. Never call `window.electron.db` directly from components — always go through hook.

---

## Database schema

Managed by `electron/database.js`. Migrations version-gated via `schema_version` table.

### Tables

**`settings`** — key/value store. One row per setting key.

**`clients`**
```
id, name, email, phone, address_street, address_zip, address_city, address_country,
vat_number, iban, notes,
email_valid(0/1), phone_valid(0/1), address_verified(0/1),
vat_valid(0/1), vat_company_name, vat_validated_at,
created_at
```

**`product_categories`**
```
id, name, name_de, name_fr, color, sort_order, created_at
```

**`products`**
```
id, name, name_de, name_fr, description, description_de, description_fr,
rate, unit, category_id(FK), created_at
```

**`documents`**
```
id, type(invoice|quote), number, title, client_id(FK), date, due_date,
status, payment_mode(standard|cash), language(en|de|fr),
tax_rate, discount, discount_type(percent|fixed),
notes, currency,
issued_at, paid_at, cancelled_at, locked(0/1), source_quote_id(FK),
created_at
```

**`document_items`**
```
id, document_id(FK), description, quantity, unit_price, total, sort_order
```

**`payments`**
```
id, document_id(FK), amount, currency, method, paid_at, reference, notes, created_at
```

**`horis`** (migration 18) — helpers
```
id, name, (contact/notes fields), created_at
```

**`jobs`** (migration 18) — Arbeiten work dates
```
id, title, date, start_time, end_time (nullable = open end), planned_hours, actual_hours,
client_id(FK), quote_id(FK), invoice_id(FK), notes, created_at
```

**`job_assignments`** (migration 18)
```
id, job_id(FK), hori_id(FK), hours
```
**Offer/invoice from a job**: Arbeiten (list row icons / JobModal "Dokumente") → `App.handleCreateDocFromJob(jobId, type, params)` builds editor `initialData` with `source_job_id` (not a DB column; lives only in editor state). `App.handleSaveDoc` on the first save sets `jobs.quote_id` / `jobs.invoice_id`; a new invoice with `source_quote_id` also links to the job whose `quote_id` matches. Invoice for a job with a quote → reuses `handleConvertToInvoice`. Already linked → `App.handleOpenDoc(docId)`.
Settings (edited in a popup on the Horis page, not in Settings > Billing): `camp_base_contribution` (max per Hori), `camp_min_contribution` (floor), `camp_reduction_per_percent` (€ per 1% work share; empty = proportional). Formula in `utils/campContribution.js`: max(min, base − reduction).

**`lasagna_orders`** (migration 26) — one row per Hori
```
id, hori_id(FK, UNIQUE), bolo, veggie, paid(0/1), final_amount (nullable)
```
Settings: `lasagna_price` (one base price per lasagne, Bolo and Veggie alike), `lasagna_discount_from` (count per Hori, Bolo + Veggie, from which the discount applies; empty/0 = none), `lasagna_discount_price` (one discount price per lasagne; empty/0 = no discount). Missing keys read as 0. Betrag min = (Bolo + Veggie) × applicable price: `lasagna_discount_price` once the threshold is reached and that price is > 0 (all-units), else `lasagna_price`. Betrag final is user-entered and always saved; below Betrag min it is only highlighted red. A paid row is locked (inputs disabled) until Bezahlt is unticked. The lasagne price keys are edited only in the Lasagnen-Preis popup (not in Settings). Bonus: `lasagna_bonus_enabled` ('0'/'1'), `lasagna_bonus_factor` (% of the share applied, default 100). Share = Hori's Bolo + Veggie / total of all active Horis; Lagerbeitrag reduction % = share × factor / 100 (helpers in `utils/lasagnaBonus.js`). Einkaufsliste stock on hand: `lasagna_stock_<item key>` (base unit, blank = 0; item keys in `utils/lasagnaShoppingList.js`).

**`lasagna_expenses`** (migrations 29, 30) — manually entered Lasagnen entries per scout year: expenses and extra income (e.g. donations)
```
id, year, kind (expense|income), date (unused, always NULL), description, category (expense: ingredients|packaging|material|other; income: donation|other_income); newest entry first, amount, created_at
```
Lasagnen tab "Finanzen": Einnahmen = manual income entries + sum over the Übersicht Horis (active, or all with "Inaktive anzeigen"; name search ignored) of Betrag final, or Betrag min while Betrag final is empty; "bezahlt" = rows ticked Bezahlt, "offen" = rest. Saldo = Einnahmen − Ausgaben. Per-Hori income lines are read-only (edit them in the Übersicht). Locked year: expenses read-only (`saveExpense`/`deleteExpense` throw `YEAR_LOCKED`).

**`gw_items`** (migration 31) — Glühwein catalog, 15 seeded items (drinks, add-ons, beers, special beers)
```
id, name, kind (drink|addon|beer|beer_special|ingredient), unit (default 'Stk'), sort_order, active(0/1), created_at
```

**`gw_item_terms`** (migration 31) — per item and scout year
```
item_id(FK), year, sell_price, buy_price, pack_type (none|kasten|flasche|paket), pack_size, planned_qty; PK (item_id, year)
```
"Start new year" copies the terms to the new year with `planned_qty` 0. Days, shifts, Kasse and entries are not copied.

**`gw_item_terms`** extra columns (migration 39): `buy_unit` (free text), `buy_pack_price` (price per buying unit); `pack_size` = content (selling units per buying unit); legacy `pack_type`/`buy_price` are still written for compatibility. Migration 39 maps old rows losslessly (buy_pack_price = buy_price × pack_size); migrated multi-pack items start with content 1 ("Inhalt fehlt" badge).

**`gw_ingredients`** (migration 37) — ingredients (id, name, unit, sort_order, active) + **`gw_ingredient_terms`** per year (buy_price, pack_type, pack_size, extra_qty = Zusatzbedarf, stock_qty = Bestand; reset to 0 on a new year). `gw_items.kind` is legacy and unused (new products get 'drink').

**`sales_kasse`** (migrations 32, 38) — one row per action + year: card_amount, locked, counted_cash (legacy "Sonstiger Bargeldbetrag", included in the cash total) + **`sales_kasse_counts`** (kasse_id, phase start|end, denom_cents, qty). Bargeld = Σ (Ende − Start) × denomination; Bargeld and Kartenzahlung are read live as income lines (no `sales_entries` row is written for the Kasse any more).

**`gw_recipe`** (migration 31, rebuilt in 37)
```
product_id(FK gw_items), ingredient_id(FK gw_ingredients), qty_per_unit; PK (product_id, ingredient_id)
```
Einkaufsliste: planned_qty × qty_per_unit per ingredient (a product without recipe is bought itself), rounded up to whole packs; no stock.

**`sales_entries`** (migration 32) — Einnahmen/Ausgaben of a Verkaufsaktion (now Glühwein)
```
id, action, year, kind (expense|income), description, category, amount, source_kasse_id (UNIQUE when set), created_at
```

**`sales_days`** (migration 32)
```
id, action, year, date; UNIQUE (action, year, date)
```

**`gw_shifts`** (migration 33)
```
id, day_id(FK sales_days, CASCADE), start_time, end_time; UNIQUE (day_id, start_time)
```

**`gw_shift_assignments`** (migration 33)
```
shift_id(FK, CASCADE), hori_id(FK, CASCADE); PK (shift_id, hori_id)
```
Settings (saved per scout year in `year_settings` via `useSettings.saveYearSettings`, read via `loadYearSettings`, year-locked like the Lasagnen amounts, edited in `GluehweinShiftSettingsModal`): `gluehwein_mandatory_shifts` (whole number, default 0), `gluehwein_bonus_enabled` ('0'/'1'), `gluehwein_bonus_factor` (default 100), `gluehwein_shift_templates` (JSON array, default `["16:00-19:00","19:00-22:00"]`). Bonus: extra shifts = max(0, shifts − mandatory); share = Hori's extra shifts / extra shifts of all active Horis; Lagerbeitrag reduction % = share × factor / 100 (`utils/gluehweinBonus.js`). On the Horis page the Lasagnen and Glühwein % are added up, max 100 %.

**Verkaufsaktionen → Dashboard Umsatz.** The Saldo of a Verkaufsaktion (Lasagnen and Glühwein count; Baseball is already in `SALES_ACTIONS` in `utils/lasagnaFinance.js` with a base page and date, its Saldo is added once it tracks money; sources in `SALDO_SOURCE` of `hooks/useSalesActions.js`) counts into the Dashboard and Dashboard 2.0 Umsatz card and chart when the checkbox "Verkaufsaktionen einrechnen" is on (localStorage `dashboard_include_sales_actions`, default on). Lasagnen: the Saldo lands in the month of the action's date: `year_settings` key `lasagna_action_date` (YYYY-MM-DD, set per scout year next to the year switcher on the Lasagnen page, not copied by "Start new year"; keys ending in `_action_date`). Glühwein: Saldo = `sales_entries` income − expense; it lands in the month of the first sale day (`sales_days`), else of `gluehwein_action_date`, else the default month. The Kasse (Bargeld + Kartenzahlung) counts live as income. Without a date: first-half actions (Lasagnen, Glühwein) count in December of the start year, second-half actions (Baseball) in June of the end year. A Glühwein load error (e.g. older DB) only drops its numbers; Lasagnen errors still propagate. The Dashboard uses active Horis only. A net-negative month is drawn on the chart baseline; the card sums the real values.

**`document_events`** — append-only audit log
```
id, document_id(FK), event_type, payload_json, created_at
```

---

## Document lifecycle (state machine)

Defined in `src/utils/documentLifecycle.js`. Pure functions, no side effects.

### Invoice statuses
```
draft → sent → paid
             → overdue (derived: sent + due_date < today)
             → cancelled
paid → sent  (unlock for edit)
```

### Quote statuses
```
draft → sent → accepted → converted
             → declined
```

### Key functions
- `canTransition(doc, nextStatus)` — boolean
- `allowedNextStatuses(doc)` — array of valid next statuses
- `applyTransition(doc, newStatus)` — returns patch object `{ status, locked, issued_at, paid_at, cancelled_at }`
- `effectiveStatus(doc)` — returns `'overdue'` when `status === 'sent'` and past due date, otherwise `doc.status`

**Transitions always run inside `useDocuments.transitionDocument(doc, newStatus)`** — wraps DB writes in single `transaction([...])`.

---

## State management (App.jsx)

No external store. `App.jsx` holds:

```js
view          // 'dashboard' | 'dashboard2' | 'invoices' | 'quotes' | 'clients' | 'products' | 'arbeiten' | 'horis' | 'lasagnen' | 'gluehwein' | 'baseball' | 'settings'
isEditing     // bool
editingData   // null | { doc, type }
appSettings   // loaded once from DB on mount
```

Navigation: `setView(id)` passed down through `Layout` → `Sidebar`.  
Opening editor: `setIsEditing(true); setEditingData({ doc, type })`.  
Back from editor: `setIsEditing(false); setEditingData(null)`.

---

## Design system

All tokens in `src/index.css` under `:root`.

### Key tokens
```css
--color-indigo: #6366F1          /* primary accent */
--color-indigo-hover: #4F46E5
--color-indigo-alpha: rgba(99,102,241,0.10)
--color-light-bg: #F1F5F9        /* page background */
--color-light-surface: #FFFFFF   /* card background */
--color-border-light-theme: #E2E8F0
--color-text-dark-primary: #0F172A
--color-text-dark-secondary: #475569
--color-text-dark-tertiary: #94A3B8
--color-danger: #FF4D4D
--color-success: #00E676
--color-warning: #FFD600
--font-sans: 'Inter', system-ui  /* body */
--font-heading: 'Outfit'          /* h1-h6 */
--font-mono: 'JetBrains Mono'    /* numbers, codes */
--transition-fast: 150ms cubic-bezier(0.4,0,0.2,1)
--transition-normal: 250ms cubic-bezier(0.4,0,0.2,1)
```

### Shared CSS classes (index.css)
- `.card` — white surface with border + shadow
- `.page-header` — flex row, space-between, top of every list page
- `.search-bar` — icon + input, max-width 400px
- `.page-error` — red alert banner
- `.clients-table thead th, .doc-table thead th` — sticky headers
- **Table alignment rule**: everything is left-aligned (names, ages, hours, bars) except money, which is right-aligned. Header and cells always share the same edge (left edge for left-aligned, right edge for right-aligned columns), and the footer totals follow their column. The sort arrow always sits after the label; right-aligned cells get a right gutter as wide as the arrow (17px) so the numbers end exactly where the header label ends (see `.horis-table td.num`).

### Responsive breakpoints
- `1100px` — dashboard stats 4→2 col; bottom grid stacks
- `820px` — settings tabs go horizontal above body
- `700px` — doc editor section grids + bottom section stack; chart toolbar wraps
- `600px` — dashboard stats 2→1 col; hero card stacks
- `560px` — client modal form rows stack

### Sidebar
- Expanded: `264px` — full labels, section headers, user profile
- Collapsed: `72px` — icons only, tooltips via `title` attr
- Toggle: `sidebar-collapse-btn` in sidebar header
- State: `sidebarCollapsed` in `Layout.jsx`, CSS class `.sidebar.collapsed`

---

## Multilingual documents

Documents carry `language: 'en' | 'de' | 'fr'`.  
`DocumentEditor` has language switcher in header actions.  
`DocumentPreview` renders labels from settings translations (`trans_invoice_en`, `trans_date_de`, etc.).  
Products have `name`, `name_de`, `name_fr` and `description`, `description_de`, `description_fr`.

---

## Document numbering

Pattern stored as JSON array in settings (`invoice_pattern`, `quote_pattern`).  
Each segment: `{ id, type: 'text'|'date'|'sequence', value, format }`.  
`useSettings.getNextDocumentNumber(type)` builds string from pattern + current sequence.  
`useSettings.incrementDocumentNumber(type)` advances counter after save.

---

## Versioning scheme

| Bump | When |
|------|------|
| `x.0.0` | Core architecture change, Electron upgrade, schema breaking change |
| `0.x.0` | New feature, significant UX overhaul, new page/major component |
| `0.0.x` | Bug fix, style tweak, minor QoL improvement |

Version in `package.json` is single source. Sidebar reads it via:
```js
import { version as appVersion } from '../../package.json';
```

**Always bump `package.json` version AND add entry to `CHANGELOG.md` before finishing change session.**

---

## Adding a new feature — checklist

1. Schema change? Add migration in `electron/database.js`, bump `schema_version`.
2. New data access? Add method to relevant hook in `src/hooks/`.
3. New page? Create `pages/Foo.jsx` + `pages/Foo.css`. Add nav item to a section of `navSections` in `Sidebar.jsx` (Übersicht / Finanzen / Arbeiten / Aktionen / Allgemein; Übersicht = Dashboard, Dashboard 2.0) and a title in `Layout.jsx` `VIEW_TITLE_KEYS`. Add view case in `App.jsx`.
4. New component? Add to `src/components/`. Keep CSS scoped to component class.
5. New setting key? Add default in `useSettings.js` default object + `Settings.jsx` form.
6. Bump version in `package.json`.
7. Add `CHANGELOG.md` entry.

---

## Known constraints

- `overflow: hidden` on `body` — intentional, prevents OS scrollbar flash. Content scroll in `.content-body` (`overflow-y: auto`).
- `app-container` has `min-width: 480px` — prevents layout collapse on tiny windows.
- Settings body column uses `minmax(0, 1fr)` — required; plain `1fr` lets content overflow grid container.
- Translation table + numbering editor use internal `overflow-x: auto` — content has `min-width` so columns don't crush on narrow sidebars.
- Browser preview (Vite dev) uses in-memory stub DB — data doesn't persist, some IPC-dependent features behave differently.
