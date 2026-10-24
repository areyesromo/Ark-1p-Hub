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
import memory, { SIZES as MEMORY_SIZES } from './memory.js';
import stack from './stack.js';
import sokoban from './sokoban.js';
import bubbles from './bubbles.js';
import hopper from './hopper.js';
import kenken, { SIZES as KENKEN_SIZES } from './kenken.js';
import numbers from './numbers.js';
import oddone from './oddone.js';
import hangman from './hangman.js';
import lines from './lines.js';
import flood, { SIZES as FLOOD_SIZES } from './flood.js';
import mastermind, { LEVELS as MASTER_LEVELS } from './mastermind.js';
import { LEVELS as SOKOBAN_LEVELS } from './sokoban-levels.js';
import cave, { MAPS as CAVE_MAPS, VEHICLES as CAVE_VEHICLES } from './cave.js';
import lights, { LEVELS as LIGHTS_LEVELS } from './lights.js';
import wordsearch, { SIZES as WORDSEARCH_SIZES } from './wordsearch.js';
import anagram from './anagram.js';
import mahjong from './mahjong.js';
import freecell from './freecell.js';
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
import { LOOKS } from './looks.js';
import { getAchievement } from '../achievements.js';

/**
 * Every game is a module exporting:
 *
 *   { id, name, tagline, category, music?, score: { better, unit }, create(ctx) }
 *
 * category is 'arcade' (real time, quick reflexes), 'puzzle' (think at your
 * own pace) or 'brain' (memory and reaction). The lobby groups them.
 * score.better is 'higher' or 'lower'; score.unit says how to show a score:
 * 'pts', 'ms' (a reaction time), 'time' (a duration in ms, shown as m:ss.s),
 * 'tries' (guesses it took), 'moves' or 'm' (metres).
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
 * in the daily challenge, ctx.achievements() lists the player's achievements and
 * ctx.best(variant) is their best in this game for that variant (or null).
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
/**
 * A lock for choices opened by an achievement (the choice's `unlock` id): null once the
 * player has it, else how to get it, e.g. "Fly 100 m to unlock".
 */
const byAchievement = (list) => (k, have) => {
  const id = list[k].unlock;
  if (!id || have[id]) return null;
  const a = getAchievement(id);
  const how = a.desc.replace(/^[^:]*: /, '').replace(/\.$/, '');
  return how.charAt(0).toUpperCase() + how.slice(1) + ' to unlock';
};

/** A setup row for a game's unlockable looks (see looks.js). */
const lookRow = (game, title) => ({ look: { title, values: Object.keys(LOOKS[game]), label: (k) => LOOKS[game][k].name, lock: byAchievement(LOOKS[game]) } });

