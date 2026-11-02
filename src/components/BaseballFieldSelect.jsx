import StyledSelect from './StyledSelect';
import { GROUP_SIZE } from '../utils/baseballGroups';
import './BaseballFields.css';

/** Number of teams per field id (teams without a field are not counted). */
export const countTeamsPerField = (teams) => {
  const counts = new Map();
  for (const t of teams || []) {
    if (t?.field_id != null) counts.set(t.field_id, (counts.get(t.field_id) || 0) + 1);
  }
  return counts;
};

/**
 * Feld of a Baseballturnier team: "–" (no field) or one of the year's fields. A field that already holds
 * 4 teams is disabled, except the team's own current field (`ownFieldId`).
 * The open list is portaled to document.body (never cut off by the scrolling table or a dialog);
 * listClassName styles it (e.g. compact in the Teams table).
 * onChange(fieldId|null). Clicks do not bubble, so a click inside an editable table row does not open the editor.
 */
const BaseballFieldSelect = ({ fields, counts, value, ownFieldId = null, onChange, disabled = false, className = '', listClassName = '' }) => (
  <div className="baseball-field-select" onClick={(e) => e.stopPropagation()}>
    <StyledSelect
      className={className}
      portal
      dropdownClassName={`baseball-field-list${listClassName ? ' ' + listClassName : ''}`}
      value={value || ''}
      disabled={disabled || !fields}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">–</option>
      {(fields || []).map((f) => {
        const full = (counts?.get(f.id) || 0) >= GROUP_SIZE && f.id !== ownFieldId;
        return (
          <option key={f.id} value={f.id} disabled={full} title={full ? `${f.name} hat schon ${GROUP_SIZE} Teams` : undefined}>
            {f.name}
          </option>
        );
      })}
    </StyledSelect>
  </div>
);

export default BaseballFieldSelect;
