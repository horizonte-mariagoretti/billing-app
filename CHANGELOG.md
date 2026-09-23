# Changelog

## [1.7.6] - 2026-09-24

### Fixed
- **NumberingEditor: too much space before the first dropdown**: the drag-handle column was 24px with 2px of its own padding for a 16px icon, plus 10px row padding — ~42px of empty space before "Statischer Text" started. Drag column tightened to 16px (icon-exact), its padding removed, and row padding evened to 8px all around, so the leading gap drops to ~33px. (The previous v1.7.6 attempt widened `.pattern-rows` min-width instead — reverted, that solved a different, unrelated problem.)

## [1.7.5] - 2026-09-24

### Changed
- **Umsatzübersicht (revenue chart) toolbar redesign**: separate outlined pills merged into one connected segmented control (single shared border, hairline dividers, no gaps). Removed the subtitle line under the title entirely (it duplicated info already visible on the pills / the custom-range date pickers). Custom range values now persist to `localStorage` (`dashboard_custom_from`/`_to`), so the last manually-picked date range survives a reload instead of resetting to the current fiscal year every time.

## [1.7.4] - 2026-09-23

### Fixed
- **Dashboard custom-range date fields too wide**: the shared `DatePicker`'s input is `flex:1` (built to fill a full form field), leaving a large empty gap before the calendar icon in the compact pill-row context. Scoped down under `.custom-range` in `Dashboard.css` only: fixed `11ch` width, smaller padding, and font-size matched to the panel's subtitle text (`0.82rem`). `DatePicker.jsx`/`.css` themselves are untouched, so every other usage (document editor dates) is unaffected.

## [1.7.3] - 2026-09-23

### Added
- **Custom arrow-key stepping**: Qty/Duration/Rate/Discount/Tax number fields now step by 0.5 on plain ArrowUp/Down, 1.0 with Shift, 0.1 with Ctrl, and 10.0 with Shift+Ctrl — overriding the browser's single fixed `step`.
- **Select-on-focus for number fields**: fields prefilled with `0` (or any value) now select their full contents on focus, so typing overrides instead of appending after the existing digit (e.g. typing "5" into "0" gives "5", not "05"). Applied across the item Qty/Duration/Rate/Discount/Tax fields, the Products rate field, and the Settings numbering counter/tax-rate fields.

### Fixed
- **Menge column narrower than Dauer/Preis**: widened to match (92px each) so all three line-item numeric columns are equal width.
- **NumberingEditor row alignment**: the type-select column (e.g. "Datumskomponente") was a fixed 140px, truncating the longer German labels; widened to 172px. Also gave every `select`/`input` in a numbering row an explicit `width: 100%` — the "Counter" value field and the "Format" dropdown weren't reliably filling their grid column, so they visually misaligned row to row.
- **Settings "Translations" tab removed**: the PDF-label override table (EN/DE/FR per document label) is dropped along with its dead CSS; the legacy `trans_*` fields stay in the settings object for backward compatibility but are no longer editable from the UI.
- **Discount type UI clarity**: replaced the plain "%"/"Fixed" native `<select>` with the app's `StyledSelect` (custom dropdown, no OS-native popup), matching the Kategorie/Einheit dropdowns; widened the discount amount input from 40px to 64px.
- **Dashboard scout-year pill labels**: shortened to "H1"/"H2"/"Dieses Jahr"/"Letztes Jahr"/"Eigene Dauer" (DE) and made the pills hug their own text instead of using generous fixed padding.
- **Dashboard custom-range date inputs**: replaced native `<input type="date">` with the app's own `DatePicker` component for visual consistency with the rest of the app.
- **DB migration 16**: updates `dashboard_range_h1/h2/current/last/custom` DE translation values to the new shorter labels.

## [1.7.2] - 2026-09-23

### Fixed
- **Line-item name/description seam**: Each got independent `border-radius` on all four corners, so when the row's hover backdrop and the name field's own focus highlight were both visible at once, a rounded notch showed at the seam between them. Name is now rounded top-only, description bottom-only, so they always read as one seamless block; each still gets its own distinct rounding when highlighted alone.
- **Menge/Dauer/Preis column alignment**: Duration had a stray `padding-top: 2px` + flex wrapper the other two columns didn't, sitting visibly lower. Removed; all three now align to the same top edge as Qty/Rate.
- **"Dauer (h)" header wrap + narrow columns**: Widened Qty/Duration/Rate/Total columns (52→64px, 60→92px, 72→88px, 96→104px) so the header no longer breaks onto two lines. Added a `.col-desc` min-width floor so the description column can no longer get squeezed into 1-character-per-line wrapping at narrow widths (`.items-list` scrolls horizontally instead).
- **Product picker showed no name**: "Aus Produkten hinzufügen" search list and `addProductItem` read the now-always-empty legacy `name` (English) field instead of falling back to `name_de`/`name_fr`. Added `getProductLabel`/`getProductDesc` helpers (doc-language-aware, DE/FR fallback chain) used by both the search filter and the inserted line item.
- **Category dropdown used native `<select>`**: its open list is unstylable OS chrome and looked out of place next to the app's custom-styled controls. Extracted the ad-hoc `StyledSelect` from `DocumentEditor.jsx` into a shared `src/components/StyledSelect.jsx` (+ `.css`) and used it for the product modal's Kategorie and Einheit dropdowns.
- **Category editor still had an EN field**: same leftover-English issue as the product modal — removed the "(EN)" name input; the remaining primary field now writes into both `name_de` and the legacy `name` column (kept for backward-compatible display code) and is labeled "Kategoriename". New migration seeds the `cat_field_name` translation key.
- **Inline category editor overflowed the product modal**: `CategoryEditor`'s 3-column grid layout was built for the wide "manage categories" panel and didn't fit the narrower modal. Switched to a `flex-wrap` layout that reflows naturally, and added a `compact` prop (used only in the modal) that stacks the fields onto their own lines instead of squeezing.
- **DB migration 15**: seeds `cat_field_name` translation keys (DE/FR/EN).

