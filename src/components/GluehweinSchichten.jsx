import { useState, useEffect, useCallback, useMemo } from 'react';
// useGluehweinShifts / useSalesDays take the action key ('gluehwein' | 'baseball'); this component gets the SALES_ACTIONS entry.
import { CalendarPlus, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useGluehweinShifts } from '../hooks/useGluehweinShifts';
import { useSalesDays } from '../hooks/useSalesDays';
import useHoris from '../hooks/useHoris';
import { gluehweinShares, gluehweinBonusFromSettings, bonusReductionPct } from '../utils/gluehweinBonus';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import GluehweinShiftSettingsModal from './GluehweinShiftSettingsModal';
import './DataTable.css';
import './GluehweinSchichten.css';

const DEFAULT_TEMPLATES = ['16:00-19:00', '19:00-22:00'];

const ERROR_TEXT = {
  YEAR_LOCKED: 'Dieses Jahr ist abgeschlossen und kann nicht mehr geändert werden.',
  DAY_EXISTS: 'Dieses Datum gibt es schon.',
  INVALID_DATE: 'Ungültiges Datum (Format JJJJ-MM-TT).',
  BAD_TEMPLATE: 'Ungültige Schichtzeit. Bitte die Schicht-Einstellungen prüfen.',
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
const fmtDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtTime = (t) => String(t ?? '').slice(0, 5);

/**
 * Shift planning of a Verkaufsaktion: event days, shift slots per day with assigned Horis,
 * and a per-Hori table (Schichten, Pflicht, Extra, Anteil %, Bonus %).
 * Props: action (SALES_ACTIONS entry), year, yearLocked, settings (global settings object), onError(text).
 */
const GluehweinSchichten = ({ action, year, yearLocked, settings, onError }) => {
  const actionKey = action?.key ?? action;
  const { fetchShifts, addSlots, removeSlot, assign, unassign } = useGluehweinShifts(actionKey);
  const { fetchDays, addDay, deleteDay } = useSalesDays(actionKey);
  const { fetchHoriStats } = useHoris();

  const [days, setDays] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [horis, setHoris] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [confirm, setConfirm] = useState(null); // { kind: 'day'|'slot', id, label }
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPatch, setSettingsPatch] = useState({});
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

  const handleConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'day') await run(() => deleteDay(c.id), 'Datum konnte nicht gelöscht werden.');
    else await run(() => removeSlot(c.id), 'Schicht konnte nicht gelöscht werden.');
  };

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
        <div className="gw-shifts-days">
          {days.map((day) => {
            const slots = shiftsByDay.get(day.id) || [];
            const missing = templates.filter((tpl) => !slots.some((s) => fmtTime(s.start_time) === tpl.split('-')[0]));
            return (
              <section key={day.id} className="gw-shifts-day card">
                <header className="gw-shifts-day-head">
                  <h3>{fmtDate(day.date)}</h3>
                  <div className="gw-shifts-day-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={disabled || missing.length === 0}
                      title={missing.length === 0 ? 'Alle Schichten aus den Einstellungen sind angelegt.' : `Legt an: ${missing.join(', ')}`}
                      onClick={() => run(() => addSlots(day.id, templates), 'Schichten konnten nicht angelegt werden.')}
                    >
                      <Plus size={16} /> Schichten anlegen
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label={`Tag ${day.date} löschen`}
                      title="Tag löschen"
                      onClick={() => setConfirm({ kind: 'day', id: day.id, label: fmtDate(day.date) })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </header>

                {slots.length === 0 ? (
                  <p className="gw-shifts-day-empty">Noch keine Schichten an diesem Tag.</p>
                ) : (
                  <ul className="gw-shifts-slots">
                    {slots.map((slot) => {
                      const assigned = slot.horis || [];
                      const options = activeHoris.filter((h) => !assigned.includes(h.id));
                      const time = `${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)}`;
                      return (
                        <li key={slot.id} className="gw-shifts-slot">
                          <div className="gw-shifts-slot-time">
                            <span>{time}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={disabled}
                              aria-label={`Schicht ${time} löschen`}
                              title="Schicht löschen"
                              onClick={() => setConfirm({ kind: 'slot', id: slot.id, label: `${fmtDate(day.date)}, ${time}` })}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                          <div className="gw-shifts-chips">
                            {assigned.length === 0 && <span className="dt-muted">Niemand eingeteilt</span>}
                            {assigned.map((id) => {
                              const h = horiById.get(id);
                              const name = h ? horiName(h) : 'Unbekannt';
                              return (
                                <span key={id} className="gw-shifts-chip">
                                  {name}
                                  {!yearLocked && (
                                    <button
                                      type="button"
                                      className="gw-shifts-chip-remove"
                                      disabled={busy}
                                      aria-label={`${name} austragen`}
                                      title="Austragen"
                                      onClick={() => run(() => unassign(slot.id, id), 'Hori konnte nicht ausgetragen werden.')}
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                            {!yearLocked && options.length > 0 && (
                              <select
                                className="input-field gw-shifts-picker"
                                aria-label={`Hori zur Schicht ${time} hinzufügen`}
                                value=""
                                disabled={busy}
                                onChange={(e) => {
                                  const horiId = e.target.value;
                                  if (horiId) run(() => assign(slot.id, horiId), 'Hori konnte nicht eingeteilt werden.');
                                }}
                              >
                                <option value="">+ Hori…</option>
                                {options.map((h) => <option key={h.id} value={h.id}>{horiName(h)}</option>)}
                              </select>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="data-table-container gw-shifts-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Hori</th>
              <th>Schichten</th>
              <th>Pflicht</th>
              <th>Extra</th>
              <th>Anteil %</th>
              {bonus.enabled && <th>Bonus %</th>}
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr><td colSpan={bonus.enabled ? 6 : 5} className="dt-muted">Keine aktiven Horis in diesem Jahr.</td></tr>
            ) : tableRows.map((r) => (
              <tr key={r.hori.id} className={isActive(r.hori) ? undefined : 'gw-shifts-inactive'}>
                <td>
                  {horiName(r.hori)}
                  {!isActive(r.hori) && <span className="dt-muted"> (inaktiv)</span>}
                </td>
                <td>
                  {r.count}
                  {isActive(r.hori) && r.count < bonus.mandatory && (
                    <span className="gw-shifts-under">unter Pflicht</span>
                  )}
                </td>
                <td>{bonus.mandatory}</td>
                <td>{r.extra}</td>
                <td>{r.share ? fmtPct(r.share.sharePct) : <span className="dt-muted">—</span>}</td>
                {bonus.enabled && (
                  <td>{r.reduction != null ? fmtPct(r.reduction) : <span className="dt-muted">—</span>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'day' ? 'Verkaufstag löschen?' : 'Schicht löschen?'}
          message={confirm.kind === 'day'
            ? `${confirm.label}: Der Tag wird mit allen Schichten und Einteilungen gelöscht.`
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
