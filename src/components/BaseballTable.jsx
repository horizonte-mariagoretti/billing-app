import { useBaseballRows } from '../hooks/useBaseballRows';
import { TextCell } from './BaseballCells';
import './DataTable.css';
import './BaseballPlanning.css';

// Points for a win, a draw and a loss, as in the usual football scoring (3 / 1 / 0).
const POINTS = { win: 3, draw: 1 };

export const standingsOf = (teams) => teams
  .map((t) => {
    const wins = Number(t.wins) || 0;
    const draws = Number(t.draws) || 0;
    const losses = Number(t.losses) || 0;
    return { ...t, games: wins + draws + losses, points: wins * POINTS.win + draws * POINTS.draw };
  })
  .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'de'));

/**
 * Baseballturnier Tabelle: standings of the teams from the Teams tab. Enter wins, draws and losses per team;
 * games and points follow, the place is the sort order.
 */
const BaseballTable = ({ year, yearLocked, onError }) => {
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);

  if (!teams.rows) return <div className="baseball-planning-loading">Lade Tabelle…</div>;

  const disabled = !!yearLocked;

  if (teams.rows.length === 0) {
    return <div className="card baseball-planning-loading">Noch keine Teams. Zuerst im Tab Teams anlegen.</div>;
  }

  const rows = standingsOf(teams.rows);

  return (
    <div className="baseball-planning">
      <div className="data-table-container">
        <table className="data-table baseball-table">
          <colgroup>
            <col style={{ width: '64px' }} />
            <col style={{ width: '220px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '100px' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="num">Platz</th>
              <th>Gruppe</th>
              <th className="num">Sp</th>
              <th className="num">S</th>
              <th className="num">U</th>
              <th className="num">N</th>
              <th className="num">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td className="num">{i + 1}</td>
                <td>{t.name}</td>
                <td className="num">{t.games}</td>
                <td>
                  <TextCell type="number" align="right" value={t.wins} disabled={disabled} label={`Siege: ${t.name}`} onSave={(v) => teams.update(t.id, { wins: v })} />
                </td>
                <td>
                  <TextCell type="number" align="right" value={t.draws} disabled={disabled} label={`Unentschieden: ${t.name}`} onSave={(v) => teams.update(t.id, { draws: v })} />
                </td>
                <td>
                  <TextCell type="number" align="right" value={t.losses} disabled={disabled} label={`Niederlagen: ${t.name}`} onSave={(v) => teams.update(t.id, { losses: v })} />
                </td>
                <td className="num dt-strong">{t.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BaseballTable;
