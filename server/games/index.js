import snake from './snake.js';
import breaker from './breaker.js';
import blocks from './blocks.js';
import flappy from './flappy.js';
import asteroids from './asteroids.js';
import sudoku, { LEVELS as SUDOKU_LEVELS } from './sudoku.js';
import wordGuess from './word-guess.js';
import solitaire from './solitaire.js';
import invaders from './invaders.js';
import runner from './runner.js';
import slide, { SIZES as SLIDE_SIZES } from './slide.js';
import gems from './gems.js';
import nonogram from './nonogram.js';
import trivia from './trivia.js';
import { CATEGORIES as TRIVIA_CATEGORIES } from './trivia-questions.js';
import maths from './maths.js';
import colours from './colours.js';
import game2048 from './2048.js';
import minesweeper, { SIZES as MINE_SIZES } from './minesweeper.js';
import simon from './simon.js';
import reaction from './reaction.js';
import { withSetup } from './options.js';

/**
 * Every game is a module exporting:
 *
 *   { id, name, tagline, category, music?, score: { better, unit }, create(ctx) }
 *
 * category is 'arcade' (real time, quick reflexes), 'puzzle' (think at your
 * own pace) or 'brain' (memory and reaction). The lobby groups them.
 * score.better is 'higher' or 'lower'; score.unit says how to show a score:
 * 'pts', 'ms' (a reaction time), 'time' (a duration in ms, shown as m:ss.s) or
 * 'tries' (guesses it took).
 *
 * create(ctx) returns an instance with:
 *   start()           begin (or restart) a run
 *   onInput(input)    the player sent { type, ... }
 *   hostView()        plain object rendered by public/games/<id>/host.js
 *   playerView()      plain object rendered by public/games/<id>/player.js
 *
 * ctx gives the game: player ({ name, local }), now(), setTimeout/clearTimeout
 * (auto-cleared when the game ends), update() to push fresh views to the TV
 * and the phone, saved (kept between launches), and rng: pass it on to the
 * game (create: (ctx) => new Game(ctx, ctx.rng)) so the daily challenge can
 * deal everyone the same game; it's undefined otherwise. ctx.challenge is true
 * in the daily challenge.
 *
 * When a run ends, hostView() has phase: 'over' and score (a number, or null
 * when the run doesn't count, like a lost Minesweeper). An optional variant
 * string ('Hard', 'Fast · Wrap') keeps separate bests per difficulty. The
 * room records the run and adds `best` (the player's best so far) to every
 * view and `record` ({ score, best, newBest, rank }) to the end screen.
 *
 * To add a game: write the module, list it below, and add the two renderers
 * under public/games/<id>/.
 */
// Setup screens for the games that have choices (see withSetup in options.js).
// The first value of each list is the default.
const GAMES = [
  withSetup(snake, {
    speed: { title: 'Speed', values: ['normal', 'fast'], label: (s) => (s === 'fast' ? '⚡ Fast' : 'Normal') },
    walls: { title: 'Walls', values: ['solid', 'wrap'], label: (w) => (w === 'wrap' ? '🌀 Wrap round (come out the other side)' : '🧱 Solid') },
  }),
  withSetup(breaker, {
    lives: { title: 'Lives', values: ['normal', 'easy'], label: (l) => (l === 'easy' ? '5 lives (easy, its own scores)' : '3 lives') },
  }),
  blocks,
  flappy,
  asteroids,
  invaders,
  runner,
  game2048,
  withSetup(minesweeper, {
    size: { title: 'Field', values: Object.keys(MINE_SIZES), label: (k) => `${MINE_SIZES[k].name} · ${MINE_SIZES[k].w}×${MINE_SIZES[k].h}, ${MINE_SIZES[k].mines} mines` },
  }),
  withSetup(sudoku, {
    level: { title: 'Difficulty', values: Object.keys(SUDOKU_LEVELS), label: (k) => `${SUDOKU_LEVELS[k].name} · ${SUDOKU_LEVELS[k].clues} numbers given` },
  }),
  withSetup(solitaire, {
    draw: { title: 'Turn from the stock', values: [1, 3], label: (n) => (n === 1 ? 'One card at a time' : 'Three at a time (harder, its own scores)') },
  }),
  withSetup(slide, {
    size: { title: 'Size', values: [4, 3, 5], label: (n) => `${n} × ${n} (${n * n - 1} tiles${n === 3 ? ', a warm-up' : n === 5 ? ', a real test' : ''})` },
  }),
  gems,
  withSetup(nonogram, {
    size: { title: 'Size', values: [10, 5, 15], label: (n) => `${n} × ${n}${n === 5 ? ' (a warm-up)' : n === 15 ? ' (a long one)' : ''}` },
  }),
  withSetup(wordGuess, {
    mode: { title: 'Word', values: ['daily', 'practice'], label: (m) => (m === 'daily' ? '📅 Today\'s word (the same for everyone, once a day)' : '🎲 Practice (a new word every time)') },
  }),
  simon,
  reaction,
  maths,
  colours,
  withSetup(trivia, {
    category: { title: 'Questions', values: ['mix', ...Object.keys(TRIVIA_CATEGORIES)], label: (c) => (c === 'mix' ? '🎲 A mix of everything' : `${TRIVIA_CATEGORIES[c]} (its own scores)`) },
  }),
];

export const CATEGORIES = ['arcade', 'puzzle', 'brain'];
/** Background music moods a game can ask for ('off': silence, e.g. for a reaction test). */
export const MUSIC_MOODS = ['action', 'thinking', 'casual', 'off'];
const DEFAULT_MOOD = { arcade: 'action', puzzle: 'thinking', brain: 'casual' };

const byId = new Map(GAMES.map((g) => [g.id, g]));

export function getGame(id) {
  return byId.get(id) || null;
}

/** What the lobby shows for each game, grouped by category in registry order. */
export function listGames() {
  return CATEGORIES.flatMap((c) => GAMES.filter((g) => g.category === c)).map(({ id, name, tagline, category, music, score }) => ({
    id,
    name,
    tagline,
    category,
    music: music || DEFAULT_MOOD[category],
    score: { better: score.better, unit: score.unit },
  }));
}