## [1.7.1] - 2026-09-23

### Fixed
- **Products modal EN tab removed**: App dropped English support (`LANGUAGES = ['de', 'fr']` in `constants.js`) but the product edit modal still had a leftover EN tab with "Product Name (EN)"/"Description (EN)" fields. Removed; DE is now the default active tab and its name field is required.

## [1.7.0] - 2026-09-23

### Added
- **Row-click navigation**: Invoices, quotes, clients, and products tables now open the editor/modal on clicking anywhere in the row, not just the Edit icon. Delete and Edit buttons stop propagation so they still work independently.
- **Unlock from any locked state**: Cancelled invoices and converted quotes can now be unlocked back to draft via the existing "Unlock for Edit" button — previously only `sent`/`paid`/`accepted`/`declined` states allowed this.
- **Scout-year dashboard ranges**: Revenue chart time-span pills replaced with First Half (Sep 1–Dec 31), Second Half (Jan 1–Aug 31), Current Scout Year (Sep 1–Aug 31), Last Scout Year, and Custom.
- **DB migration 14**: Seeds `dashboard_range_h1`, `dashboard_range_h2`, `dashboard_range_current`, `dashboard_range_last` translation keys.

### Changed
- `documentLifecycle.js`: `cancelled` and `converted` now transition to `draft` (unlock for edit).

## [1.6.0] - 2026-08-13

### Added
- **Duration (hours) column**: New `duration` field on each line item (default 1). Item total is now `qty × rate × duration`. Column is togglable via checkboxes in the items section header.
- **Per-document column visibility**: `visible_columns` JSON on the `documents` table controls which columns (Qty, Duration, Rate, Total) are shown in the editor, HTML preview, and PDF export. Description is always visible.
- **Column toggle checkboxes**: Four checkboxes in the "Line Items" header let users show/hide Qty, Duration (h), Rate, and Total columns per document.
- **DB migration 9**: Adds `duration REAL DEFAULT 1` to `document_items` and `visible_columns TEXT` to `documents`; seeds `col_duration` and `col_columns` translation keys.

## [1.5.8] - 2026-06-01

### Fixed
- **Settings preview badge**: Dark background (`var(--color-text-dark-primary)`) replaced with `var(--color-light-surface)` white; label color fixed from dark-mode `--color-text-tertiary` to light-theme `--color-text-dark-tertiary`. Border upgraded to `--color-primary-border`.
- **Stray dark-mode tokens**: `var(--color-text-tertiary)` (dark theme `#8B8F98`) replaced with `var(--color-text-dark-tertiary)` in `ClientModal.css`, `Clients.css`, `Products.css`, and the global search bar icon in `index.css`.

## [1.5.7] - 2026-06-01

### Changed
- **Token hygiene**: Last two hardcoded `rgba(187,22,21,...)` values (SVG chart gradient stops in `Dashboard.jsx`) replaced with `stopColor="var(--color-primary)"` + `stopOpacity`. Zero hardcoded primary red hex/rgba values now exist outside `index.css`.

## [1.5.6] - 2026-06-01

### Changed
- **Hero card gradient**: Richer three-stop red gradient (`#1C0504 → #BB1615 → #8E1210` at 150°) with warm radial highlight at top-right and deep shadow at bottom-left for a dimensional, premium look.
- **Chart area fill**: Fixed missed indigo hex in SVG `linearGradient` — now fades from `rgba(187,22,21,0.18)` to transparent, matching the CI red line.

## [1.5.5] - 2026-06-01

### Changed
- **Gradient purge**: Removed all CSS gradients except the hero dashboard card. Buttons, avatars, sidebar CTA, auth pages, bootstrap splash — all now use flat `var(--color-primary)` red.
- **Hero card — red-only**: Replaced the indigo/purple radial overlay and dark-grey base with a pure red-to-dark-red gradient (`#BB1615 → #6B0A09`). Decorative orb-1 (was blue/indigo) updated to red tones.
- Dropped unused `--color-primary-gradient` token from `index.css`.

## [1.5.4] - 2026-06-01

### Changed
- **Token rename**: All `--color-indigo-*` design tokens renamed to `--color-primary-*` across 17 files. Removes the confusing colour-name coupling from the semantic token layer — changing the hex value no longer requires reasoning about "indigo".
- **Sidebar light theme**: Sidebar background changed from dark (`#1A1D23`) to white (`#FFFFFF`). All text, border, and background values inside the sidebar flipped to light-theme equivalents using existing design tokens. Active nav item now uses `--color-primary-alpha` tint with `--color-primary` text instead of white-on-red.

## [1.5.3] - 2026-06-01

### Changed
- **CI color rebrand**: Replaced indigo/purple brand color (`#6366F1`) with corporate identity red (`#BB1615`) across the entire app. All 15+ unique alpha and gradient values are now fully tokenised in `index.css` under `--color-indigo-*` tokens — a single variable change updates every tint, border, shadow, and gradient app-wide. Dashboard stat card colors unchanged.

## [1.5.2] - 2026-05-29

