import { useState, useEffect, useCallback } from 'react';
import StyledSelect from './StyledSelect';
import ConfirmDialog from './ConfirmDialog';
import { useGluehweinUnits } from '../hooks/useGluehweinUnits';
import { useT } from '../hooks/useUiTranslations';

/**
 * "Geplant in" dropdown on the shared StyledSelect. The offered modes come from the shared list (gw_plan_modes);
 * each can be removed after a confirmation, but the last one always stays. labels: { [mode]: text } computed by the
 * caller, because the labels depend on the item's units. A mode of the item that is not in the list is still shown.
 */
const PlanModePicker = ({ value, labels, onChange, disabled = false }) => {
  const t = useT();
  const { fetchPlanModes, deletePlanMode } = useGluehweinUnits();
  const [modes, setModes] = useState([]);
  const [toRemove, setToRemove] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setModes(await fetchPlanModes());
  }, [fetchPlanModes]);

  useEffect(() => {
    reload().catch(() => setError(t('gw_unit_load_error', 'Einheiten konnten nicht geladen werden.')));
    // reload only once per mount; t is stable per render tree
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const options = value && !modes.includes(value) ? [...modes, value] : modes;

  const confirmRemove = async () => {
    const key = toRemove;
    setToRemove(null);
    try {
      await deletePlanMode(key);
      await reload();
      setError(null);
    } catch (err) {
      setError(err?.message === 'PLAN_MODE_LAST'
        ? t('gw_plan_mode_last', 'Mindestens eine Option muss bleiben.')
        : t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  };

  return (
    <div className="unit-picker">
      <StyledSelect
        value={value}
        disabled={disabled}
        onRemove={(key) => setToRemove(key)}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((key) => <option key={key} value={key}>{labels[key] || key}</option>)}
      </StyledSelect>
      {error && <span className="input-error">{error}</span>}

      {toRemove && (
        <ConfirmDialog
          title={t('gw_plan_mode_remove_title', 'Option entfernen?')}
          message={`${labels[toRemove] || toRemove}: ${t('gw_plan_mode_remove_msg', 'Diese Option wird nicht mehr angeboten. Bestehende Artikel behalten ihre Einstellung.')}`}
          confirmLabel={t('gw_unit_remove', 'Entfernen')}
          onConfirm={confirmRemove}
          onCancel={() => setToRemove(null)}
        />
      )}
    </div>
  );
};

export default PlanModePicker;
