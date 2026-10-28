// Scout year — pure helpers (no DB).
//
// The camp "year" runs 1 September to 31 August and is identified by its START year.
// Example: 2026/27 = start year 2026, covering 2026-09-01 .. 2027-08-31.

/**
 * date: JS Date or ISO 'YYYY-MM-DD' string.
 * Returns the start year: calendar year − 1 for January..August, else the calendar year.
 */
export function scoutYearOf(date) {
  let year;
  let month;
  if (typeof date === 'string') {
    // Read the date parts directly — new Date('YYYY-MM-DD') parses as UTC and can shift the day.
    const [y, m] = date.slice(0, 10).split('-');
    year = parseInt(y, 10);
    month = parseInt(m, 10);
  } else {
    year = date.getFullYear();
    month = date.getMonth() + 1;
  }
  return month < 9 ? year - 1 : year;
}

/** Start year of the scout year containing `now`. */
export function currentScoutYear(now = new Date()) {
  return scoutYearOf(now);
}

/** '2026/27' style label for a start year. */
export function scoutYearLabel(startYear) {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

/** SQLite expression giving the start year of a 'YYYY-MM-DD' column. */
export function SCOUT_YEAR_SQL(column) {
  // SQLite booleans are integers: (month < 9) is 1 or 0, so it subtracts one year for Jan..Aug.
  return `CAST(strftime('%Y', ${column}) AS INTEGER) - (CAST(strftime('%m', ${column}) AS INTEGER) < 9)`;
}
