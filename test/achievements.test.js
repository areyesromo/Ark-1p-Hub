import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, newlyEarned, longestStreak, getAchievement } from '../server/achievements.js';
import { Stats } from '../server/stats.js';
import { Room } from '../server/rooms.js';
import { listGames } from '../server/games/index.js';

const DAY = 86400000;
const ids = (list) => list.map((a) => a.id).sort();
const history = (over = {}) => ({ runs: 1, games: 1, bests: 1, topSpots: 0, streak: 1, dailyWords: 0, dailyChallenges: 0, gamesInHub: 36, ...over });

test('every achievement has an id, an icon, words, a known game and a check', () => {
  const games = new Set(listGames().map((g) => g.id));
  const seen = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(!seen.has(a.id), a.id);
    seen.add(a.id);
    assert.ok(a.icon && a.name && a.desc, a.id);
    assert.equal(typeof a.check, 'function', a.id);
    if (a.game) assert.ok(games.has(a.game), `${a.id}: ${a.game}`);
  }
  // Every game has something to aim for.
  for (const g of games) assert.ok(ACHIEVEMENTS.some((a) => a.game === g), `${g} has achievements`);
});

test('a run earns its own game\'s achievements, not another game\'s, and only once', () => {
  const run = { game: 'snake', score: 26, variant: 'Normal' };
  const got = newlyEarned(run, {}, history(), {});
  assert.deepEqual(ids(got), ['first-run', 'snake-10', 'snake-25']);
  const again = newlyEarned(run, {}, history(), Object.fromEntries(got.map((a) => [a.id, 1])));
  assert.deepEqual(again, []);
});

test('checks read the game\'s last view, and a missing field just means "not yet"', () => {
  const have = { 'first-run': 1 };
  assert.deepEqual(ids(newlyEarned({ game: 'blocks', score: 900, variant: '' }, { bestClear: 4, lines: 12 }, history(), have)), ['blocks-four']);
  assert.deepEqual(newlyEarned({ game: 'reaction', score: 400, variant: '' }, {}, history(), have), []);
  assert.deepEqual(ids(newlyEarned({ game: 'minesweeper', score: 50000, variant: 'Easy' }, {}, history(), have)), ['mines-easy', 'mines-easy-60']);
  assert.deepEqual(newlyEarned({ game: 'minesweeper', score: null, variant: 'Hard' }, {}, history(), have), [], 'a lost field earns nothing');
});

test('hub-wide goals come from the player\'s history', () => {
  const have = { 'first-run': 1 };
  const got = newlyEarned({ game: 'simon', score: 3 }, {}, history({ runs: 30, games: 36, bests: 10, topSpots: 1, streak: 7, dailyChallenges: 7 }), have);
  assert.deepEqual(ids(got), ['bests-10', 'daily-1', 'daily-7', 'explorer', 'runs-25', 'streak-3', 'streak-7', 'taster', 'top-spot']);
});

test('the longest streak of days', () => {
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak([0, 1000, DAY, 3 * DAY, 4 * DAY, 5 * DAY]), 3);
});

test('stats keep achievements, work out a player\'s history, and reset clears them', () => {
  const s = new Stats(null);
  const run = (player, score, at, extra = {}) => s.runs.push({ at, game: 'snake', gameName: 'Snake', player, score, variant: '', better: 'higher', unit: 'pts', ...extra });
  run('Ana', 5, 0);
  run('Ana', 9, DAY);
  run('Ana', 7, 2 * DAY);
  run('Ben', 12, 2 * DAY);
  run('Ana', 3, 2 * DAY, { game: 'word-guess', variant: 'Daily', better: 'lower' });
  const h = s.historyOf('ana');
  assert.equal(h.runs, 4);
  assert.equal(h.games, 2);
  assert.equal(h.bests, 3); // 5, then 9, then the word
  assert.equal(h.streak, 3);
  assert.equal(h.dailyWords, 1);
  assert.equal(h.topSpots, 1); // Ben has the snake record; Ana's word is the only one
  s.unlock('Ana', ['first-run']);
  s.unlock('ANA', ['first-run', 'snake-10']);
  assert.deepEqual(Object.keys(s.achievementsOf('ana')).sort(), ['first-run', 'snake-10']);
  assert.equal(s.leaderboard().players.find((p) => p.name === 'Ana') && 1, 1);
  s.reset();
  assert.deepEqual(s.achievementsOf('Ana'), {});
});

test('the room unlocks achievements when a run ends and shows them on the end screen and in the lobby', () => {
  const io = { to: () => ({ emit() {} }) };
  const stats = new Stats(null);
  const room = new Room('ABCD', io, { stats });
  room.hostSockets.add('tv');
  room.seatPlayer('Fay', null, { local: true });
  room.startGame('simon');
  room.recordResult({ phase: 'over', score: 11 });
  // The first run on an empty hub is also the best on it.
  assert.deepEqual(room.result.unlocked.map((a) => a.id).sort(), ['first-run', 'simon-10', 'top-spot']);
  assert.equal(room.result.unlocked[0].desc.length > 0, true);
  assert.equal(typeof room.result.unlocked[0].check, 'undefined', 'the check stays on the server');
  // The same run again: nothing new.
  room.startGame('simon');
  room.recordResult({ phase: 'over', score: 11 });
  assert.deepEqual(room.result.unlocked, []);
  const state = room.publicState();
  assert.deepEqual(state.achievements, { got: 3, total: ACHIEVEMENTS.length });
  assert.deepEqual(state.games.find((g) => g.id === 'simon').achievements, { got: 1, total: 2 });
  assert.ok(getAchievement('simon-10'));
  room.dispose();
});
