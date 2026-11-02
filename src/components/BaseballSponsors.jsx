import { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballSponsors } from '../hooks/useBaseballSponsors';
import { materialText } from '../utils/baseballSponsors';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import SponsorStatusIcon from './SponsorStatusIcon';
import BaseballSponsorModal from './BaseballSponsorModal';
import { CheckCell, DeleteButton, EditButton, money } from './BaseballCells';
import { editableRowProps } from './editableRow';
import './DataTable.css';
import './BaseballPlanning.css';
import './BaseballSponsors.css';

export { SPONSOR_STATUS } from '../utils/baseballSponsors';

/**
 * Baseballturnier Sponsoren of one scout year: count + "Sponsor hinzufügen" above a read-only table
 * (Sponsor | Kontakt | Status | Art | Betrag | Rechnung | Überwiesen | Material). Rechnung and Überwiesen save at once;
 * everything else is edited in BaseballSponsorModal (row click, Enter or the edit button). Delete removes only this
 * year's row; the library entry stays.
 */
const BaseballSponsors = ({ year, yearLocked, onError }) => {
  const sponsors = useBaseballSponsors(year, yearLocked, onError);
  const [modal, setModal] = useState(null); // { editing: row | null, key }
  const [pending, setPending] = useState(null);
  const triggerRef = useRef(null);

  if (!sponsors.rows) return <div className="baseball-planning-loading">Lade Sponsoren…</div>;

  const disabled = !!yearLocked;
  const rows = sponsors.rows;
  const total = rows.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const paid = rows.filter((s) => Number(s.paid)).reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

  const openModal = (editing, trigger) => {
    triggerRef.current = trigger || null;
    setModal({ editing, key: editing?.id ?? `new-${Date.now()}` });
  };
  const closeModal = () => {
    setModal(null);
    const el = triggerRef.current;
    if (el?.isConnected) setTimeout(() => el.focus(), 0);
  };

  const textCell = (value) => (
    <td className="baseball-text-cell" title={value || undefined}>{value || <span className="dt-muted">–</span>}</td>
  );

  return (
    <div className="baseball-planning">
      <div className="baseball-teams-head">
        <span className="baseball-teams-count">
          {rows.length} {rows.length === 1 ? 'Sponsor' : 'Sponsoren'}
        </span>
        <Button
          type="button"
          variant="primary"
          size="md"
          icon={Plus}
          disabled={disabled}
          onClick={(e) => openModal(null, e.currentTarget)}
        >
          Sponsor hinzufügen
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Sponsoren angelegt.</div>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-table bb-sponsors-table">
            <colgroup>
              <col />
              <col className="bb-sponsors-col-contact" />
              <col className="bb-sponsors-col-status" />
              <col className="bb-sponsors-col-art" />
              <col className="bb-sponsors-col-amount" />
              <col className="bb-sponsors-col-check" />
              <col className="bb-sponsors-col-paid" />
              <col className="bb-sponsors-col-material" />
              <col className="bb-sponsors-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Sponsor</th>
                <th>Kontakt</th>
                <th className="center">Status</th>
                <th>Art</th>
                <th className="num">Betrag</th>
                <th className="center">Rechnung</th>
                <th className="center">Überwiesen</th>
                <th>Material</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const name = s.sp_name || s.name;
                return (
                  <tr
                    key={s.id}
                    {...(disabled ? {} : editableRowProps((row) => openModal(s, row), `Sponsor ${name} bearbeiten`))}
                  >
                    {textCell(name)}
                    {textCell(s.sp_contact)}
                    <td className="center"><SponsorStatusIcon status={s.status} /></td>
                    {textCell(s.art)}
                    <td className="num">{money(s.amount)}</td>
                    <td className="center">
                      <CheckCell
                        checked={!!Number(s.invoiced)}
                        disabled={disabled}
                        label={`${name}: Rechnung gestellt`}
                        onChange={(v) => sponsors.updateYearRow(s.id, { invoiced: v ? 1 : 0 })}
                      />
                    </td>
                    <td className="center">
                      <CheckCell
                        checked={!!Number(s.paid)}
                        disabled={disabled}
                        label={`${name}: überwiesen`}
                        onChange={(v) => sponsors.updateYearRow(s.id, { paid: v ? 1 : 0 })}
                      />
                    </td>
                    {textCell(materialText(s))}
                    <td>
                      <div className="baseball-row-actions">
                        <EditButton
                          disabled={disabled}
                          label={`Sponsor ${name} bearbeiten`}
                          onClick={(e) => openModal(s, e.currentTarget)}
                        />
                        <DeleteButton disabled={disabled} label={`Sponsor ${name} entfernen`} onClick={() => setPending(s)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="baseball-foot-total" colSpan={4}>Summe</td>
                <td className="num baseball-foot-total">{money(total)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modal && (
        <BaseballSponsorModal
          key={modal.key}
          year={year}
          yearLocked={yearLocked}
          library={sponsors.library}
          rows={rows}
          editing={modal.editing}
          onClose={closeModal}
          onSaved={sponsors.reload}
          onError={onError}
        />
      )}

      {pending && (
        <ConfirmDialog
          title="Sponsor entfernen?"
          message={`„${pending.sp_name || pending.name}“ wird nur aus diesem Jahr entfernt (Betrag, Status, Material). Der Eintrag in der Sponsoren-Bibliothek bleibt erhalten.`}
          confirmLabel="Entfernen"
          onConfirm={() => { const id = pending.id; setPending(null); sponsors.removeYearRow(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballSponsors;