### Changed
- Replaced all hardcoded `#F8FAFC` color values (41 occurrences across 13 CSS files) with `var(--color-surface-muted)`. Design token `--color-surface-muted: #F8FAFC` is now the single source of truth for the light muted surface color.

## [1.5.0] - 2026-05-29

### Added
- **Bottom navigation bar** (mobile ≤768px): Fixed 5-tab bar (Dashboard, Invoices, Quotes, Clients, Settings) at the bottom of the screen — thumb-reachable primary navigation. Hidden in document editor mode. Active tab shown with indigo color and bolder icon stroke.
- **Document editor form/preview toggle** (≤960px): Sticky tab bar above the split panel lets users switch between "Edit" and "Preview" modes on mobile/tablet — eliminates mandatory scroll through a 540px PDF preview.

### Changed
- **iOS auto-zoom prevention**: All inputs, textareas, and selects are forced to `font-size: 16px` on mobile (≤768px). iOS Safari zooms the viewport when an input has `font-size < 16px` — this was the #1 iOS usability bug.
- **Items grid — stacked card layout** (≤540px): Line-item rows now use a 2-row grid (name full-width on row 1; qty × rate = total + delete on row 2). Inputs get visible borders and min-height of 36px. Lifecycle action bar switches to horizontal scroll so buttons stay full-size.
- **Tables reflow to card layout on mobile** (≤640px): Invoice and client tables reflow to compact 2-row cards at small widths — no more horizontal scrolling through 7 columns. Columns shown: Number + Client + Status + Amount + Actions (invoices); Name + Email + Phone + DocCount + Actions (clients).
- **Products table overflow fix**: Changed `overflow: hidden` → `overflow-x: auto` on `.products-table-container` — content was silently clipped on mobile.
- **Touch targets**: All buttons raised to 44×44px minimum on mobile (btn-sm → 40px, btn-md → 44px, hamburger → 44px, back button → 44px, sidebar nav items → 44px min-height). Action buttons in card views get 36×36px targets.
- **Safe-area insets**: Sidebar footer and content-body bottom padding now respect `env(safe-area-inset-bottom)` for iPhone notch/home-indicator devices.
- **Tap delay**: `touch-action: manipulation` added globally to all interactive elements — eliminates 300ms tap delay on older mobile browsers.

## [1.4.0] - 2026-05-28

### Added
- **Full tablet & phone responsiveness**: App now works at 768px (tablet) and 375px (phone) with graceful degradation down to 320px.
  - **Mobile sidebar overlay**: Hamburger button in header slides a fixed-position sidebar in from the left with a dark backdrop. Tapping backdrop or any nav item closes it. Desktop collapse toggle hidden on mobile.
  - **Breakpoints added**: 768px, 600px, 480px, 375px across 16 CSS files.
  - **Data tables scroll horizontally**: Invoices, Quotes, Clients, Products tables wrap in scrollable containers — all columns and action buttons remain accessible.
  - **Page headers stack vertically**: Search bar and New button stack on narrow screens (all list pages).
  - **DocumentEditor items grid**: Drag handle column hidden below 600px; rate and qty remain editable. Padding tightened further at 480px.
  - **Dashboard hero orbs hidden** at ≤768px (decorative elements had fixed off-screen positions).
  - **Modals & overlays** (ConfirmDialog, ClientModal, SyncConflictModal) clamp to viewport width at ≤600px/480px.
  - **Settings**: Body padding and tab sizing reduced at ≤600px.
  - **GitHub Auth, Bootstrap splash**: Padding and layout adjusted for narrow screens.
  - `min-width` on `.app-container` lowered from 480px to 320px.

## [1.3.0] - 2026-05-22

### Added
- **Item name/description split**: Each line item now has a separate bold "Artikelname" field and an optional "Beschreibung" subtext. DB migration 7 adds a `name` column to `document_items` and backfills existing rows by splitting on the first newline. Old items render correctly via fallback.
- **Custom DatePicker**: Replaced native `<input type="date">` fields in DocumentEditor with a custom calendar popup matching app design tokens (indigo accent, Monday-first, German month/weekday labels, click-outside dismiss, Escape key support).
- **Client search combobox**: Client selector replaced with a live-filter search input. Typing filters the client list inline; selecting "Neuen Kunden anlegen" opens a full `ClientModal` overlay with all fields and live validation (email, phone, VAT, address lookup). New client is auto-selected after save.
- **Custom Products dropdown**: "Add from Products" now uses a styled dropdown button (matching the Currency selector) instead of a native `<select>`.
- **`ClientModal` component**: Extracted client create/edit form (all fields, live validation, focus trap) into a reusable `ClientModal` component. Used by both `Clients` page and `DocumentEditor`.

### Changed
- **Item column widths**: Menge and Preis columns widened to `100px` / `140px` so values are not clipped.
- **Item row hover**: Rows now show rounded corners on hover (`border-radius: var(--radius-md)`).
- **Item textarea styling**: Description textarea is borderless; only a bottom-line appears on hover/focus. No visible box at rest.
- **Client label**: "People" label renamed to "Kunde".
- **Cash payment note**: Removed cash-payment notice from PDF preview and print output.
- **Number spinners**: Removed up/down arrow spinners from all `<input type="number">` elements globally via `index.css`.
- **`Clients` page**: Refactored to delegate modal rendering to `ClientModal` — removed inline form state, validation hooks, and ~100 lines of duplicated logic.

### Fixed
- PDF preview now has correct grey surround and white A4 page with shadow for a "printed document" appearance.

## [1.2.1] - 2026-05-21

