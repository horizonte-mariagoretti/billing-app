import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle, AlertTriangle, Plus } from 'lucide-react';
import { useBaseballDuties } from '../hooks/useBaseballDuties';
import { toMinutes } from '../utils/shiftLayout';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import BaseballShiftCard from './BaseballShiftCard';
import BaseballShiftModal from './BaseballShiftModal';
import BaseballPersonModal from './BaseballPersonModal';
import './DataTable.css';
import './BaseballPlanning.css';
import './BaseballDienste.css';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Shifts in time order: by begin (shifts without a begin last), then by their sort order.
const byTime = (a, b) => {
  const ta = toMinutes(a.start_time);
  const tb = toMinutes(b.start_time);
  if (ta !== tb) return (ta ?? Infinity) - (tb ?? Infinity);
  return 0;
};

/**
 * Baseballturnier "Schichten" (parent duties): one card per shift, one row per duty in each card with the
 * persons as chips, Soll (needed) and Ist (count). A banner lists the slots that still miss persons.
 * A locked year is read-only.
 */
const BaseballDienste = ({ year, yearLocked, onError }) => {
  const {
    fetchDuties, addDuty, deleteDuty, addShift, updateShift, deleteShift,
    addPerson, updatePerson, deletePerson, setNeeded,
  } = useBaseballDuties(onError);
  const [data, setData] = useState(null); // { year, duties, shifts, teams, persons, needed }
  const [reloadKey, setReloadKey] = useState(0);
  const [dutyFormOpen, setDutyFormOpen] = useState(false);
  const [newDuty, setNewDuty] = useState('');
  const [shiftModal, setShiftModal] = useState(null); // { shift } (shift null = new)
  const [personModal, setPersonModal] = useState(null); // { person, context }
  const [confirm, setConfirm] = useState(null); // { kind: 'duty'|'shift', id, label }
  const dutyInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchDuties(year)
      .then((d) => { if (!cancelled) setData({ year, ...d }); })
      .catch(() => {
        if (!cancelled) {
          onError?.('Schichten konnten nicht geladen werden.');
          setData({ year, duties: [], shifts: [], teams: [], persons: new Map(), needed: new Map() });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDuties, year, reloadKey]);

  useEffect(() => { if (dutyFormOpen) dutyInputRef.current?.focus(); }, [dutyFormOpen]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  // Runs a hook write (resolves true/false) and reloads after a successful one.
  const write = useCallback(async (promise) => {
    if (yearLocked) return false;
    const ok = await promise;
    if (ok) reload();
    return ok;
  }, [yearLocked, reload]);

  const shifts = useMemo(() => (data ? [...data.shifts].sort(byTime) : []), [data]);

  // Open slots (Ist < Soll) grouped per shift, for the banner.
  const gaps = useMemo(() => {
    if (!data) return [];
    return shifts.map((s) => {
      const open = data.duties
        .map((d) => {
          const key = `${d.id}|${s.id}`;
          return { name: d.name, missing: (data.needed.get(key) || 0) - (data.persons.get(key)?.length || 0) };
        })
        .filter((g) => g.missing > 0);
      return { shift: s, open };
    }).filter((g) => g.open.length > 0);
  }, [data, shifts]);

  if (!data || data.year !== year) return <div className="baseball-planning-loading">Lade Schichten…</div>;

  const disabled = !!yearLocked;
  const personCount = [...data.persons.values()].reduce((n, list) => n + list.length, 0);

  const handleAddDuty = async (e) => {
    e.preventDefault();
    const name = newDuty.trim();
    if (!name) return;
    if (await write(addDuty(year, name))) {
      setNewDuty('');
      dutyInputRef.current?.focus();
    }
  };

  const handleSaveShift = async (patch) => {
    const target = shiftModal?.shift;
    const ok = await write(target
      ? updateShift(target.id, patch)
      : addShift(year, patch.label, patch.start_time, patch.end_time));
    if (ok) setShiftModal(null);
    return ok;
  };

  const handleConfirmDelete = async () => {
    const target = confirm;
    setConfirm(null);
    await write(target.kind === 'duty' ? deleteDuty(year, target.id) : deleteShift(year, target.id));
  };

  const handleSavePerson = async (patch) => {
    const ok = await write(updatePerson(personModal.person.id, patch));
    if (ok) setPersonModal(null);
    return ok;
  };

  const handleDeletePerson = async () => {
    const ok = await write(deletePerson(personModal.person.id));
    if (ok) setPersonModal(null);
    return ok;
  };

  const gapText = (g) => {
    const n = g.open.length;
    const list = g.open.map((o) => `${o.name} ${o.missing === 1 ? 'fehlt 1' : `fehlen ${o.missing}`}`).join(', ');
    return `${n === 1 ? '1 Dienst' : `${n} Dienste`} in ${g.shift.label} noch unbesetzt (${list})`;
  };

  return (
    <div className="baseball-planning baseball-dienste">
      {yearLocked && (
        <div className="baseball-dienste-note" role="note">
          <AlertCircle size={14} /> Dieses Jahr ist abgeschlossen. Die Schichten sind nur lesbar.
        </div>
      )}

      <div className="baseball-teams-head">
        <span className="baseball-teams-count">
          {plural(data.shifts.length, 'Schicht', 'Schichten')} · {plural(data.duties.length, 'Dienst', 'Dienste')} · {plural(personCount, 'Person', 'Personen')}
        </span>
        <div className="baseball-dienste-actions">
          <Button type="button" variant="secondary" size="md" disabled={disabled} onClick={() => setShiftModal({ shift: null })}>
            <Plus size={16} /> Schicht hinzufügen
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={disabled}
            aria-expanded={dutyFormOpen}
            onClick={() => setDutyFormOpen((o) => !o)}
          >
            <Plus size={16} /> Dienst hinzufügen
          </Button>
        </div>
      </div>

      {dutyFormOpen && !disabled && (
        <form className="baseball-add-form" onSubmit={handleAddDuty}>
          <input
            ref={dutyInputRef}
            type="text"
            className="input-field"
            placeholder="Dienst, z. B. Theke"
            value={newDuty}
            maxLength={40}
            onChange={(e) => setNewDuty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setNewDuty(''); setDutyFormOpen(false); } }}
            aria-label="Neuer Dienst"
          />
          <Button type="submit" variant="primary" size="md" disabled={!newDuty.trim()}>Hinzufügen</Button>
          <Button type="button" variant="ghost" size="md" onClick={() => { setNewDuty(''); setDutyFormOpen(false); }}>
            Abbrechen
          </Button>
        </form>
      )}

      {gaps.length > 0 && (
        <div className="baseball-field-warning" role="status">
          <AlertTriangle size={16} />
          <span>{gaps.map(gapText).join(' · ')}</span>
        </div>
      )}

      {shifts.length === 0 ? (
        <div className="baseball-planning-loading card baseball-dienste-empty">
          Noch keine Schichten{data.duties.length === 0 ? ' und Dienste' : ''}. Oben mit „Schicht hinzufügen"
          {data.duties.length === 0 ? ' und „Dienst hinzufügen"' : ''} anlegen.
        </div>
      ) : (
        shifts.map((s) => (
          <BaseballShiftCard
            key={s.id}
            shift={s}
            duties={data.duties}
            persons={data.persons}
            needed={data.needed}
            disabled={disabled}
            onEdit={() => setShiftModal({ shift: s })}
            onDelete={() => setConfirm({ kind: 'shift', id: s.id, label: s.label })}
            onDeleteDuty={(d) => setConfirm({ kind: 'duty', id: d.id, label: d.name })}
            onAddPerson={(dutyId, shiftId, name) => write(addPerson(dutyId, shiftId, { name }))}
            onOpenPerson={(person, duty) => setPersonModal({ person, context: `${duty.name} · ${s.label}` })}
            onSetNeeded={(dutyId, shiftId, n) => write(setNeeded(dutyId, shiftId, n))}
          />
        ))
      )}

      {shiftModal && (
        <BaseballShiftModal
          shift={shiftModal.shift}
          defaultLabel={`Schicht ${data.shifts.length + 1}`}
          onSave={handleSaveShift}
          onCancel={() => setShiftModal(null)}
        />
      )}

      {personModal && (
        <BaseballPersonModal
          person={personModal.person}
          context={personModal.context}
          teams={data.teams}
          onSave={handleSavePerson}
          onDelete={handleDeletePerson}
          onCancel={() => setPersonModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'duty' ? 'Dienst löschen?' : 'Schicht löschen?'}
          message={confirm.kind === 'duty'
            ? `${confirm.label}: Der Dienst wird aus allen Schichten entfernt, die eingetragenen Namen gehen verloren.`
            : `${confirm.label}: Alle Namen in dieser Schicht gehen verloren.`}
          confirmLabel="Löschen"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default BaseballDienste;
