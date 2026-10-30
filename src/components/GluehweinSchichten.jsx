import { useState, useEffect, useCallback, useMemo } from 'react';
// useGluehweinShifts / useSalesDays take the action key ('gluehwein' | 'baseball'); this component gets the SALES_ACTIONS entry.
import { CalendarPlus, Settings2 } from 'lucide-react';
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

const DEFAULT_TEMPLATES = ['16:00-19:00', '19:00-22:00'];

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

const parseTemplates = (raw) => {
  try {
    const list = JSON.parse(raw ?? '');
    if (Array.isArray(list) && list.length) return list.map(String);
  } catch { /* default below */ }
  return DEFAULT_TEMPLATES;
};

const isActive = (h) => h.active === 1 || h.active === true || h.active === '1';
const horiName = (h) => [h.first_name, h.last_name].filter(Boolean).join(' ') || '—';
const fmtPct = (n) => `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

/**
 * Shift planning of a Verkaufsaktion: event days, shift slots per day with assigned Horis,
 * and a per-Hori table (Schichten, Pflicht, Extra, Anteil %, Bonus %).
 * Props: action (SALES_ACTIONS entry), year, yearLocked, settings (year settings from loadYearSettings), onError(text).
 */
const GluehweinSchichten = ({ action, year, yearLocked, settings, onError }) => {
  const actionKey = action?.key ?? action;
  const {
    fetchShifts, addSlots, addSlot, updateSlot, copySlots, removeSlot, assign, unassign,
  } = useGluehweinShifts(actionKey);
  const { fetchDays, addDay, deleteDay } = useSalesDays(actionKey);
  const { fetchHoriStats } = useHoris();

  const [days, setDays] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [horis, setHoris] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [confirm, setConfirm] = useState(null); // { kind: 'day'|'slot', id, label, shifts?, assignments? }
  const [showSettings, setShowSettings] = useState(false);
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

  const templates = useMemo(() => parseTemplates(localSettings.gluehwein_shift_templates), [localSettings]);
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

  const handleAddDay = async (e) => {
    e.preventDefault();
    const date = newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { onError?.(ERROR_TEXT.INVALID_DATE); return; }
    if (await run(() => addDay(year, date), 'Datum konnte nicht hinzugefügt werden.')) setNewDate('');
  };

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
      <div className="gw-shifts-toolbar">
        <form className="gw-shifts-add-day" onSubmit={handleAddDay}>
          <label className="input-label" htmlFor="gw-new-day">Verkaufstag</label>
          <input
            id="gw-new-day"
            type="date"
            className="input-field"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            disabled={disabled}
          />
          <Button type="submit" variant="primary" size="sm" disabled={disabled || !newDate}>
            <CalendarPlus size={16} /> Tag hinzufügen
          </Button>
        </form>
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
          <Settings2 size={16} /> Schicht-Einstellungen
        </Button>
      </div>

      {yearLocked && (
        <div className="gw-shifts-note" role="note">
          Dieses Jahr ist abgeschlossen. Tage und Schichten sind nur lesbar.
        </div>
      )}

      {days.length === 0 ? (
        <div className="gw-shifts-empty card">
          Noch keine Verkaufstage{action?.label ? ` für ${action.label}` : ''}. Füge oben ein Datum hinzu.
        </div>
      ) : (
        <GluehweinShiftCalendar
          days={days}
          shiftsByDay={shiftsByDay}
          horiById={horiById}
          activeHoris={activeHoris}
          templates={templates}
          disabled={disabled}
          yearLocked={!!yearLocked}
          busy={busy}
          onAssign={(shiftId, horiId) => run(() => assign(shiftId, horiId), 'Hori konnte nicht eingeteilt werden.')}
          onUnassign={(shiftId, horiId) => run(() => unassign(shiftId, horiId), 'Hori konnte nicht ausgetragen werden.')}
          onAddTemplates={(dayId) => run(() => addSlots(dayId, templates), 'Schichten konnten nicht angelegt werden.')}
          onSaveSlot={handleSaveSlot}
          onCopySlots={(fromId, toId) => run(async () => {
            const copied = await copySlots(fromId, toId);
            if (copied === 0) onError?.('Keine Schicht kopiert: Alle Beginnzeiten gibt es an diesem Tag schon.');
          }, 'Schichten konnten nicht kopiert werden.')}
          onRemoveSlot={(slot, label) => setConfirm({ kind: 'slot', id: slot.id, label })}
          onRemoveDay={handleRemoveDay}
        />
      )}

      <div className="data-table-container gw-shifts-table">
        <table className="data-table gw-shifts-data">
          <thead>
            <tr>
              {sortTh('name', 'Hori')}
              {sortTh('count', 'Schichten')}
              {sortTh('mandatory', 'Pflicht')}
              {sortTh('extra', 'Extra')}
              {sortTh('share', 'Anteil %')}
              {bonus.enabled && sortTh('reduction', 'Bonus %')}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr><td colSpan={bonus.enabled ? 6 : 5} className="dt-muted">Keine aktiven Horis in diesem Jahr.</td></tr>
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
                    {active && r.count < bonus.mandatory && (
                      <span className="gw-shifts-under">unter Pflicht</span>
                    )}
                  </td>
                  <td className="dt-mono">{bonus.mandatory}</td>
                  <td className="dt-mono">{r.extra}</td>
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
                  {bonus.enabled && (
                    <td className="dt-mono">{r.reduction != null ? fmtPct(r.reduction) : <span className="dt-muted">—</span>}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
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
