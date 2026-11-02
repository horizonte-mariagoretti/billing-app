import { useRef, useState } from 'react';
import { AlertTriangle, Info, Pencil, X } from 'lucide-react';
import { useBaseballFields, FIELD_NAME_MAX } from '../hooks/useBaseballFields';
import { useBaseballFieldHoris, horiName } from '../hooks/useBaseballFieldHoris';
import StyledSelect from './StyledSelect';
import { groupByField, roundRobin, GROUP_SIZE } from '../utils/baseballGroups';
import './BaseballPlanning.css';
import './BaseballFields.css';

/**
 * Baseballturnier Felder: group phase only. The user picks the Feld of each team (Teams tab, column Feld);
 * the four fields are shown as stacked cards with their teams as chips and the round-robin schedule
 * (6 matches) as match tiles. Each field has a name (default "Feld 1–4"; click the title or the pencil to rename,
 * Enter or leaving the field saves, max 40 characters, not empty; the Teams tab shows the new name) and its
 * Horis as referees ("Schiedsrichter (Horis)": chips with a remove button, a select adds an active Hori of the
 * year; baseball_field_horis). Renaming and referees are read-only in a locked year. A field with fewer than 4 teams fills the open slots with placeholder teams
 * ("Platzhalter 1", …; display only, not saved) and shows a warning; more than 4 teams: warning, no schedule.
 * Above the cards: a warning when the team count is not a multiple of 4, and a note listing teams without a field.
 */
/** The field's teams, filled up to GROUP_SIZE with display-only placeholder teams. */
const withPlaceholders = (number, teams) => {
  const slots = teams.slice();
  for (let i = 1; slots.length < GROUP_SIZE; i += 1) {
    slots.push({ id: `placeholder-${number}-${i}`, name: `Platzhalter ${i}`, placeholder: true });
  }
  return slots;
};

const teamClass = (base, t) => (t.placeholder ? `${base} baseball-fields-placeholder` : base);

/** Field title: text with a pencil button; while editing an input (Enter / blur saves, Escape cancels). */
const FieldTitle = ({ name, locked, onRename, children }) => {
  const [draft, setDraft] = useState(null);
  const done = useRef(false);
  const start = () => { if (locked) return; done.current = false; setDraft(name); };
  const finish = async (save) => {
    if (done.current) return;
    done.current = true;
    const value = draft;
    setDraft(null);
    if (save && value != null && value.trim() !== name) await onRename(value);
  };
  return (
    <h3 className="baseball-field-name">
      {draft != null ? (
        <input
          className="baseball-field-name-input"
          value={draft}
          maxLength={FIELD_NAME_MAX}
          autoFocus
          aria-label="Feldname"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
          }}
        />
      ) : locked ? (
        <span>{name}</span>
      ) : (
        <>
          <span className="baseball-field-name-text" onClick={start} title="Feld umbenennen">{name}</span>
          <button type="button" className="baseball-field-rename" onClick={start} aria-label={`${name} umbenennen`} title="Feld umbenennen">
            <Pencil size={13} aria-hidden="true" />
          </button>
        </>
      )}
      {children}
    </h3>
  );
};

