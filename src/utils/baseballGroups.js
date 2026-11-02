// Baseballturnier group phase: teams are split into groups of 4 in their list order
// (group A = first 4 teams, group B = next 4, ...). Each group plays on its own field.

/** Teams per group. The team count must be a multiple of this. */
export const GROUP_SIZE = 4;

/**
 * Split the teams into complete groups of 4, in the given order.
 * @param {Array<object>} teams Teams in their sort order.
 * @returns {{count: number, valid: boolean, groups: Array<{letter: string, teams: Array<object>}>}}
 *   count = number of teams; valid = count > 0 and a multiple of 4;
 *   groups = complete groups only (an incomplete trailing group is left out), lettered A, B, C, ...
 */
export function groupTeams(teams) {
  const list = Array.isArray(teams) ? teams : [];
  const count = list.length;
  const groups = [];
  for (let i = 0; i + GROUP_SIZE <= count; i += GROUP_SIZE) {
    const index = i / GROUP_SIZE;
    groups.push({ letter: String.fromCharCode(65 + index), teams: list.slice(i, i + GROUP_SIZE) });
  }
  return { count, valid: count > 0 && count % GROUP_SIZE === 0, groups };
}

/**
 * Group the teams by their field (`baseball_teams.field_id`), as assigned by the user.
 * @param {Array<{field_id?: string|null}>} teams Teams in their sort order (the order is kept within a field).
 * @param {Array<{id: string, name: string, sort_order: number}>} fields `baseball_fields` rows of the year
 *   (sort_order 1..4 = field number).
 * @returns {{
 *   fields: Array<{number: number, name: string, teams: Array<object>, complete: boolean}>,
 *   unassigned: Array<object>, total: number, totalValid: boolean
 * }} fields = exactly the given fields (by sort_order), complete = exactly 4 teams; unassigned = teams without
 *   field_id or with a field_id not in `fields`; totalValid = total > 0 and a multiple of 4.
 */
export function groupByField(teams, fields) {
  const list = Array.isArray(teams) ? teams : [];
  const fieldList = (Array.isArray(fields) ? fields : [])
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  const byId = new Map(fieldList.map((f) => [f.id, []]));
  const unassigned = [];
  for (const team of list) {
    const bucket = team?.field_id != null ? byId.get(team.field_id) : undefined;
    if (bucket) bucket.push(team);
    else unassigned.push(team);
  }
  const total = list.length;
  return {
    fields: fieldList.map((f) => {
      const fieldTeams = byId.get(f.id);
      return { number: Number(f.sort_order) || 0, name: f.name, teams: fieldTeams, complete: fieldTeams.length === GROUP_SIZE };
    }),
    unassigned,
    total,
    totalValid: total > 0 && total % GROUP_SIZE === 0,
  };
}

/**
 * Round robin of exactly 4 teams (circle method: the first team stays, the other three rotate).
 * Every pair plays once; 3 rounds of 2 matches = 6 matches in play order:
 * a-d, b-c, a-c, d-b, a-b, c-d. Only groups of 4 are supported.
 * @param {Array<any>} four Exactly 4 teams [a, b, c, d].
 * @returns {Array<[any, any]>} The 6 matches as [home, away] pairs; [] if not exactly 4 teams.
 */
export function roundRobin(four) {
  if (!Array.isArray(four) || four.length !== GROUP_SIZE) return [];
  const [a, b, c, d] = four;
  return [
    [a, d], [b, c],
    [a, c], [d, b],
    [a, b], [c, d],
  ];
}
