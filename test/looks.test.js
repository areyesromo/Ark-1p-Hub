import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx } from './helpers.js';
import { LOOKS, lookOf } from '../server/games/looks.js';
import { getAchievement } from '../server/achievements.js';
import { getGame } from '../server/games/index.js';
import { lockedFor } from '../server/games/options.js';

test('every look but the first is opened by one of its own game\'s achievements', () => {
  for (const [game, list] of Object.entries(LOOKS)) {
    const [first, ...rest] = Object.values(list);
    assert.equal(first.unlock, undefined, game);
    for (const look of rest) assert.equal(getAchievement(look.unlock).game, game, `${game} ${look.name}`);
  }
});

test('a new player sees the looks locked with how to open them; an earned one can be picked', () => {
  for (const game of Object.keys(LOOKS)) {
    const def = getGame(game);
    const ctx = fakeCtx();
    ctx.achievements = () => ({});
    assert.equal(Object.keys(lockedFor(ctx, def.spec).look).length, Object.keys(LOOKS[game]).length - 1, game);
    const [, second] = Object.keys(LOOKS[game]);
    ctx.achievements = () => ({ [LOOKS[game][second].unlock]: 1 });
    const setup = def.create(ctx);
    setup.start();
    setup.onInput({ type: 'setting', key: 'look', value: second });
    setup.onInput({ type: 'go' });
    assert.equal(setup.hostView().look, second, game);
  }
});

test('a look doesn\'t change the scores\' table', () => {
  const variant = (look) => {
    const ctx = fakeCtx('Ana', { look, speed: 'fast', walls: 'wrap' });
    const def = getGame('snake').base;
    const g = def.create(ctx);
    g.start();
    return g.hostView().variant;
  };
  assert.equal(variant('gold'), variant('classic'));
  assert.equal(lookOf(fakeCtx('Ana', { look: 'toString' }), 'flappy'), 'bird');
});

test('every Memory look has enough different faces for the biggest board', async () => {
  const { FACE_SETS } = await import('../server/games/memory.js');
  assert.deepEqual(Object.keys(FACE_SETS), Object.keys(LOOKS.memory));
  for (const [look, faces] of Object.entries(FACE_SETS)) assert.ok(new Set(faces).size >= 18, look);
});
