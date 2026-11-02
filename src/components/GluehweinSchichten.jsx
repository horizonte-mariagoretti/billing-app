import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// useGluehweinShifts / useSalesDays take the action key ('gluehwein' | 'baseball'); this component gets the SALES_ACTIONS entry.
import { Settings2 } from 'lucide-react';
import { useGluehweinShifts } from '../hooks/useGluehweinShifts';
import { useSalesDays } from '../hooks/useSalesDays';
import useHoris from '../hooks/useHoris';
import useTableSort from '../hooks/useTableSort';
import { heatColor } from '../utils/heatColor';
import { gluehweinShares, gluehweinBonusFromSettings, bonusReductionPct } from '../utils/gluehweinBonus';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import GluehweinShiftSettingsModal from './GluehweinShiftSettingsModal';
import GluehweinShiftCalendar from './GluehweinShiftCalendar';
import SortableTh from './SortableTh';
import './DataTable.css';
import './GluehweinSchichten.css';


// Every date from start to end (both included), 'YYYY-MM-DD'.
const datesBetween = (start, end) => {
  const out = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const last = Date.UTC(ey, em - 1, ed);
  for (let t = Date.UTC(sy, sm - 1, sd); t <= last; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

const ERROR_TEXT = {
  YEAR_LOCKED: 'Dieses Jahr ist abgeschlossen und kann nicht mehr geändert werden.',
  DAY_EXISTS: 'Dieses Datum gibt es schon.',
  INVALID_DATE: 'Ungültiges Datum (Format JJJJ-MM-TT).',
  BAD_TEMPLATE: 'Ungültige Schichtzeit. Bitte die Schicht-Einstellungen prüfen.',
  BAD_SLOT_TIME: 'Ungültige Schichtzeit.',
  SLOT_TOO_LONG: 'Eine Schicht darf höchstens 12 Stunden dauern.',
  SLOT_EXISTS: 'An diesem Tag gibt es schon eine Schicht mit dieser Beginnzeit.',
};

const errorText = (err, fallback) => {
  const msg = String(err?.message ?? err ?? '');
  const code = Object.keys(ERROR_TEXT).find((k) => msg.startsWith(k));
  return code ? ERROR_TEXT[code] : fallback;
};

const isActive = (h) => h.active === 1 || h.active === true || h.active === '1';
const horiName = (h) => [h.first_name, h.last_name].filter(Boolean).join(' ') || '—';
const fmtPct = (n) => `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

/**
 * Shift planning of a Verkaufsaktion: event days, shift slots per day with assigned Horis,
 * and a per-Hori table (Schichten, Pflicht, Extra, Anteil %, Bonus %).
 * Props: action (SALES_ACTIONS entry), year, yearLocked, settings (year settings from loadYearSettings), onError(text).
 */
const GluehweinSchichten = ({ action, year, yearLocked, settings, periodFrom, periodTo, addRequest = null, onError }) => {
  const actionKey = action?.key ?? action;
  const {
    fetchShifts, addSlot, updateSlot, copySlots, removeSlot, assign, unassign,
  } = useGluehweinShifts(actionKey);
  const { fetchDays, addDay, deleteDay } = useSalesDays(actionKey);
  // Event period comes from the page header (start, end) and updates live. The sale days are generated from it.
  const { fetchHoriStats } = useHoris();

  const [days, setDays] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [horis, setHoris] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: 'day'|'slot', id, label, shifts?, assignments? }
  const [showSettings, setShowSettings] = useState(false);
  // The header button "Schicht-Einstellungen" (Glühwein page) bumps addRequest; a new n opens the popup.
  const seenSettingsRef = useRef(addRequest?.n ?? 0);
  useEffect(() => {
    if (!addRequest || addRequest.n === seenSettingsRef.current) return;
    seenSettingsRef.current = addRequest.n;
    setShowSettings(true);
  }, [addRequest]);
  const [settingsPatch, setSettingsPatch] = useState({});
  // Shared table sort: none → asc → desc → none. Default Hori A→Z.
  const { sort, toggleSort, sortRows } = useTableSort({ key: 'name', dir: 'asc' });
  const localSettings = useMemo(() => ({ ...(settings || {}), ...settingsPatch }), [settings, settingsPatch]);

  const report = useCallback((err, fallback) => {
    onError?.(errorText(err, fallback));
  }, [onError]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, s, h] = await Promise.all([fetchDays(year), fetchShifts(year), fetchHoriStats(year)]);
        if (cancelled) return;
        setDays(d || []);
        setShifts(s || []);
        setHoris(h || []);
      } catch (err) {
        if (!cancelled) report(err, 'Schichten konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchDays, fetchShifts, fetchHoriStats, year, report, reloadKey]);

  // Sale days follow the event period: every date from start to end gets a day, added automatically.
  // A failed insert is reported and not retried in a loop (the reload only happens after a successful insert).
  const periodDays = useMemo(() => {
    if (!periodFrom || !periodTo) return [];
    return days.filter((d) => d.date >= periodFrom && d.date <= periodTo);
  }, [days, periodFrom, periodTo]);

  useEffect(() => {
    if (yearLocked || loadedYear !== year || !periodFrom || !periodTo || periodFrom > periodTo) return undefined;
    const have = new Set(days.map((d) => d.date));
    const missing = datesBetween(periodFrom, periodTo).filter((d) => !have.has(d));
    if (!missing.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        for (const date of missing) await addDay(year, date);
        if (!cancelled) setReloadKey((k) => k + 1);
      } catch (err) {
        if (!cancelled) report(err, 'Verkaufstage konnten nicht angelegt werden.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFrom, periodTo, loadedYear, year, days, yearLocked]);

  const run = async (fn, fallback) => {
    if (yearLocked) return false;
    setBusy(true);
    try {
      await fn();
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      report(err, fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const bonus = useMemo(() => gluehweinBonusFromSettings(localSettings), [localSettings]);
  const horiById = useMemo(() => new Map(horis.map((h) => [h.id, h])), [horis]);
  const activeHoris = useMemo(() => horis.filter(isActive), [horis]);

  const shiftsByDay = useMemo(() => {
    const map = new Map();
    shifts.forEach((s) => {
      if (!map.has(s.day_id)) map.set(s.day_id, []);
      map.get(s.day_id).push(s);
    });
    return map;
  }, [shifts]);

  const counts = useMemo(() => {
    const map = new Map();
    shifts.forEach((s) => (s.horis || []).forEach((id) => map.set(id, (map.get(id) || 0) + 1)));
    return map;
  }, [shifts]);

  const tableRows = useMemo(() => {
    const list = horis.filter((h) => isActive(h) || counts.has(h.id));
    const shares = gluehweinShares(list.map((h) => ({
      hori_id: h.id, shifts: counts.get(h.id) || 0, mandatory: bonus.mandatory, active: isActive(h),
    })));
    return list.map((h) => {
      const count = counts.get(h.id) || 0;
      const share = shares.get(h.id);
      return {
        hori: h,
        count,
        extra: Math.max(0, count - bonus.mandatory),
        share,
        reduction: share ? bonusReductionPct({ sharePct: share.sharePct, enabled: bonus.enabled, factor: bonus.factor }) : null,
      };
    });
  }, [horis, counts, bonus]);

  // Saves a shift from the shift modal; errors are thrown on so the modal can show them.
  const handleSaveSlot = async (dayId, slotId, start, end) => {
    if (yearLocked) throw new Error('YEAR_LOCKED');
    setBusy(true);
    try {
      if (slotId) await updateSlot(slotId, start, end);
      else await addSlot(dayId, start, end);
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveDay = (day, label) => {
    const daySlots = shiftsByDay.get(day.id) || [];
    const assignments = daySlots.reduce((n, sl) => n + (sl.horis || []).length, 0);
    setConfirm({ kind: 'day', id: day.id, label, shifts: daySlots.length, assignments });
  };

  const handleConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'day') await run(() => deleteDay(c.id), 'Datum konnte nicht gelöscht werden.');
    else await run(() => removeSlot(c.id), 'Schicht konnte nicht gelöscht werden.');
  };

  const countedShares = tableRows.filter((r) => r.share).map((r) => Number(r.share.sharePct) || 0);
  const maxShare = Math.max(0, ...countedShares);
  const minShare = countedShares.length ? Math.min(...countedShares) : 0;
  // Missing values (inactive Horis have no share / bonus) always sink to the bottom.
  const sortedRows = sortRows(tableRows, {
    name: (r) => horiName(r.hori).toLowerCase(),
    count: (r) => r.count,
    mandatory: () => bonus.mandatory,
    extra: (r) => r.extra,
    share: (r) => (r.share ? Number(r.share.sharePct) || 0 : null),
    reduction: (r) => r.reduction,
  }, { tieBreak: (r) => horiName(r.hori), locale: 'de-DE' });
  const sortTh = (key, label) => (
    <SortableTh column={key} label={label} sort={sort} onSort={toggleSort} />
  );

  const disabled = !!yearLocked || busy;

  if (loadedYear !== year) return <div className="gw-shifts-loading">Lade Schichten…</div>;

  return (
    <div className="gw-shifts">
      {yearLocked && (
        <div className="gw-shifts-note" role="note">
          Dieses Jahr ist abgeschlossen. Tage und Schichten sind nur lesbar.
        </div>
      )}

      <div className="gw-shifts-split">
      <div className="gw-shifts-main">
      {periodDays.length === 0 ? (
        <div className="gw-shifts-empty card">
          Noch keine Verkaufstage{action?.label ? ` für ${action.label}` : ''}. Den Zeitraum oben im Kopf setzen, dann werden die Tage angelegt.
        </div>
      ) : (
        <GluehweinShiftCalendar
          days={periodDays}
          shiftsByDay={shiftsByDay}
          horiById={horiById}
          activeHoris={activeHoris}
          disabled={disabled}
          yearLocked={!!yearLocked}
          busy={busy}
          onAssign={(shiftId, horiId) => run(() => assign(shiftId, horiId), 'Hori konnte nicht eingeteilt werden.')}
          onUnassign={(shiftId, horiId) => run(() => unassign(shiftId, horiId), 'Hori konnte nicht ausgetragen werden.')}
          onSaveSlot={handleSaveSlot}
          onCopySlots={(fromId, toId) => run(async () => {
            const copied = await copySlots(fromId, toId);
            if (copied === 0) onError?.('Keine Schicht kopiert: Alle Beginnzeiten gibt es an diesem Tag schon.');
          }, 'Schichten konnten nicht kopiert werden.')}
          onRemoveSlot={(slot, label) => setConfirm({ kind: 'slot', id: slot.id, label })}
          onRemoveDay={handleRemoveDay}
        />
      )}
      </div>

      <div className="gw-shifts-side">
      <div className="data-table-container gw-shifts-table">
        <table className="data-table gw-shifts-data">
          <thead>
            <tr>
              {sortTh('name', 'Hori')}
              {sortTh('count', 'Schichten')}
              {sortTh('share', 'Anteil %')}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr><td colSpan={3} className="dt-muted">Keine aktiven Horis in diesem Jahr.</td></tr>
            ) : sortedRows.map((r) => {
              const active = isActive(r.hori);
              const share = r.share ? Math.max(0, Math.min(100, Number(r.share.sharePct) || 0)) : null;
              // Colour spans lowest -> highest share of the counted rows; a single row (or all equal) is green.
              const heat = heatColor(maxShare > minShare ? ((share ?? 0) - minShare) / (maxShare - minShare) : 1);
              return (
                <tr key={r.hori.id} className={active ? undefined : 'gw-shifts-inactive'}>
                  <td>
                    {horiName(r.hori)}
                    {!active && <span className="dt-muted"> (inaktiv)</span>}
                  </td>
                  <td>
                    <span className={`dt-mono ${active ? 'dt-strong' : 'dt-muted'}`}>{r.count}</span>
                  </td>
                  <td>
                    {share != null ? (
                      <div className="dt-heat">
                        <span className="dt-mono">{fmtPct(share)}</span>
                        <div className="dt-heat-bar" aria-hidden="true">
                          <i style={{ width: `${maxShare > 0 ? (share / maxShare) * 100 : 0}%`, background: active ? heat : 'var(--color-text-dark-tertiary)' }} />
                        </div>
                      </div>
                    ) : <span className="dt-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'day' ? 'Verkaufstag löschen?' : 'Schicht löschen?'}
          message={confirm.kind === 'day'
            ? `${confirm.label}: Der Tag wird mit ${confirm.shifts} ${confirm.shifts === 1 ? 'Schicht' : 'Schichten'} und ${confirm.assignments} ${confirm.assignments === 1 ? 'Zuteilung' : 'Zuteilungen'} gelöscht.`
            : `${confirm.label}: Die Schicht wird mit allen Einteilungen gelöscht.`}
          confirmLabel="Löschen"
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {showSettings && (
        <GluehweinShiftSettingsModal
          settings={localSettings}
          year={year}
          yearLocked={yearLocked}
          onClose={() => setShowSettings(false)}
          onSaved={(patch) => { setSettingsPatch((prev) => ({ ...prev, ...patch })); setShowSettings(false); }}
        />
      )}
    </div>
  );
};

export default GluehweinSchichten;
