import { useState, useRef, useEffect } from 'react';
import { TEAM_FEE_KEY } from '../hooks/useBaseballRows';
import { useBaseballFields } from '../hooks/useBaseballFields';
import useSettings from '../hooks/useSettings';
import ConfirmDialog from './ConfirmDialog';
import SettingsFieldsModal from './SettingsFieldsModal';
import BaseballTeamModal from './BaseballTeamModal';
import BaseballFieldSelect, { countTeamsPerField } from './BaseballFieldSelect';
import { editableRowProps } from './editableRow';
import { CheckCell, DeleteButton, EditButton, money } from './BaseballCells';
import './DataTable.css';
import './BaseballPlanning.css';

const EMPTY_DRAFT = { name: '', field_id: null, contact_name: '', phone: '', email: '' };

/**
 * Baseballturnier Teams (Excel "Teams"): Gruppenname, Feld, Ansprechpartner, Telefon, E-Mail, Kontaktiert, Bezahlt.
 * Teams are added in the empty last row; it is saved once it has a Gruppenname and the user presses Enter
 * or leaves the row. Rows are read-only text; the Feld select and the two check marks save at once, the rest is edited in
 * a dialog. The team fee is one year setting (button above the table), not a column.
 */
const BaseballTeams = ({ year, yearLocked, onError }) => {
  const { fields, teams, setTeamField } = useBaseballFields(year, yearLocked, onError);
  const { loadYearSettings, saveYearSettings } = useSettings();
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [pending, setPending] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const addRowRef = useRef(null);
  const nameInputRef = useRef(null);
  const feeBtnRef = useRef(null);
  const editTriggerRef = useRef(null);
  const addingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadYearSettings(year)
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch(() => { if (!cancelled) { setSettings({}); onError?.('Einstellungen konnten nicht geladen werden.'); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  if (!teams.rows) return <div className="baseball-planning-loading">Lade Teams…</div>;

  const disabled = !!yearLocked;
  const fee = Number(settings?.[TEAM_FEE_KEY]) || 0;
  const fieldCounts = countTeamsPerField(teams.rows);

  const setField = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const saveDraft = async ({ refocus }) => {
    const name = draft.name.trim();
    if (!name || disabled || addingRef.current) return;
    addingRef.current = true;
    const ok = await teams.add({
      name,
      field_id: draft.field_id || null,
      contact_name: draft.contact_name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
    });
    addingRef.current = false;
    if (ok) {
      setDraft(EMPTY_DRAFT);
      if (refocus) nameInputRef.current?.focus();
    }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDraft({ refocus: true });
    }
  };

  // Moving between the fields of the empty row does not save yet; leaving the row does.
  const handleAddBlur = (e) => {
    if (addRowRef.current?.contains(e.relatedTarget)) return;
    saveDraft({ refocus: false });
  };

  const addInput = (key, label, props = {}) => (
    <input
      type="text"
      className="input-field baseball-cell"
      value={draft[key]}
      placeholder={label}
      aria-label={`Neues Team: ${label}`}
      disabled={disabled}
      onChange={setField(key)}
      onKeyDown={handleAddKeyDown}
      onBlur={handleAddBlur}
      {...props}
    />
  );

  const textCell = (value) => (
    <td className="baseball-text-cell" title={value || undefined}>{value || <span className="dt-muted">–</span>}</td>
  );

  return (
    <div className="baseball-planning baseball-teams">
      <div className="baseball-teams-head">
        <span className="baseball-teams-count">
          {teams.rows.length} {teams.rows.length === 1 ? 'Team' : 'Teams'}
        </span>
        <button
          type="button"
          ref={feeBtnRef}
          className="baseball-fee-btn"
          disabled={!settings || disabled}
          title="Team-Beitrag bearbeiten"
          onClick={() => setShowFeeModal(true)}
        >
          Beitrag: <strong>{money(fee)}</strong>
        </button>
      </div>

      <div className="data-table-container baseball-teams-wrap">
        <table className="data-table baseball-table baseball-teams-table">
          <colgroup>
            <col style={{ width: '186px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '184px' }} />
            <col style={{ width: '154px' }} />
            <col style={{ width: '196px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '84px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Gruppenname</th>
              <th>Feld</th>
              <th>Ansprechpartner</th>
              <th>Telefon</th>
              <th>E-Mail</th>
              <th className="center">Kontaktiert</th>
              <th className="center">Bezahlt</th>
              <th aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {teams.rows.map((t) => (
              <tr
                key={t.id}
                {...(disabled ? {} : editableRowProps((row) => { editTriggerRef.current = row; setEditing(t); }, `Team ${t.name} bearbeiten`))}
              >
                {textCell(t.name)}
                <td>
                  <BaseballFieldSelect
                    fields={fields}
                    counts={fieldCounts}
                    listClassName="baseball-field-list--compact"
                    value={t.field_id}
                    ownFieldId={t.field_id}
                    disabled={disabled}
                    onChange={(id) => setTeamField(t.id, id)}
                  />
                </td>
                {textCell(t.contact_name)}
                {textCell(t.phone)}
                {textCell(t.email)}
                <td className="center">
                  <CheckCell checked={t.contacted} disabled={disabled} label={`${t.name} kontaktiert`} onChange={(v) => teams.update(t.id, { contacted: v ? 1 : 0 })} />
                </td>
                <td className="center">
                  <CheckCell checked={t.paid} disabled={disabled} label={`${t.name} bezahlt`} onChange={(v) => teams.update(t.id, { paid: v ? 1 : 0 })} />
                </td>
                <td>
                  <div className="baseball-row-actions">
                    <EditButton
                      disabled={disabled}
                      label={`Team ${t.name} bearbeiten`}
                      onClick={(e) => { editTriggerRef.current = e.currentTarget; setEditing(t); }}
                    />
                    <DeleteButton disabled={disabled} label={`Team ${t.name} entfernen`} onClick={() => setPending(t)} />
                  </div>
                </td>
              </tr>
            ))}
            <tr className="baseball-add-row" ref={addRowRef}>
              <td>{addInput('name', 'Gruppenname', { ref: nameInputRef, maxLength: 60 })}</td>
              <td onBlur={handleAddBlur}>
                <BaseballFieldSelect
                  fields={fields}
                  counts={fieldCounts}
                  listClassName="baseball-field-list--compact"
                  value={draft.field_id}
                  disabled={disabled}
                  onChange={(id) => setDraft((d) => ({ ...d, field_id: id }))}
                />
              </td>
              <td>{addInput('contact_name', 'Ansprechpartner', { maxLength: 80 })}</td>
              <td>{addInput('phone', 'Telefon', { type: 'tel', maxLength: 40 })}</td>
              <td>{addInput('email', 'E-Mail', { type: 'email', maxLength: 120 })}</td>
              <td colSpan={3} className="baseball-add-hint">
                {disabled ? '' : draft.name.trim() ? 'Enter zum Speichern' : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {editing && (
        <BaseballTeamModal
          team={editing}
          fields={fields}
          fieldCounts={fieldCounts}
          triggerRef={editTriggerRef}
          onCancel={() => setEditing(null)}
          onSave={async (patch) => {
            const ok = await teams.update(editing.id, patch);
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}

      {showFeeModal && settings && !disabled && (
        <SettingsFieldsModal
          title="Team-Beitrag"
          description="Beitrag, den jedes Team für dieses Turnierjahr zahlt."
          values={settings}
          saveFn={(patch) => saveYearSettings(year, patch)}
          triggerRef={feeBtnRef}
          onCancel={() => setShowFeeModal(false)}
          onSaved={(patch) => { setSettings((prev) => ({ ...prev, ...patch })); setShowFeeModal(false); }}
          fields={[
            { key: TEAM_FEE_KEY, kind: 'decimal', wide: true, label: 'Beitrag pro Team (€)', hint: 'Die Übersicht rechnet bezahlte Teams × Beitrag.' },
          ]}
        />
      )}

      {pending && (
        <ConfirmDialog
          title="Team löschen?"
          message={`„${pending.name}“ wird mit Kontaktdaten entfernt.`}
          confirmLabel="Löschen"
          onConfirm={() => { const id = pending.id; setPending(null); teams.remove(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballTeams;
