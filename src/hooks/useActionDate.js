import { useState, useEffect, useCallback } from 'react';
import useSettings from './useSettings';
import useYear from './useYear';
import { useT } from './useUiTranslations';
import { isoDate } from '../utils/lasagnaFinance';

// Date of a Verkaufsaktion for the selected scout year (year_settings key `dateKey`, YYYY-MM-DD, '' = not set).
// Must lie inside the scout year (1 Sept – 31 Aug). Locked years are read-only.
const useActionDate = (dateKey) => {
  const t = useT();
  const { loadYearSettings, saveYearSettings } = useSettings();
  const { selectedYear, isLocked } = useYear();
  const [state, setState] = useState({ year: null, date: '' });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await loadYearSettings(selectedYear);
        if (!cancelled) setState({ year: selectedYear, date: isoDate(s[dateKey]) });
      } catch {
        if (!cancelled) setError(t('action_date_load_error', 'Datum konnte nicht geladen werden.'));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, dateKey]);

  const loaded = state.year === selectedYear;
  const date = loaded ? state.date : '';

  const setDate = useCallback(async (value) => {
    if (isLocked || !loaded) return;
    if (value && (value < `${selectedYear}-09-01` || value > `${selectedYear + 1}-08-31`)) {
      setError(t('action_date_range', 'Das Datum muss im gewählten Pfadfinderjahr liegen.'));
      return;
    }
    setError(null);
    setState({ year: selectedYear, date: value });
    try {
      await saveYearSettings(selectedYear, { [dateKey]: value });
    } catch {
      setError(t('lasagnen_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  }, [isLocked, loaded, selectedYear, dateKey, saveYearSettings, t]);

  return { year: selectedYear, date, loaded, locked: isLocked, setDate, error };
};

export default useActionDate;
