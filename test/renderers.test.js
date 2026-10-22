// The TV and phone renderers load and register, and the TV's sounds(prev, view)
// hooks cope with real views from the games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fakeCtx, seeded } from './helpers.js';
import { listGames } from '../server/games/index.js';
import { Snake, TIMING as SNAKE_TIMING } from '../server/games/snake.js';
import { Breaker, TIMING as BREAKER_TIMING } from '../server/games/breaker.js';
import { Game2048 } from '../server/games/2048.js';
import { Blocks, W as BLOCKS_W, H as BLOCKS_H } from '../server/games/blocks.js';
import { Flappy } from '../server/games/flappy.js';
import { Asteroids } from '../server/games/asteroids.js';
import { Sudoku } from '../server/games/sudoku.js';
import { WordGuess } from '../server/games/word-guess.js';
import { Solitaire } from '../server/games/solitaire.js';
import { Minesweeper } from '../server/games/minesweeper.js';
import { Simon } from '../server/games/simon.js';
import { ReactionRush } from '../server/games/reaction.js';

/** Load public/games/<id>/<kind>.js with a stub Ark and return what it registers. */
function renderer(id, kind) {
  let registered = null;
  const Ark = {
    register: (k, gameId, r) => { if (k === kind && gameId === id) registered = r; },
    loadCss: () => {},
    loadScript: () => new Promise(() => {}),
    escapeHtml: String,
    formatScore: String,
    clock: String,
  };
  vm.runInNewContext(fs.readFileSync(`public/games/${id}/${kind}.js`, 'utf8'), { Ark, window: {} });
  assert.ok(registered, `${id} registers a ${kind} renderer`);
  return registered;
}

const SOUNDS = fs.readFileSync('public/host/sound.js', 'utf8');
const known = (name) => new RegExp(`\\n\\s+${name}: function`).test(SOUNDS);

test('every game registers a TV and a phone renderer with mount and update', () => {
  for (const g of listGames()) {
    for (const kind of ['host', 'player']) {
      const r = renderer(g.id, kind);
      assert.equal(typeof r.mount, 'function', `${g.id} ${kind} mount`);
      assert.equal(typeof r.update, 'function', `${g.id} ${kind} update`);
    }
  }
});

/** Feed a game's views through its TV sounds hook, step by step; every name must be a real effect. */
function hear(id, game, ctx, steps) {
  const r = renderer(id, 'host');
  const heard = new Set();
  let prev = game.hostView();
  for (const step of steps) {
    step();
    const v = game.hostView();
    for (const name of r.sounds(prev, v) || []) {
      assert.ok(known(name), `${id}: unknown sound ${name}`);
      heard.add(name);
    }
    prev = v;
  }
  return heard;
}