/** Section "Schiedsrichter (Horis)" of one field: chips with a remove button, a select to add an active Hori. */
const FieldReferees = ({ fieldId, name, links, horis, locked, onAdd, onRemove }) => {
  const own = (links || []).filter((l) => l.field_id === fieldId);
  const ownIds = new Set(own.map((l) => l.hori_id));
  const available = (horis || []).filter((h) => !ownIds.has(h.id));
  return (
    <div className="baseball-field-refs">
      <span className="baseball-field-refs-label">Schiedsrichter (Horis)</span>
      <div className="baseball-field-refs-row">
        {own.length > 0 ? (
          <div className="baseball-field-chips" role="list" aria-label={`Schiedsrichter ${name}`}>
            {own.map((l) => (
              <span key={l.hori_id} className="baseball-field-chip baseball-field-ref-chip" role="listitem">
                {horiName(l)}
                {!locked && (
                  <button
                    type="button"
                    className="baseball-field-ref-remove"
                    onClick={() => onRemove(fieldId, l.hori_id)}
                    aria-label={`${horiName(l)} entfernen`}
                    title="Entfernen"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="baseball-field-refs-empty">Noch keine Schiedsrichter</span>
        )}
        {!locked && (
          <div className="baseball-field-ref-add">
            <StyledSelect
              portal
              value=""
              placeholder={available.length ? 'Hori hinzufügen' : 'Keine weiteren Horis'}
              disabled={!horis || available.length === 0}
              onChange={(e) => { if (e.target.value) onAdd(fieldId, e.target.value); }}
            >
              {available.map((h) => <option key={h.id} value={h.id}>{horiName(h)}</option>)}
            </StyledSelect>
          </div>
        )}
      </div>
    </div>
  );
};

const BaseballFields = ({ year, yearLocked, onError }) => {
  const { fields, teams, renameField } = useBaseballFields(year, yearLocked, onError);
  const referees = useBaseballFieldHoris(year, yearLocked, onError);
  const [noteHidden, setNoteHidden] = useState(false);

  if (!teams.rows || !fields) return <div className="baseball-planning-loading">Lade Felder…</div>;

  const { fields: cards, unassigned, total, totalValid } = groupByField(teams.rows, fields);

  return (
    <div className="baseball-planning">
      {total > 0 && !totalValid && (
        <div className="baseball-field-warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Anzahl Teams muss ein Vielfaches von {GROUP_SIZE} sein (aktuell {total}).</span>
        </div>
      )}

      {unassigned.length > 0 && !noteHidden && (
        <div className="baseball-fields-note" role="status">
          <Info size={16} aria-hidden="true" />
          <span>
            {unassigned.length} {unassigned.length === 1 ? 'Team' : 'Teams'} ohne Feld:{' '}
            {unassigned.map((t) => t.name).join(', ')}
          </span>
          <button
            type="button"
            className="baseball-row-btn baseball-fields-note-close"
            aria-label="Hinweis ausblenden"
            title="Hinweis ausblenden"
            onClick={() => setNoteHidden(true)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {cards.map(({ id, number, name, teams: fieldTeams, complete }) => {
        const tooMany = fieldTeams.length > GROUP_SIZE;
        const slots = tooMany ? fieldTeams : withPlaceholders(number, fieldTeams);
        const matches = tooMany ? [] : roundRobin(slots);
        return (
          <section key={id} className="card baseball-field-card" aria-label={name}>
            <header className="baseball-field-head">
              <FieldTitle name={name} locked={yearLocked} onRename={(value) => renameField(id, value)}>
                {!complete && total > 0 && (
                  <span
                    className="baseball-field-warn-icon"
                    role="img"
                    title={`${name} hat ${fieldTeams.length} von ${GROUP_SIZE} Teams${tooMany ? ', kein Spielplan' : ', Spielplan mit Platzhaltern'}`}
                    aria-label={`Warnung: ${name} hat ${fieldTeams.length} von ${GROUP_SIZE} Teams`}
                  >
                    <AlertTriangle size={15} aria-hidden="true" />
                  </span>
                )}
              </FieldTitle>
            </header>

            {total === 0 ? (
              <p className="baseball-field-empty">Noch keine Teams. Teams im Tab Teams anlegen.</p>
            ) : (
              <>
                <div className="baseball-field-chips" role="list" aria-label={`Teams ${name}`}>
                  {slots.map((t) => (
                    <span key={t.id} className={teamClass('baseball-field-chip', t)} role="listitem">{t.name}</span>
                  ))}
                </div>

                {matches.length > 0 && (
                  <div className="baseball-matches" role="list" aria-label={`Spielplan ${name}`}>
                    {matches.map(([home, away], n) => (
                      <div
                        key={`${home.id}-${away.id}`}
                        className="baseball-match"
                        role="listitem"
                        aria-label={`Spiel ${n + 1}: ${home.name} gegen ${away.name}`}
                      >
                        <span className="baseball-match-no" aria-hidden="true">{n + 1}</span>
                        <span className="baseball-match-teams" aria-hidden="true">
                          <span className={teamClass('baseball-match-team', home)}>{home.name}</span>
                          <span className="baseball-match-vs">vs</span>
                          <span className={teamClass('baseball-match-team', away)}>{away.name}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <FieldReferees
              fieldId={id}
              name={name}
              links={referees.links}
              horis={referees.horis}
              locked={yearLocked}
              onAdd={referees.addLink}
              onRemove={referees.removeLink}
            />
          </section>
        );
      })}
    </div>
  );
};

export default BaseballFields;
