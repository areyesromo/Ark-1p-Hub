// Makes Dog Park's levels (server/games/dogpark-levels.js): the boards are made by the
// generator from fixed seeds, a few tries each, and every size's levels are put in order
// from easiest to hardest, so the ladder climbs smoothly. Run: node tools/dogpark-levels.mjs
import fs from 'node:fs';
import { makeBoard, difficulty } from '../server/games/dogpark-gen.js';
import { seeded } from '../server/rng.js';

// [size, trees, pond] for each level, a group of levels per size.
const PLAN = [
  [5], [5], [5],
  [6], [6], [6], [6, 2],
  [7], [7], [7, 3], [7], [7, 0, [2, 1]],
  [8], [8, 0, [2, 2]], [8], [8, 4], [8, 2, [2, 1]],
  [9], [9, 0, [2, 2]], [9], [9, 5], [9, 3, [3, 1]],
  [10], [10, 0, [2, 3]], [10], [10, 6],
  [11], [11, 0, [3, 2]], [11, 4], [11, 3, [2, 2]],
  // Expert: open once level 30 is done.
  [12], [12, 0, [2, 3]], [12, 5], [13], [13, 6], [13, 0, [3, 3]],
];
const TRIES = 4;
const LETTERS = 'abcdefghijklm';

const boards = PLAN.map(([n, trees = 0, pond = null], i) => {
  // A few tries each: the early levels keep the gentlest, the later ones the toughest.
  let pick = null;
  for (let t = 0; t < TRIES; t++) {
    const b = makeBoard(n, seeded(1000 * (i + 1) + t), { trees, pond });
    const d = difficulty(n, b.regions);
    if (!pick || (i < 12 ? d < pick.d : d > pick.d)) pick = { ...b, d };
  }
  process.stdout.write(`level ${i + 1}: ${n}×${n} steps ${pick.d}\n`);
  return pick;
});
// Within a size, easiest first.
const sorted = [];
for (let i = 0; i < boards.length; ) {
  let j = i;
  while (j < boards.length && boards[j].n === boards[i].n && (i < 30) === (j < 30)) j++;
  sorted.push(...[...Array(j - i).keys()].map((k) => i + k).sort((a, b) => boards[a].d - boards[b].d));
  i = j;
}
const text = sorted.map((k) => {
  const { n, regions } = boards[k];
  const rows = [];
  for (let y = 0; y < n; y++) rows.push(regions.slice(y * n, y * n + n).map((a) => (a === -1 ? '#' : a === -2 ? '~' : LETTERS[a])).join(''));
  return `  [\n${rows.map((r) => `    '${r}',`).join('\n')}\n  ],`;
});
fs.writeFileSync(new URL('../server/games/dogpark-levels.js', import.meta.url), `// Dog Park's levels, made by tools/dogpark-levels.mjs (don't edit by hand: run it again).
// One row of text per row of the park: a letter for each area, # a tree, ~ water.
// Levels 31 on are the Expert pack. test/dogpark.test.js checks each has exactly one answer.
export const LEVELS = [
${text.join('\n')}
];
`);
