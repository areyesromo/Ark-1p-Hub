import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, seeded } from './helpers.js';
import { Cave, FIELD, COPTER, CAVE, PHYS, TIMING } from '../server/games/cave.js';

function game(seed = 2) {
  const ctx = fakeCtx();
  const g = new Cave(ctx, seeded(seed));
  g.start();
  return { ctx, g };
}

/** The cave's middle a little ahead of the copter, where it's heading. */
function middle(g, ahead = 6) {
  const x = COPTER.x + ahead;
  const col = g.cols.find((c) => c.x <= x && c.x + CAVE.col > x);
  return (col.top + col.bottom) / 2;
}

test('waits for the first hold, then falls into the floor without one', () => {
  const { ctx, g } = game();
  ctx.advance(2000);
  assert.equal(g.phase, 'ready');
  assert.equal(ctx.pendingTimers(), 0);
  g.onInput({ type: 'hold', on: true });
  g.onInput({ type: 'hold', on: false });
  assert.equal(g.phase, 'play');
  ctx.advance(5000);
  assert.equal(g.phase, 'over');
  assert.equal(g.crashed, true);
  assert.ok(g.copter.y > FIELD.h / 2);
  assert.equal(ctx.pendingTimers(), 0);
});

test('holding all the way flies into the ceiling', () => {
  const { ctx, g } = game();
  g.onInput({ type: 'hold', on: true });
  ctx.advance(5000);
  assert.equal(g.phase, 'over');
  assert.ok(g.copter.y < FIELD.h / 2);
});

test('following the middle of the cave goes a long way; the cave narrows and rocks appear', () => {
  const { ctx, g } = game();
  g.onInput({ type: 'hold', on: true });
  for (let t = 0; t < 30000 && g.phase === 'play'; t += TIMING.tickMs) {
    g.rocks = []; // this one is about the walls
    ctx.advance(TIMING.tickMs);
    // Climb when it would still stop below the middle (counting the distance it takes to stop).
    const { y, vy } = g.copter;
    const want = y + (vy * Math.abs(vy)) / (2 * (vy < 0 ? PHYS.gravity : -PHYS.lift)) > middle(g);
    if (want !== g.holding) g.onInput({ type: 'hold', on: want });
  }
  assert.equal(g.phase, 'play', `crashed at ${g.metres} m`);
  assert.ok(g.hostView().score > 200, `${g.metres} m`);
  assert.ok(g.gap < CAVE.gap, 'narrower');
  assert.ok(g.nextRock > 120, 'rocks were dug');
});

test('a rock in the way ends the run', () => {
  const { ctx, g } = game();
  g.onInput({ type: 'hold', on: true });
  g.rocks = [{ x: COPTER.x - 1, y0: 0, y1: FIELD.h }];
  ctx.advance(TIMING.tickMs * 2);
  assert.equal(g.phase, 'over');
  g.onInput({ type: 'rematch' });
  assert.equal(g.phase, 'ready');
  assert.equal(g.hostView().score, 0);
});

test('pause stops the clock and carries on level; bad input is ignored', () => {
  const { ctx, g } = game();
  g.onInput({ type: 'hold', on: true });
  ctx.advance(200);
  g.onInput({ type: 'pause' });
  const y = g.copter.y;
  ctx.advance(3000);
  assert.equal(g.phase, 'paused');
  assert.equal(g.copter.y, y);
  assert.equal(ctx.pendingTimers(), 0);
  g.onInput({ type: 'pause' });
  assert.equal(g.phase, 'play');
  assert.equal(g.copter.vy, 0);
  for (const input of [{ type: 'hold', on: 'yes' }, { type: 'hold' }, { type: 'zap' }, { type: 'rematch' }]) g.onInput(input);
  assert.equal(g.holding, true);
  assert.equal(g.phase, 'play');
});