// Setup screens for the games that have choices (see withSetup in options.js).
// The first value of each list is the default.
const GAMES = [
  withSetup(snake, {
    speed: { title: 'Speed', values: ['normal', 'fast'], label: (s) => (s === 'fast' ? '⚡ Fast' : 'Normal') },
    walls: { title: 'Walls', values: ['solid', 'wrap'], label: (w) => (w === 'wrap' ? '🌀 Wrap round (come out the other side)' : '🧱 Solid') },
    ...lookRow('snake', 'Snake'),
  }),
  withSetup(breaker, {
    lives: { title: 'Lives', values: ['normal', 'easy'], label: (l) => (l === 'easy' ? '5 lives (easy, its own scores)' : '3 lives') },
    ...lookRow('breaker', 'Ball and paddle'),
  }),
  withSetup(blocks, lookRow('blocks', 'Pieces')),
  withSetup(flappy, lookRow('flappy', 'Fly as')),
  withSetup(asteroids, lookRow('asteroids', 'Ship')),
  withSetup(invaders, lookRow('invaders', 'Invaders')),
  withSetup(runner, lookRow('runner', 'Run as')),
  withSetup(stack, lookRow('stack', 'Blocks')),
  withSetup(cave, {
    map: { title: 'Map', values: Object.keys(CAVE_MAPS), label: (k) => CAVE_MAPS[k].name, lock: byAchievement(CAVE_MAPS) },
    vehicle: { title: 'Fly a', values: Object.keys(CAVE_VEHICLES), label: (k) => CAVE_VEHICLES[k].name, lock: byAchievement(CAVE_VEHICLES) },
  }),
  bubbles,
  hopper,
  withSetup(game2048, lookRow('2048', 'Tiles')),
  withSetup(minesweeper, {
    size: { title: 'Field', values: Object.keys(MINE_SIZES), label: (k) => `${MINE_SIZES[k].name} · ${MINE_SIZES[k].w}×${MINE_SIZES[k].h}, ${MINE_SIZES[k].mines} mines` },
  }),
  withSetup(sudoku, {
    level: { title: 'Difficulty', values: Object.keys(SUDOKU_LEVELS), label: (k) => `${SUDOKU_LEVELS[k].name} · ${SUDOKU_LEVELS[k].clues} numbers given` },
  }),
  withSetup(solitaire, {
    draw: { title: 'Turn from the stock', values: [1, 3], label: (n) => (n === 1 ? 'One card at a time' : 'Three at a time (harder, its own scores)') },
  }),
  freecell,
  mahjong,
  withSetup(slide, {
    size: { title: 'Size', values: [4, 3, 5], label: (n) => `${n} × ${n} (${n * n - 1} tiles${n === 3 ? ', a warm-up' : n === 5 ? ', a real test' : ''})` },
  }),
  withSetup(gems, lookRow('gems', 'Gems')),
  withSetup(mastermind, {
    level: { title: 'Code', values: Object.keys(MASTER_LEVELS), label: (k) => `${MASTER_LEVELS[k].name} · ${MASTER_LEVELS[k].pegs} pegs, ${MASTER_LEVELS[k].colours} colours` },
  }),
  withSetup(flood, {
    size: { title: 'Board', values: ['medium', 'small', 'large'], label: (k) => `${FLOOD_SIZES[k].name}${k === 'small' ? ' (a quick one)' : k === 'large' ? ' (a long one)' : ''}` },
  }),
  lines,
  withSetup(sokoban, {
    level: {
      title: 'Level',
      values: SOKOBAN_LEVELS.map((_, i) => i + 1),
      label: (n) => `${n} · par ${SOKOBAN_LEVELS[n - 1].par}`,
      // Each level opens once the one before it is solved.
      lock: (n, have, ctx) => (n === 1 || (ctx.best && ctx.best(`Level ${n - 1}`) !== null) ? null : `Solve level ${n - 1} to unlock`),
    },
  }),
  withSetup(kenken, {
    size: { title: 'Size', values: KENKEN_SIZES, label: (n) => `${n} × ${n} (numbers 1 to ${n})${n === 4 ? ', a warm-up' : n === 6 ? ', a real test' : ''}` },
  }),
  withSetup(nonogram, {
    size: { title: 'Size', values: [10, 5, 15], label: (n) => `${n} × ${n}${n === 5 ? ' (a warm-up)' : n === 15 ? ' (a long one)' : ''}` },
  }),
  withSetup(lights, {
    level: { title: 'Puzzle', values: ['medium', 'easy', 'hard'], label: (k) => `${LIGHTS_LEVELS[k].name} · par ${LIGHTS_LEVELS[k].presses}` },
  }),
  withSetup(wordsearch, {
    size: { title: 'Grid', values: ['small', 'medium', 'large'], label: (k) => `${WORDSEARCH_SIZES[k].name} · ${WORDSEARCH_SIZES[k].words} words${k === 'small' ? ', across and down' : k === 'medium' ? ', diagonals too' : ', any way, even backwards'}` },
  }),
  withSetup(wordGuess, {
    mode: { title: 'Word', values: ['daily', 'practice'], label: (m) => (m === 'daily' ? '📅 Today\'s word (the same for everyone, once a day)' : '🎲 Practice (a new word every time)') },
  }),
  simon,
  withSetup(memory, {
    size: { title: 'Cards', values: ['small', 'medium', 'large'], label: (k) => `${MEMORY_SIZES[k].w} × ${MEMORY_SIZES[k].h} (${(MEMORY_SIZES[k].w * MEMORY_SIZES[k].h) / 2} pairs)` },
  }),
  reaction,
  maths,
  colours,
  anagram,
  numbers,
  oddone,
  hangman,
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