### Changed
- **DocumentEditor — form grouping**: Subject, Due Date, Currency, Doc Number, and Issue Date collapsed into one card (was 3 separate cards). Doc number/date row gets a dashed top divider to stay visually secondary.
- **Items (Positionen)**: Qty and Rate inputs replaced with minimal inline numbers — no box/border, only a bottom-line on hover/focus. Description textarea keeps its bordered box. Removes the "extra boxes" visual noise.
- **Styled dropdowns**: Native `<select>` for Client and Currency replaced with `StyledSelect` — a custom dropdown with themed trigger, animated chevron, and a styled option list matching the design system.
- **PDF multi-page**: Print CSS now sets `@page { size: A4; margin: 20mm 22mm }`. Page margins handled by `@page` (not double-padded). Table header repeats on continuation pages; totals block and footer never split across pages.

## [1.2.0] - 2026-05-21

### Changed
- **DocumentEditor — split-panel redesign**: form (left, 420 px, scrollable) and live preview (right, always visible) replace the old single-column + preview-toggle layout.
- Left panel form reordered to match modern invoice-app UX: People → Subject → Due Date + Currency → Doc Number + Date → Products → Notes → Payment mode + Totals.
- Language switcher (EN/DE/FR) and PDF export button moved to the right panel header; top header simplified to back, title, Cancel, Save.
- Added "Add New Line" text button below items list.
- Preview scales at 72 % inside the right panel; phantom height collapsed via negative `margin-bottom` so the panel scrolls correctly.
- Responsive ≤ 900 px: panels stack vertically (form above, preview below).

## [1.1.2] - 2026-05-21

### Changed
- **DocumentPreview**: complete redesign — two-column header (sender info left, doc type/number/dates right), "Bill to" client block, subject accent stripe, cleaner line-items table with `#` column, right-aligned totals breakdown, indigo grand-total bar, professional payment footer with IBAN/BIC and legal line.
- **PDF export — web path**: replaced `html2pdf.js` iframe with `window.open` + native browser print dialog. Fonts load correctly in the new window; no more blank-font renders.
- **PDF export — Electron path**: `printToPDF` margins set to 0 (was 0.4 in ≈ 10 mm). CSS `padding: 20mm 22mm` on `.pdf-page` now controls all spacing; previously the double margin produced ~35 mm gutters.
- Exported HTML includes Google Fonts `<link>` so Inter/Outfit render correctly in both paths.

## [1.1.1] - 2026-05-19

### Fixed
- `githubSync.pushDb`: HTTP 422 (validation error) no longer misclassified as a sync conflict. Only 409 (SHA mismatch) triggers the conflict modal; 422 surfaces as a hard error with the full GitHub response body.
- `App.jsx`: `loadSettings()` failure now logs to console and shows a `page-error` banner instead of silently keeping `appSettings` null, preventing invisible cascading UI failures.

## [1.1.0] - 2026-05-18