test('sound hooks name real effects', () => {
  let ctx = fakeCtx();
  const snake = new Snake(ctx, () => 0.99);
  snake.start();
  ctx.advance(SNAKE_TIMING.countdownMs);
  hear('snake', snake, ctx, [() => { snake.food = [snake.body[0][0] + 1, snake.body[0][1]]; ctx.advance(200); }, () => ctx.advance(10000)]);

  ctx = fakeCtx();
  const breaker = new Breaker(ctx);
  breaker.start();
  hear('breaker', breaker, ctx, [() => ctx.advance(BREAKER_TIMING.autoLaunchMs + 100), () => ctx.advance(3000), () => ctx.advance(3000)]);

  ctx = fakeCtx();
  const g2048 = new Game2048(ctx, seeded(2));
  g2048.start();
  hear('2048', g2048, ctx, ['left', 'right', 'up', 'down', 'left'].map((dir) => () => g2048.onInput({ type: 'move', dir })));

  ctx = fakeCtx('Ana', { size: 'easy' });
  const mines = new Minesweeper(ctx, seeded(4));
  mines.start();
  hear('minesweeper', mines, ctx, [() => mines.onInput({ type: 'open', cell: 40 }), () => mines.onInput({ type: 'flag', cell: 0 }), () => mines.onInput({ type: 'open', cell: [...mines.mines][0] })]);

  ctx = fakeCtx();
  const simon = new Simon(ctx, seeded(1));
  simon.start();
  const heard = hear('simon', simon, ctx, Array.from({ length: 40 }, () => () => ctx.advance(100)).concat([() => simon.onInput({ type: 'press', pad: simon.seq[0] })]));
  assert.ok([...heard].some((n) => /^pad\d$/.test(n)), 'Simon plays its pad notes');

  ctx = fakeCtx();
  const blocks = new Blocks(ctx, seeded(3));
  blocks.start();
  const fillBottom = () => { blocks.board.fill('.'); for (let x = 0; x < BLOCKS_W; x++) blocks.board[(BLOCKS_H - 1) * BLOCKS_W + x] = x < 4 ? '.' : 'Z'; };
  const blockSounds = hear('blocks', blocks, ctx, [() => blocks.onInput({ type: 'drop' }), fillBottom, () => { blocks.piece = { kind: 'I', rot: 0, x: 0, y: 0 }; blocks.onInput({ type: 'drop' }); }]);
  assert.ok(blockSounds.has('correct'), 'a cleared row sounds');

  ctx = fakeCtx();
  const flappy = new Flappy(ctx, () => 0.5);
  flappy.start();
  hear('flappy', flappy, ctx, [() => flappy.onInput({ type: 'flap' }), () => ctx.advance(300), () => flappy.onInput({ type: 'flap' }), () => ctx.advance(6000)]);

  ctx = fakeCtx();
  const ast = new Asteroids(ctx, seeded(2));
  ast.start();
  hear('asteroids', ast, ctx, [() => ast.onInput({ type: 'fire' }), () => { ast.rocks[0].x = ast.ship.x; ast.rocks[0].y = ast.ship.y - 8; ast.rocks[0].vx = ast.rocks[0].vy = 0; ast.onInput({ type: 'fire' }); ctx.advance(400); }, () => { ast.ship.safeUntil = 0; ast.rocks[0].x = ast.ship.x; ast.rocks[0].y = ast.ship.y; ctx.advance(100); }]);

  ctx = fakeCtx('Ana', { level: 'easy' });
  const sdk = new Sudoku(ctx, seeded(2));
  sdk.start();
  const free = sdk.grid.indexOf(0);
  hear('sudoku', sdk, ctx, [() => sdk.onInput({ type: 'set', cell: free, n: sdk.solution[free] }), () => sdk.onInput({ type: 'set', cell: free, n: sdk.grid[sdk.grid.findIndex((n, i) => n && i !== free)] })]);

  ctx = fakeCtx('Ana', { mode: 'practice' });
  const wg = new WordGuess(ctx, seeded(2));
  wg.start();
  const typeWord = (w) => () => { for (const letter of w) wg.onInput({ type: 'letter', letter }); wg.onInput({ type: 'enter' }); };
  hear('word-guess', wg, ctx, [() => wg.onInput({ type: 'letter', letter: 'q' }), typeWord('zzzz'), () => { for (let i = 0; i < 5; i++) wg.onInput({ type: 'back' }); }, typeWord(wg.answer === 'crane' ? 'slate' : 'crane'), typeWord(wg.answer)]);

  ctx = fakeCtx('Ana', { draw: 1 });
  const sol = new Solitaire(ctx, seeded(2));
  sol.start();
  hear('solitaire', sol, ctx, [() => sol.onInput({ type: 'draw' }), () => sol.onInput({ type: 'smart', from: 'waste' }), () => sol.onInput({ type: 'smart', from: 't6' }), () => sol.onInput({ type: 'undo' })]);

  ctx = fakeCtx();
  const reaction = new ReactionRush(ctx, () => 0.5);
  reaction.start();
  hear('reaction', reaction, ctx, [() => ctx.advance(1600), () => reaction.onInput({ type: 'tap' }), () => ctx.advance(6000), () => reaction.onInput({ type: 'tap' })]);
});

test("Solitaire's screens use the same rules as the server to say where a card can go", () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync('public/games/solitaire/board.js', 'utf8'), { window });
  const { fits } = window.ArkCards;
  const v = { waste: ['h1'], found: [null, 's1', null, null], tab: [['#', 's10'], ['h9'], [], ['c12', 'd11', 's10'], [], [], []] };
  assert.equal(fits(v, 'waste', undefined, 'f0'), true, 'an ace goes home');
  assert.equal(fits(v, 't1', 0, 't0'), true, 'red 9 on black 10');
  assert.equal(fits(v, 't0', 1, 't1'), false);
  assert.equal(fits(v, 't3', 0, 't2'), false, 'only a king into an empty column');
  assert.equal(fits(v, 't3', 1, 'f0'), false, 'a run never goes home');
  assert.equal(fits(v, 't1', 0, 'stock'), false);
});
