import { calcAge } from './jobHours';

/** Parse DD.MM.YYYY, D.M.YY, DD/MM/YYYY or YYYY-MM-DD into ISO, or null if not a real date. */
export function parseBirthDate(raw) {
  const s = String(raw || '').trim();
  let y, m, d;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) { [, y, m, d] = match; } else {
    match = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
    if (!match) return null;
    [, d, m, y] = match;
    if (y.length === 2) {
      const yy = Number(y);
      const cutoff = new Date().getFullYear() % 100;
      y = String(yy <= cutoff ? 2000 + yy : 1900 + yy);
    }
  }
  const yi = Number(y), mi = Number(m), di = Number(d);
  const dt = new Date(yi, mi - 1, di);
  if (dt.getFullYear() !== yi || dt.getMonth() !== mi - 1 || dt.getDate() !== di) return null;
  return `${String(yi).padStart(4, '0')}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`;
}

const DATE_TOKEN = /\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}/;

/**
 * One Hori per line: "<first name> <last name>   <birth date>".
 * Columns may be separated by tab (spreadsheet paste), ; , or just spaces.
 * First word = first name, the rest of the name = last name.
 * A leading header line (e.g. "Name  Geburtsdatum") is ignored.
 *
 * Returns [{ line, first_name, last_name, birth_date, age, status }] where
 * status is 'ok' | 'duplicate' | 'no_date' | 'bad_date' | 'no_last_name'.
 * `existing` = array of { first_name, last_name } already in the DB.
 */
export function parseHoriLines(text, existing = []) {
  const seen = new Set(existing.map((h) => `${h.first_name} ${h.last_name}`.trim().toLowerCase()));
  const rows = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const dateMatch = line.match(DATE_TOKEN);
    if (!dateMatch && rows.length === 0 && /name|geburt|naissance/i.test(line)) return; // header
    let namePart = line;
    let birth = null;
    let status = 'ok';
    if (dateMatch) {
      namePart = line.slice(0, dateMatch.index);
      birth = parseBirthDate(dateMatch[0]);
      if (!birth) status = 'bad_date';
    } else {
      // allow "Name<sep>garbage": strip trailing separator-delimited field
      namePart = line.split(/[\t;,]/)[0];
      status = 'no_date';
    }
    namePart = namePart.replace(/[\t;,]+/g, ' ').replace(/\s+/g, ' ').trim();
    const [first = '', ...rest] = namePart.split(' ');
    const last = rest.join(' ');
    if (status === 'ok' && !last) status = 'no_last_name';
    if (status === 'ok') {
      const key = `${first} ${last}`.toLowerCase();
      if (seen.has(key)) status = 'duplicate'; else seen.add(key);
    }
    rows.push({
      line: i + 1,
      first_name: first,
      last_name: last,
      birth_date: birth,
      age: birth ? calcAge(birth) : null,
      status,
    });
  });
  return rows;
}
