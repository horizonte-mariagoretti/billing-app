import DatePicker from './DatePicker';
import './ActionDateField.css';

/**
 * Date of a Verkaufsaktion for the selected scout year, shown next to the year switcher (no visible label; `title` is the tooltip).
 * The month of this date decides where the action's Saldo counts in the Dashboard Umsatz.
 * Uses the shared DatePicker (same look as in the editors). initialView: ISO date whose month opens first
 * (the usual month of the action). onChange(value): '' when cleared.
 */
const ActionDateField = ({ title, value, initialView, disabled, onChange }) => (
  <div className="action-date" title={title}>
    <DatePicker value={value} onChange={onChange} disabled={disabled} initialView={initialView} />
  </div>
);

export default ActionDateField;