### Added
- **App UI translation system**: all UI strings now sourced from `ui_translations` DB table (migration #6). `useUiTranslations` hook + `UiTranslationsProvider` context exposes `t(key)` across all components.
- **German UI**: app defaults to German (`value_de`). Language toggle in Settings → Company switches between DE / FR / EN and reloads; persisted in `localStorage`.
- **Multi-language support**: `useUiTranslations` reads `app_ui_lang` from localStorage and queries the correct DB column.
- **Closable hero card**: dashboard promo banner shows once per day; close button writes today's date to `hero_last_closed` in localStorage; re-appears next calendar day automatically.
- **Clickable recent documents**: each row in the Recent Documents panel opens the full document editor.
- **Custom date range in revenue chart**: "Custom" pill next to 1M/3M/6M/1Y/ALL; defaults to the current fiscal year (01.09–31.08); user can pick any from/to dates. Total Revenue KPI dynamically reflects the active time frame.
- **Document list Name column**: invoices and quotes table now shows Number, Client, **Name**, Date, Status, Amount, Actions.
- **Products list view**: product gallery replaced with a sortable table; search matches all language fields (EN/DE/FR); display name falls back to English when no translation exists for the active UI language.
- **Settings numbering drag-and-drop**: pattern rows are now draggable for reordering via HTML5 DnD; rows have a fixed-width grid for consistent alignment across text/date/counter types.
- **Dev bypass**: `npm run dev:web` (Vite DEV mode) skips GitHub sign-in and uses an empty in-memory sql.js DB — no PAT required locally. Tree-shaken from production builds.

### Changed
- `DollarSign` icon replaced with `Euro` across all pictograms.
- Removed hover lift effect from the 4 KPI stat cards.
- Removed profile avatar from top-right header.
- Document default language changed from EN to DE.
- Language picker order changed to DE / FR / EN throughout the app.

## [1.0.0] - 2026-05-08

### Added — Web target (parallel to Electron)
- **Dual-target build**: same React source now ships both as the existing Electron desktop app AND as a static web app deployable to GitHub Pages. Runtime detection (`window.__ELECTRON_PRELOAD__`) picks the right persistence + PDF path. **No original files were deleted** — `electron/` directory and all Electron deps stay intact.
- **`vite.config.js`**: Electron plugins now gated behind `BUILD_TARGET=web` env var. Default = `electron` (existing `npm run dev` / `npm run build` behaviour preserved). New scripts: `npm run dev:web`, `npm run build:web`. Adds `optimizeDeps.exclude: ['sql.js']` and `assetsInclude: ['**/*.wasm']`.
- **`src/db/sqliteEngine.js` (new)**: in-browser SQLite via `sql.js` (WASM). Exports `init`, `query`, `run`, `transaction`, `exportBytes`, `migrate`, `subscribe`, `installAsElectronShim`. The shim rebinds `window.electron.db` to the WASM engine so `useDatabase.js` and every consumer keep working unchanged.
- **`src/db/migrations.js` (new)**: runtime-agnostic schema + migrations 0–5 extracted from `electron/database.js`. Same DDL, executed against either engine.
- **`src/sync/githubSync.js` (new)**: GitHub Contents API client. `verifyAccess`, `fetchDb` (base64 → Uint8Array), `pushDb` (Uint8Array → base64 with cached SHA), `clearConfig`. Rejects on 409/422 with `code: 'sync_conflict'` so the UI can surface a resolution modal.
- **`src/sync/config.js` (new)**: data-repo defaults (`Lexon245/maria-goretti-invoices` on `main`, `data/invoiceforge.db`) + localStorage keys.
- **`src/sync/SyncStatusBadge.jsx` + `.css` (new)**: header pill showing `Synced / Unsaved / Saving / Saved / Conflict / Sync error`. Click "Unsaved" to flush manually. Subscribes to engine mutations + window `mg-sync` events.
- **`src/sync/SyncConflictModal.jsx` + `.css` (new)**: modal shown on 409/422 with two paths — "Discard local & reload" or "Overwrite remote with my version".
- **`src/auth/GitHubAuth.jsx` + `.css` (new)**: first-run PAT entry. Validates against `GET /repos/{owner}/{repo}` and asserts `permissions.push === true`. Inline help with the exact fine-grained PAT scope (`Contents: Read and write` only). Warns when the token doesn't look fine-grained (no `github_pat_` prefix).
- **`src/Bootstrap.jsx` + `Bootstrap.css` (new)**: orchestrator wrapping `<App>`. In Electron mode it renders `<App />` directly. In web mode it gates on PAT → loads engine → fetches DB → runs migrations → debounces sync (3 s default) → flushes via `keepalive: true` fetch on `beforeunload` → handles conflict & sign-out.
- **`.github/workflows/deploy.yml` (new)**: GitHub Pages deploy on push to `main`. Runs `npm run build:web` and uploads `dist/` artifact.

### Changed
- **`src/main.jsx`**: now renders `<Bootstrap>` instead of `<App>` directly. Original noop shim retained as a pre-Bootstrap safety net.
- **`src/components/Layout.jsx`**: `<SyncStatusBadge>` mounted in the header (web runtime only — Electron never sees it).
- **`src/pages/DocumentEditor.jsx`** (`handleExportPDF`): branches on `window.electron?.pdf?.generate`. Electron path unchanged. Web path lazy-imports `html2pdf.js`, writes the existing standalone HTML into a hidden offscreen iframe, and triggers a Blob download with the same filename pattern (`invoice-{number}.pdf`).
- **`electron/preload.js`**: now also exposes `__ELECTRON_PRELOAD__: true` for runtime detection. No existing API touched.
- **`index.html`**: adds Content-Security-Policy `<meta>` allowing `api.github.com`, `nominatim.openstreetmap.org`, `controlapi.vatcomply.com` (plus `wasm-unsafe-eval` for sql.js). Title also corrected to "InvoiceForge".
- **`package.json`**: deps added — `sql.js@^1.10.3`, `html2pdf.js@^0.10.2`, `cross-env@^7.0.3` (devDep). Existing Electron deps (`better-sqlite3`, `electron`, `electron-builder`, `@electron/rebuild`, `vite-plugin-electron*`) **kept**. Version bumped 0.7.0 → 1.0.0 (architecture change per the versioning rule).

### Security notes
- PAT lives in `localStorage` — only XSS-safe to the extent the app is XSS-safe. CSP meta tag restricts `connect-src` so an injected script can't exfiltrate the token to a foreign origin.
- Token scope must be **fine-grained**, single-repo, `Contents: Read and write` only. The auth UI warns if the token doesn't look fine-grained.
- Single-tenant deployment assumed. Don't share the deployed URL with anyone you wouldn't trust with the data itself.

## [0.7.0] - 2026-05-08

### Added
- **Collapsible sidebar**: toggle button (`PanelLeftClose` / `PanelLeftOpen`) in sidebar header collapses nav to 72 px icon-only mode. Expands back to 264 px. Smooth CSS `transition: width`. Icons show native `title` tooltips when collapsed. Active-dot repositioned for collapsed state. State lives in `Layout` via `useState`; passed as `collapsed` + `onToggleCollapse` props to `Sidebar`.

### Changed
- **Responsive breakpoints — Dashboard**: stats grid collapses 4 → 2 → 1 column at 1100 px / 600 px. Hero card stacks vertically at 600 px. Chart toolbar wraps at 700 px.
- **Responsive breakpoints — DocumentEditor**: `section-grid` and `bottom-section` stack to 1-col at 700 px. `items-list` gets `overflow-x: auto` (line-item rows scroll horizontally rather than squishing).
- **Responsive breakpoints — Settings**: nav tabs go horizontal above body card at 820 px. `settings-grid` stacks at 820 px.
- **Responsive breakpoints — Clients**: modal `form-row` / `three-col` collapse to 1-col at 560 px.
- **Layout min-width**: `app-container` enforces `min-width: 480px` to prevent total layout collapse.
- **Settings grid overflow fix**: `grid-template-columns` second value changed from `1fr` → `minmax(0, 1fr)`. Without this, CSS Grid expands the body column to the intrinsic content width, overflowing the container.
- **Settings — Numbering editor**: `overflow-x: auto` added; `.pattern-rows` gets `min-width: 360px` so pattern rows scroll internally rather than crushing. `pattern-row` first column `140px` → `120px`; middle cols use `minmax(0, 1fr)`. `editor-header` gets `flex-wrap: wrap` so live-preview badge wraps on narrow widths. `preview-badge strong` gets `text-overflow: ellipsis`.
- **Settings — Translations table**: `overflow: hidden` → `overflow-x: auto`; content wrapped in `.translation-table-inner { min-width: 420px }` for horizontal scroll. Key column `160px` → `130px`; lang cols use `minmax(0, 1fr)`.
- **Settings — responsive media query at 820 px**: `pattern-row` columns simplified; redundant `table-header`/`table-row` override removed (handled by base rules).

## [0.6.0] - 2026-04-29

### Schema (Migration v3)
- **Documents table**: added `payment_mode` (`'standard' | 'cash'`, default standard), `issued_at`, `paid_at`, `cancelled_at`, `locked` (0/1), `source_quote_id`.
- **New `document_events` table**: append-only audit log (`id`, `document_id`, `event_type`, `payload_json`, `created_at`). Every status transition writes one row.
- **New `payments` table**: `id`, `document_id`, `amount`, `currency`, `method`, `paid_at`, `reference`, `notes`, `created_at`. Forward-compatible with partial / multiple payments — the v0.6.0 UI writes one full-amount row per "Mark as Paid".

### Added
- **`src/utils/documentLifecycle.js`**: state-machine helpers — `INVOICE_STATUSES`, `QUOTE_STATUSES`, `canTransition()`, `allowedNextStatuses()`, `applyTransition()`, `isOverdue()`, `effectiveStatus()`. Pure functions; no DB access.
- **Invoice lifecycle controls** in the document editor header:
  - `draft → sent` ("Mark as Sent") locks the document and stamps `issued_at`.
  - `sent / overdue → paid` ("Mark as Paid") stamps `paid_at`, locks, **and inserts a `payments` row** for the full balance (default method `bank_transfer`).
  - `sent / overdue → cancelled` ("Cancel Invoice") locks and stamps `cancelled_at`.
  - `paid → sent` ("Unlock for Edit") clears `paid_at` and unlocks for editing.
  - All transitions + the payment write run inside a single `transaction([...])` so failures roll back atomically.
- **Quote lifecycle controls**:
  - `draft → sent`, `sent → accepted | declined`, `accepted → converted`.
  - "Convert to Invoice" pre-fills a fresh invoice from the quote (items, client, notes, language) with `source_quote_id` set; saving the new invoice atomically marks the quote `converted`.
- **Cash payment mode**: a "Standard / Cash" toggle in the document totals area. When Cash is on, the tax row disappears entirely from the editor totals AND the PDF preview, the lime "Cash sale — VAT not applicable" badge appears under the total, and the PDF renders the localised cash note as italic small text under the total bar.
- **Cash note translations**: three new settings keys `trans_cash_note_en/de/fr` with default text per language, editable in Settings → Translations as a new "Cash sale note" row.
- **Lifecycle audit log**: `useDocuments.fetchEvents(docId)` is now available for inspecting a document's history (UI surfacing deferred).
- **Payments sub-section**: a `paid` invoice now displays the list of recorded payments (date, method, reference, amount) below the totals.
- **Locked-state UI**: the entire main form is disabled when the document is in a locked, non-draft state. A yellow banner explains why and points to "Unlock for Edit" for paid invoices.
- **Status state machine**: `useDocuments.transitionDocument(doc, nextStatus, extras)` validates and applies a transition + writes the event log row + (for paid) a payment row.

### Changed
- **DocumentList overdue derivation**: invoices show as `Overdue` (red) when `status === 'sent' && due_date < today`. Underlying DB status remains `sent`; the badge uses `effectiveStatus(doc)`.
- **DocumentList**: removed the per-row "Convert to Invoice" arrow button; conversion now happens from the quote's lifecycle action bar after acceptance.
- **`saveDocument`**: signature unchanged but now also persists `payment_mode` and `source_quote_id`. When a new invoice carries `source_quote_id`, the originating quote is stamped `converted` in the same transaction.
- **`fetchDocuments`**: total calculation now respects `payment_mode === 'cash'` (excludes tax).
- **`StatusBadge`**: added `cancelled` (line-through grey) and `converted` (purple) variants.

### Removed
- The old DocumentList "Convert to Invoice" handler (`convertToInvoice` in DocumentList.jsx) — superseded by the lifecycle-driven flow that originates inside the editor.

## [0.5.0] - 2026-04-29

### Schema (Migration v2)
- **Clients table**: added `email_valid`, `phone_valid`, `address_verified`, `vat_valid` (INTEGER 0/1/null), plus `vat_company_name` and `vat_validated_at` to persist VIES lookup results.
- **New `product_categories` table**: `id`, `name`, `name_de`, `name_fr`, `color`, `sort_order`, `created_at`.
- **Products table**: added `category_id` foreign key referencing `product_categories(id)`.

### Added
- **`src/utils/validators.js`**: centralised email regex, phone validation (libphonenumber-js, BE default), Nominatim address lookup, and VIES VAT validation via `controlapi.vatcomply.com`. Exports a `useDebouncedValidator` hook.
- **Live validation in the client modal**: email, phone, address, and VAT fields now validate continuously as you type (debounced). A spinner / green check / red x appears next to each field, and a "Detected: …" hint shows the formatted phone number. VAT lookup displays the registered company name on success and persists it.
- **Auto-fill from address lookup**: zip, city, and country fill in automatically when Nominatim returns a match (without overwriting fields the user already typed).
- **Product categories**: full CRUD lives on the Products page itself.
  - Filter chips strip with `[All]` + one chip per category + `[+ New Category]` inline.
  - Collapsible "Manage categories" panel for rename / reorder / delete.
  - Per-language names (EN / DE / FR), 8-color preset picker.
  - Inline `+ New category…` option in the product modal's category dropdown.
- **`CategoryEditor` component** (`src/components/CategoryEditor.jsx`): one shared editor used by all three category-creation entry points.

### Changed
- **Clients page → list view**: replaced the card grid with a table mirroring the Document list (Name, Email, Phone, City, VAT, # Documents, Actions). Validation flags render as small inline icons next to each cell. Document count comes from a `LEFT JOIN documents GROUP BY client_id` aggregate.
- **Client modal**: removed the manual "Verify" button — address verification now runs automatically (debounced 800 ms) on street/city changes. Validation icons sit inside the field; submission is blocked when email or phone are explicitly invalid.
- **Product card**: small colored category dot next to the title, category name as a tinted tag in the footer.

### Dependencies
- Added `libphonenumber-js` (~30 KB, MIT) for phone validation and country-aware formatting.

### Added
- **Sidebar shortcuts**: The single "New Document" CTA is now split into two buttons — primary lime "New Invoice" (`Receipt` icon) and secondary outlined "New Quote" (`FileText` icon). Each opens the editor with the correct document type pre-selected, regardless of the current view.

### Changed
- **Numbering segment insertion**: Pressing `+` on a numbering pattern row now inserts a new segment **directly below that row** instead of appending to the end. Works in both the Invoice and Quote numbering editors.
- **Numbering row action alignment**: The `+` and trash buttons on each numbering row are now wrapped in a `.row-actions` container with `margin-left: auto`, so they consistently align to the right edge of the row regardless of segment type. The `+` button now appears before the trash icon (insert is the more common action).
- **Document Editor item rows**: The bottom "Add Custom Item" button has been replaced with per-row `+` and trash buttons, mirroring the Numbering editor pattern. The `+` inserts a new line item directly below the clicked row. The bottom button only appears when the line-items list is empty (as "Add First Item"). The actions column widened from 40px to 80px to fit both icons, right-aligned.

## [0.4.0] - 2026-04-29

### Fixed (Critical)
- **Settings page rendered unstyled**: `Settings.jsx` was missing its CSS import, causing 395 lines of stylesheet to be dead code. Tabs were horizontal, no glassmorphism, fields overlapped.
- **Global CSS leak from Sidebar**: `Sidebar.css` defined an unscoped `.btn-primary { width: 100% }` rule that stretched every primary button across the app. Renamed the rule to `.sidebar-cta` so the global Button component is no longer overridden.
- **Invisible active states**: Replaced two undefined CSS variables (`--color-primary`, `--color-primary-soft`) with `--color-lime` and `--color-lime-alpha` in the Products modal language tabs and the Document Editor language switcher.
- **Wrong page title in editor**: The Layout header title kept showing the previous nav view (e.g. "Products") while the Document Editor was open. Added a `title` prop to `Layout` and pass `Create Invoice` / `Edit Quote` from `App.jsx`.
- **`UPDATE documents` missing `language`**: The document save UPDATE statement omitted the `language` column, silently discarding language changes when editing existing documents.
- **Non-atomic document saves**: `useDocuments.saveDocument` deleted and re-inserted line items in separate IPC calls, risking orphaned documents on partial failure. Now wrapped in a single SQLite transaction.

### Added
- **Atomic IPC transactions**: New `db-transaction` IPC handler that runs an array of operations inside a single `db.transaction()`. Exposed via `window.electron.db.transaction()` and the `useDatabase` hook.
- **Schema version tracking**: New `schema_version` table replaces brittle bare try-catch ALTER TABLE migrations; future migrations are gated by version checks.
- **`StatusBadge` component**: Reusable component with explicit styles for `draft`, `sent`, `paid`, `overdue`, `accepted`, and `declined`. Replaces ad-hoc inline-styled badges in Dashboard and DocumentList. Draft state is now clearly visible.
- **Empty states**: DocumentList, Clients, and Products now show explicit empty-state UI (icon + title + description) when no records exist or a search returns nothing.
- **Bar chart empty state**: Revenue-by-Month chart now shows "No paid invoices yet" overlay and dims zero-value bars.
- **Address-lookup rate limiting**: Nominatim address verification button now enforces a 1-second cooldown to prevent API abuse.
- **`src/constants.js`**: Centralised constants for `DOC_TYPES`, `LANGUAGES`, `CURRENCIES`, `DOC_STATUSES`, `UNITS`, and `DUE_DATE_MONTHS`.

### Changed
- **App version is now read from `package.json`**: Sidebar version label was hardcoded `v1.0.0`; it now imports `version` from `package.json` and renders `v{appVersion}`.
- **Design tokens**:
    - Bumped `--color-text-tertiary` from `#666666` to `#8B8F98` (~6.2:1 contrast).
    - Bumped `--color-text-secondary` to `#B0B4BC` for better readability.
    - Added `--color-lime-soft` and `--font-mono` tokens.
- **Promoted global classes**: `.card`, `.page-header`, and `.search-bar` now live in `index.css` so every page shares the same building blocks.
- **Settings.css scoping**: Removed the leaking `:root` redefinition; all glass tokens, padding overrides, and component-shadow rules are now scoped under `.settings-page`. Reduced body-card padding (48 → 32) and removed the distracting pulse animation on the unsaved-changes banner.
- **Dashboard layout**:
    - Stat grid is now responsive (`auto-fit minmax(220px, 1fr)`).
    - Stat values bumped from `1.35rem` → `1.65rem` and no longer ellipsis-clip.
    - Recent-docs / chart split collapses to one column below 1080px.
- **Document Editor**:
    - Item-row inputs now have visible borders and focus states (was bare/transparent inputs).
    - QTY column widened from 80px → 90px.
    - Header actions can wrap on narrow widths.
    - Preview container scales down on narrower screens via `transform: scale()`; full-resolution PDF still exports correctly.
- **Document Preview (PDF)**:
    - Header gap reduced from 50mm → 25mm.
    - Removed hardcoded French labels and "Eupen" placeholder; now renders translated headers based on `doc.language` and pulls company info from settings.
    - Preview now accepts a `client` prop and renders the full address from the client record.
- **Document List table**:
    - Column min-widths set so narrow content no longer collapses columns.
    - `.doc-num` demoted from lime to monospaced white for cleaner data hierarchy.
- **Modal sizing**: Add Client modal max-width raised from 500px → 640px; added `max-height: 90vh` with scroll for tall viewports. The "Verify" address-lookup button now has clear secondary styling.
- **Dashboard SQL**: Replaced N+1 per-invoice item fetches with a single aggregated `GROUP BY` query.
- **`useDocuments.fetchDocuments`**: Same aggregation; client-side total math now operates on subtotal sums instead of looping items.
- **Sidebar polish**: Nav items have slightly more vertical padding (12 → 14 effective); removed the gimmicky `padding-left` shift on hover; removed the spurious horizontal divider above the user profile.
- **Lime accent demoted**: `.product-rate`, `.recent-num`, `.doc-num`, and `.stat-value` no longer use lime. Lime is now reserved for: brand logo, primary CTA, focus rings, and total amount.
- **Visible focus rings**: All `<button>` elements now show a 2px lime outline on `:focus-visible`.

### Removed
- Unused `Sparkles` icon import in `DocumentEditor.jsx`.
- Dead inline `getStatusColor` helpers in DocumentList and Dashboard (replaced by `StatusBadge`).
- Duplicate `.page-header`, `.search-bar`, and `.card` definitions across per-page CSS (now in `index.css`).
- Duplicate `.status-badge` rules in DocumentList.css and Dashboard.css (now in `StatusBadge.css`).

## [0.3.0] - 2026-04-28

### Changed
- **Premium Settings Overhaul**: Completely modernized the Settings page with high-end glassmorphism and organic transitions.
    - **Unified Design Tokens**: Implemented a strict CSS variable system for 100% component consistency.
    - **Pill-Based Numbering Editor**: Transformed document numbering segments into stylized, modular blocks.
    - **Live Preview Upgrade**: Added a high-contrast monospaced "result" window for numbering previews.
    - **Localization Grid**: Modernized the translation table with tag-based headers and inline focus highlights.
    - **Micro-Interactions**: Integrated organic tab transitions and spring-based button feedback.
    - **Typography & Layout**: Refined information hierarchy with descriptive headers and legal-focused labels.

## [0.2.0] - 2026-04-28

### Added
- **Multilingual Support**: 
    - Added EN, DE, and FR support across the app.
    - Product creation now includes fields for name and description in all three languages.
    - Document Editor (Invoices/Quotes) now has a language toggle.
    - New "Translations" tab in Settings to customize PDF labels for all languages.
- **Enhanced Client Profiles**:
    - Split the address field into `address_street`, `address_zip`, `address_city`, and `address_country`.
    - Implemented address lookup and verification using OpenStreetMap (Nominatim).
    - Added email and phone number verification using regex validation.
- **Automated Due Dates**:
    - Invoices: Automatically set to 1 month after issuing date.
    - Quotes: Automatically set to 2 months after issuing date (Valid Until).
    - Manual adjustment remains available for both.
- **Document Editor Improvements**:
    - Added product selection loader to quickly add existing products to documents.
    - Support for loading translated product content based on document language.
- **Advanced Settings**:
    - Configurable document numbering separator (Hyphen, Slash, Dot, Underscore).
- **Documentation**:
    - Created `PROJECT_RECAP.md` for project overview.
    - Created `CHANGELOG.md` (this file).

### Removed
- **AI Suggest**: Removed the Sparkles icon and AI suggestion features from the invoicing and quoting pages.

### Changed
- Updated `package.json` version to `0.2.0`.
- Migrated SQLite database schema to support new client, product, and document fields.
- Updated `useSettings` hook to handle new numbering logic and translation defaults.

## [0.2.2] - 2026-04-28

### Added
- **Advanced Numbering System**: Replaced the static document numbering with a dynamic, row-based segment editor.
    - Match the exact "New Filenames" structure from the user's reference.
    - Support for Text, Date Time (YYYYMMDD, YYMMDD, etc.), and Sequence Number (custom padding) segments.
    - Live preview of the generated document number directly in Settings.
    - Warning indicator for unsaved numbering changes.

## [0.2.3] - 2026-04-28

### Changed
- **Settings Graphic Overhaul**: Completely redesigned the Settings page with a premium dark aesthetic.
    - Implemented a sidebar navigation layout for better organization.
    - Added glassmorphism effects (backdrop blur and semi-transparent layers).
    - Refined typography and added helpful descriptions to all settings sections.
    - Integrated smooth transitions and micro-animations between tabs.
    - Polished the Dynamic Numbering Editor and Translation Table for a high-end feel.
    - Added visual cues like focus rings and glowing indicators for active states.
