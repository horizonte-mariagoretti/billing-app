import { useState, useCallback } from 'react';

/**
 * Shared table sorting (Horis, Lasagnen).
 *
 * sort = { key, dir } with dir 'asc' | 'desc' | null (null = unsorted, rows keep their incoming order).
 * Clicking a column cycles: none → asc → desc → none. Clicking another column starts at asc.
 *
 * sortRows(rows, accessors, { tieBreak, locale }):
 *   accessors: { [key]: (row) => value }   value: string | number | null/undefined (= missing)
 *   Missing values always sink to the bottom, whatever the direction.
 *   tieBreak: optional (row) => string used for equal values (e.g. the name), always A→Z.
 */
export default function useTableSort(defaultSort = { key: null, dir: null }) {
  const [sort, setSort] = useState(defaultSort);

  const toggleSort = useCallback((key) => {
    setSort((p) => {
      if (p.key !== key || !p.dir) return { key, dir: 'asc' };
      return p.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: null };
    });
  }, []);

  const sortRows = useCallback((rows, accessors, { tieBreak, locale = 'de-DE' } = {}) => {
    const get = accessors?.[sort.key];
    if (!sort.dir || !get) return rows;
    const tie = (a, b) => (tieBreak ? String(tieBreak(a)).localeCompare(String(tieBreak(b)), locale) : 0);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const aMissing = va == null;
      const bMissing = vb == null;
      if (aMissing && bMissing) return tie(a, b);
      if (aMissing) return 1;
      if (bMissing) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb), locale) : va - vb;
      return (sort.dir === 'asc' ? cmp : -cmp) || tie(a, b);
    });
  }, [sort]);

  return { sort, toggleSort, sortRows };
}
