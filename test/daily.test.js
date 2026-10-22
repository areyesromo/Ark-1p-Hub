import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeFor, POOL, variantFor } from '../server/daily.js';
import { getGame } from '../server/games/index.js';
import { Stats } from '../server/stats.js';
import { Room } from '../server/rooms.js';
import { fakeCtx } from './helpers.js';
import { seeded } from '../server/rng.js';

const io = { to: () => ({ emit() {} }) };

function room(name = 'Fay', stats = new Stats(null)) {
  const r = new Room('ABCD', io, { stats });
  r.hostSockets.add('tv');
  r.seatPlayer(name, null, { local: true });
  return r;
}

test('every game in the pool exists, takes the room rng, and its settings are real choices', () => {
  for (const p of POOL) {
    const def = getGame(p.game);
    assert.ok(def, p.game);
    for (const [key, value] of Object.entries(p.settings)) assert.ok(def.options && def.options[key].includes(value), `${p.game} ${key}=${value}`);
  }
});

test('the same day is the same challenge; every game comes round once in a lap', () => {
  assert.deepEqual(challengeFor('2026-10-22'), challengeFor('2026-10-22'));
  assert.notEqual(challengeFor('2026-10-22').seed, challengeFor('2026-10-23').seed);
  // A lap starts on a day number that's a multiple of the pool's size.
  const start = POOL.length * 1500;
  const games = [];
  for (let d = start; d < start + POOL.length; d++) games.push(challengeFor(new Date(d * 86400000).toISOString().slice(0, 10)).game);
  assert.deepEqual(games.slice().sort(), POOL.map((p) => p.game).sort());
});

test('the same seed deals the same game (a puzzle from the pool)', () => {
  const c = challengeFor('2026-10-22');
  for (const id of ['sudoku', 'gems', 'nonogram', 'trivia', 'blocks']) {
    const def = getGame(id);
    const deal = () => {
      const ctx = fakeCtx('Ana', POOL.find((p) => p.game === id).settings);
      ctx.rng = seeded(c.seed);
      ctx.challenge = true;
      const g = (def.base || def).create(ctx);
      g.start();
      return g;
    };
    const a = deal();
    const b = deal();
    assert.deepEqual(a.hostView(), b.hostView(), id);
  }
});

test('the room plays today\'s game once, with its settings, on the day\'s own table', () => {
  const stats = new Stats(null);
  const r = room('Fay', stats);
  const today = r.dailyInfo();
  assert.equal(today.done, false);
  assert.ok(getGame(today.game));
  const res = r.startGame('daily');
  assert.deepEqual(res, { ok: true, gameId: today.game });
  assert.ok(r.challenge);
  const v = r.decorate(r.game.hostView(), r.game.hostView());
  assert.equal(v.hubSetup, undefined, 'no setup screen');
  assert.equal(v.variant, variantFor(today.day));
  assert.deepEqual(v.daily, { day: today.day });
  // It's had its go as soon as it starts.
  assert.equal(r.dailyInfo().done, true);
  assert.match(r.startGame('daily').error, /today's challenge/);
  // A score goes on the day's table, and shows in the lobby.
  r.startGame('daily'); // refused: still the same game running
  r.recordResult({ phase: 'over', score: 1234, variant: 'Medium' });
  assert.equal(stats.runs.at(-1).variant, variantFor(today.day));
  assert.equal(r.dailyInfo().score, 1234);
  assert.equal(stats.historyOf('Fay').dailyChallenges, 1);
  assert.ok(r.result.unlocked.some((a) => a.id === 'daily-1'));
  // The lobby card's best isn't the daily one.
  assert.equal(stats.bestsOf('Fay')[today.game], undefined);
  // Someone else still has their go.
  const other = room('Gus', stats);
  assert.equal(other.dailyInfo().done, false);
  r.dispose();
  other.dispose();
});

test('no playing the daily challenge again from its end screen', () => {
  const r = room();
  r.startGame('daily');
  const game = r.game;
  let starts = 0;
  const start = game.start.bind(game);
  game.start = () => { starts++; start(); };
  r.handleInput({ type: 'rematch' });
  r.handleInput({ type: 'setup' });
  assert.equal(starts, 0);
  // Leaving clears it: the next game is an ordinary one.
  r.startGame('simon');
  assert.equal(r.challenge, null);
  r.dispose();
});
