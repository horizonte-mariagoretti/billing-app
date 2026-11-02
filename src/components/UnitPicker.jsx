import { useState, useEffect, useCallback } from 'react';
import StyledSelect from './StyledSelect';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { useGluehweinUnits } from '../hooks/useGluehweinUnits';
import { useT } from '../hooks/useUiTranslations';
import './UnitPicker.css';

const NEW = '__new__';

/**
 * Dropdown of the shared units of one kind ('sell' or 'buy'), built on the app's StyledSelect.
 * Every unit has a delete button in the list (after a confirmation). Removing a unit only takes it off the list;
 * items keep the unit they already have. "Neue Einheit anlegen…" opens a small name field (saved to the shared list
 * and selected, like "Neuen Kunden anlegen" in ClientPicker). A value that is not in the list (legacy data) is kept.
 */
const UnitPicker = ({ kind, value, onChange, disabled = false, placeholder = '–' }) => {
  const t = useT();
  const { fetchUnits, addUnit, deleteUnit } = useGluehweinUnits();
  const [units, setUnits] = useState([]);
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setUnits(await fetchUnits(kind));
  }, [fetchUnits, kind]);

  useEffect(() => {
    reload().catch(() => setError(t('gw_unit_load_error', 'Einheiten konnten nicht geladen werden.')));
    // t is stable per render tree; reload only when the kind changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const options = value && !units.includes(value) ? [...units, value] : units;

  const save = async () => {
    try {
      const name = await addUnit(kind, draft);
      await reload();
      onChange(name);
      setAdding(false);
      setDraft('');
      setError(null);
    } catch (err) {
      setError(err?.message === 'UNIT_EMPTY'
        ? t('gw_unit_empty', 'Bitte eine Einheit eingeben.')
        : t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  };

  const confirmRemove = async () => {
    const name = toRemove;
    setToRemove(null);
    try {
      await deleteUnit(kind, name);
      await reload();
    } catch {
      setError(t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  };

  if (adding) {
    return (
      <div className="unit-picker">
        <div className="unit-picker-new">
          <input
            type="text"
            className="input-field"
            value={draft}
            maxLength={20}
            placeholder={t('gw_unit_new_placeholder', 'z. B. Tasse')}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <Button variant="primary" size="sm" type="button" onClick={save}>
            {t('gw_unit_add', 'Anlegen')}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => setAdding(false)}>
            {t('btn_cancel', 'Abbrechen')}
          </Button>
        </div>
        {error && <span className="input-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="unit-picker">
      <StyledSelect
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        onRemove={(name) => setToRemove(name)}
        onChange={(e) => {
          if (e.target.value === NEW) setAdding(true);
          else onChange(e.target.value);
        }}
      >
        {options.map((u) => <option key={u} value={u}>{u}</option>)}
        <option value={NEW} fixed>+ {t('gw_unit_new', 'Neue Einheit anlegen…')}</option>
      </StyledSelect>
      {error && <span className="input-error">{error}</span>}

      {toRemove && (
        <ConfirmDialog
          title={t('gw_unit_remove_title', 'Einheit entfernen?')}
          message={`${toRemove}: ${t('gw_unit_remove_msg', 'Die Einheit verschwindet aus der Auswahl. Artikel, die sie schon haben, behalten sie.')}`}
          confirmLabel={t('gw_unit_remove', 'Entfernen')}
          onConfirm={confirmRemove}
          onCancel={() => setToRemove(null)}
        />
      )}
    </div>
  );
};

export default UnitPicker;
