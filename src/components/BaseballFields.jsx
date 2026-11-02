import { AlertTriangle } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import { groupTeams, roundRobin } from '../utils/baseballGroups';
import './BaseballPlanning.css';

/** The tournament always has at least this many fields. */
const MIN_FIELDS = 4;

/**
 * Baseballturnier Felder: group phase only. The teams (in their list order) form groups of 4;
 * group N plays on Feld N (Feld 1 = Gruppe A, Feld 2 = Gruppe B, ...). Always shows at least
 * four stacked field cards (Feld 1–4); a field without a complete group shows an empty state.
 * More than four complete groups (> 16 teams) add Feld 5, 6, ... so no group is lost.
 * A filled card shows its teams as chips and the round-robin schedule (6 matches) as match tiles.
 * A warning above the cards flags a team count that is not a multiple of 4.
 */
const BaseballFields = ({ year, yearLocked, onError }) => {
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);

  if (!teams.rows) return <div className="baseball-planning-loading">Lade Felder…</div>;

  const { count, valid, groups } = groupTeams(teams.rows);
  const fieldCount = Math.max(MIN_FIELDS, groups.length);
  const fields = Array.from({ length: fieldCount }, (_, i) => ({
    number: i + 1,
    letter: String.fromCharCode(65 + i),
    group: groups[i] || null,
  }));

  return (
    <div className="baseball-planning">
      {count > 0 && !valid && (
        <div className="baseball-field-warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Anzahl Teams muss ein Vielfaches von 4 sein (aktuell {count}).</span>
        </div>
      )}

      {fields.map(({ number, letter, group }) => {
        const matches = group ? roundRobin(group.teams) : [];
        return (
          <section key={letter} className="card baseball-field-card" aria-label={`Feld ${number}, Gruppe ${letter}`}>
            <header className="baseball-field-head">
              <h3 className="baseball-field-name">Feld {number}</h3>
              <span className="baseball-field-group">Gruppe {letter}</span>
              <span className="baseball-field-meta">
                {group ? group.teams.length : 0} Teams · {matches.length} Spiele
              </span>
            </header>

            {group ? (
              <>
                <div className="baseball-field-chips" role="list" aria-label={`Teams Gruppe ${letter}`}>
                  {group.teams.map((t) => (
                    <span key={t.id} className="baseball-field-chip" role="listitem">{t.name}</span>
                  ))}
                </div>

                <div className="baseball-matches" role="list" aria-label={`Spielplan Feld ${number}`}>
                  {matches.map(([home, away], n) => (
                    <div
                      key={`${home.id}-${away.id}`}
                      className="baseball-match"
                      role="listitem"
                      aria-label={`Spiel ${n + 1}: ${home.name} gegen ${away.name}`}
                    >
                      <span className="baseball-match-no" aria-hidden="true">{n + 1}</span>
                      <span className="baseball-match-teams" aria-hidden="true">
                        <span className="baseball-match-team">{home.name}</span>
                        <span className="baseball-match-vs">vs</span>
                        <span className="baseball-match-team">{away.name}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="baseball-field-empty">Noch keine Gruppe. Teams im Tab Teams anlegen.</p>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default BaseballFields;
