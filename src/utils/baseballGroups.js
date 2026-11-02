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
