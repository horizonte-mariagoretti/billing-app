// Lasagnen Einnahmen & Ausgaben: pure helpers (no DB, no React).

export const EXPENSE_CATEGORIES = [
  { value: 'ingredients', label: 'Zutaten' },
  { value: 'packaging', label: 'Verpackung' },
  { value: 'material', label: 'Material' },
  { value: 'other', label: 'Sonstiges' },
];

// Manually entered extra income (on top of the per-Hori income from the Übersicht).
export const INCOME_CATEGORIES = [
  { value: 'donation', label: 'Spende' },
  { value: 'other_income', label: 'Sonstiges' },
];

export const categoriesFor = (kind) => (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);

const round2 = (n) => Math.round(n * 100) / 100;

// Income of one Hori: the entered Betrag final, or Betrag min while none is entered yet.
export const incomeFor = (row, minAmount) => (
  Number.isFinite(row.savedFinal) ? row.savedFinal : minAmount
);

// rows: Übersicht rows (savedFinal, paid); minFor(row) -> Betrag min.
// total = expected income, paid = from rows ticked Bezahlt, open = total - paid.
export const incomeTotals = (rows, minFor) => {
  let total = 0;
  let paid = 0;
  for (const r of rows) {
    const v = incomeFor(r, minFor(r));
    total += v;
    if (r.paid) paid += v;
  }
  return { total: round2(total), paid: round2(paid), open: round2(total - paid) };
};

// Sum of manual entries (all expenses, or all manual income).
export const expenseTotal = (entries) => round2(
  entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
);

// One income entry per Hori that ordered lasagnes (or has an amount): name, expected amount, paid flag.
// nameFor(row) -> display name; minFor(row) -> Betrag min.
export const incomeEntries = (rows, minFor, nameFor) => rows
  .map((r) => ({
    id: `income-${r.hori_id}`,
    name: nameFor(r),
    amount: round2(incomeFor(r, minFor(r))),
    paid: !!r.paid,
    pieces: (parseInt(r.bolo, 10) || 0) + (parseInt(r.veggie, 10) || 0),
  }))
  .filter((e) => e.pieces > 0 || e.amount > 0);

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const toCount = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Betrag min of one order row: (Bolo + Veggie) × price, or × the discount price once the per-Hori
// threshold is reached. settings = year settings (lasagna_price, lasagna_discount_from, lasagna_discount_price).
export const lasagnaAmounts = (row, settings) => {
  const price = num(settings?.lasagna_price);
  const discountFrom = toCount(settings?.lasagna_discount_from);
  const discountPrice = num(settings?.lasagna_discount_price);
  const n = toCount(row.bolo) + toCount(row.veggie);
  const discounted = discountFrom > 0 && discountPrice > 0 && n >= discountFrom;
  return { min: round2(n * (discounted ? discountPrice : price)), discounted };
};

// Numbers of the Lasagnen Verkaufsaktion of one scout year (same rules as the Finanzen tab, active Horis only):
// income = per-Hori income (Betrag final, else Betrag min) + manual Einnahmen; saldo = income − manual Ausgaben.
// orders: fetchOrders rows; manual: lasagna_expenses rows ({ kind, amount }).
export const lasagnaSummary = ({ orders, settings, manual }) => {
  const rows = orders
    .filter((r) => r.active === 1 || r.active === true)
    .map((r) => ({
      ...r,
      savedFinal: r.final_amount === null || r.final_amount === undefined || r.final_amount === '' || !Number.isFinite(Number(r.final_amount))
        ? null
        : Number(r.final_amount),
    }));
  const sales = incomeTotals(rows, (r) => lasagnaAmounts(r, settings).min);
  const manualIncome = expenseTotal(manual.filter((m) => m.kind === 'income'));
  const expenses = expenseTotal(manual.filter((m) => m.kind !== 'income'));
  const ordering = rows.filter((r) => toCount(r.bolo) + toCount(r.veggie) > 0);
  return {
    income: round2(sales.total + manualIncome),
    expenses,
    saldo: round2(sales.total + manualIncome - expenses),
    bolo: rows.reduce((n, r) => n + toCount(r.bolo), 0),
    veggie: rows.reduce((n, r) => n + toCount(r.veggie), 0),
    orderingHoris: ordering.length,
    paidHoris: ordering.filter((r) => r.paid).length,
  };
};

// Saldo only (Dashboard Umsatz).
export const lasagnaSaldo = (args) => lasagnaSummary(args).saldo;

// Verkaufsaktionen that count into the Dashboard Umsatz. dateKey = year_settings key holding the action date
// (YYYY-MM-DD); half = half-year the action usually takes place in (1 = Sept–Dec, 2 = Jan–Aug), used when no date is set.
// Glühwein and Baseball already have a base page (date + year); their Saldo is added to the Umsatz (useSalesActions) once they track money.
export const SALES_ACTIONS = [
  { key: 'lasagnen', label: 'Lasagnen', dateKey: 'lasagna_action_date', half: 1 },
  { key: 'gluehwein', label: 'Glühweinbude', dateKey: 'gluehwein_action_date', half: 1 },
  { key: 'baseball', label: 'Baseballturnier', dateKey: 'baseball_action_date', half: 2 },
];

export const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');

// 'YYYY-MM' the Saldo of an action counts in: the month of its date, else a default month of its half-year
// (December of the start year for the first half, June of the end year for the second).
export const salesActionMonthKey = (action, year, date) => {
  const d = isoDate(date);
  if (d) return d.slice(0, 7);
  return action.half === 2 ? `${year + 1}-06` : `${year}-12`;
};
