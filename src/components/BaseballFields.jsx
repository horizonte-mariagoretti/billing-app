import { AlertTriangle, Info } from 'lucide-react';
import { useBaseballFields } from '../hooks/useBaseballFields';
import { groupByField, roundRobin, GROUP_SIZE } from '../utils/baseballGroups';
import './BaseballPlanning.css';
import './BaseballFields.css';

/**
 * Baseballturnier Felder: group phase only. The user picks the Feld of each team (Teams tab, column Feld);
 * the four fields (Feld 1–4) are shown as stacked cards with their teams as chips and the round-robin schedule
 * (6 matches) as match tiles. A field with fewer than 4 teams fills the open slots with placeholder teams
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

const BaseballFields = ({ year, yearLocked, onError }) => {
  const { fields, teams } = useBaseballFields(year, yearLocked, onError);

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

      {unassigned.length > 0 && (
        <div className="baseball-fields-note" role="status">
          <Info size={16} aria-hidden="true" />
          <span>
            {unassigned.length} {unassigned.length === 1 ? 'Team' : 'Teams'} ohne Feld:{' '}
            {unassigned.map((t) => t.name).join(', ')}
          </span>
        </div>
      )}

      {cards.map(({ number, name, teams: fieldTeams, complete }) => {
        const tooMany = fieldTeams.length > GROUP_SIZE;
        const slots = tooMany ? fieldTeams : withPlaceholders(number, fieldTeams);
        const matches = tooMany ? [] : roundRobin(slots);
        return (
          <section key={number} className="card baseball-field-card" aria-label={name}>
            <header className="baseball-field-head">
              <h3 className="baseball-field-name">
                {name}
                {!complete && total > 0 && (
                  <span
                    className="baseball-field-warn-icon"
                    role="img"
                    title={`Feld ${number} hat ${fieldTeams.length} von ${GROUP_SIZE} Teams${tooMany ? ', kein Spielplan' : ', Spielplan mit Platzhaltern'}`}
                    aria-label={`Warnung: Feld ${number} hat ${fieldTeams.length} von ${GROUP_SIZE} Teams`}
                  >
                    <AlertTriangle size={15} aria-hidden="true" />
                  </span>
                )}
              </h3>
              <span className="baseball-field-meta">
                {fieldTeams.length} Teams · {matches.length} Spiele
              </span>
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
          </section>
        );
      })}
    </div>
  );
};

export default BaseballFields;
