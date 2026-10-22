// Achievements: goals to chase in a one-player hub. Each is checked when a
// run ends, against that run (its score and the game's last TV view) and the
// player's history; once unlocked it stays (kept in stats.json, see Stats).
//
// An achievement:
//   { id, game?, icon, name, desc, check(run, view, history) -> true when earned }
// game ties it to one game (the lobby card shows that game's count); without
// it, it's about playing the hub as a whole.
//
// run: { game, score, variant } (score is null when the run doesn't count).
// history: the player's runs so far, this one included (see Stats#historyOf).

const DAY = 86400000;
const MIN = 60000;
const scored = (run) => run.score !== null && run.score !== undefined;

const game = (id, list) => list.map((a) => ({ ...a, game: id }));

export const ACHIEVEMENTS = [
  // ---- the hub ----
  { id: 'first-run', icon: '👋', name: 'First steps', desc: 'Finish a run of any game.', check: (r, v, h) => h.runs >= 1 },
  { id: 'runs-25', icon: '🎮', name: 'Regular', desc: 'Finish 25 runs.', check: (r, v, h) => h.runs >= 25 },
  { id: 'runs-100', icon: '🕹️', name: 'Arcade rat', desc: 'Finish 100 runs.', check: (r, v, h) => h.runs >= 100 },
  { id: 'taster', icon: '🍱', name: 'Taster', desc: 'Score in 5 different games.', check: (r, v, h) => h.games >= 5 },
  { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Score in every game in the hub.', check: (r, v, h) => h.games >= h.gamesInHub },
  { id: 'bests-10', icon: '📈', name: 'Getting better', desc: 'Set 10 personal bests.', check: (r, v, h) => h.bests >= 10 },
  { id: 'top-spot', icon: '🥇', name: 'Top of the table', desc: 'Hold the best score on this hub in any game.', check: (r, v, h) => h.topSpots >= 1 },
  { id: 'streak-3', icon: '📅', name: 'Three days running', desc: 'Play on 3 days in a row.', check: (r, v, h) => h.streak >= 3 },
  { id: 'streak-7', icon: '🔥', name: 'A whole week', desc: 'Play on 7 days in a row.', check: (r, v, h) => h.streak >= 7 },

  // ---- arcade ----
  ...game('snake', [
    { id: 'snake-10', icon: '🐍', name: 'Snack time', desc: 'Snake: eat 10 in one run.', check: (r) => r.score >= 10 },
    { id: 'snake-25', icon: '🐍', name: 'Long boi', desc: 'Snake: eat 25 in one run.', check: (r) => r.score >= 25 },
    { id: 'snake-50', icon: '🐉', name: 'Dragon', desc: 'Snake: eat 50 in one run.', check: (r) => r.score >= 50 },
  ]),
  ...game('breaker', [
    { id: 'breaker-level2', icon: '🧱', name: 'Wall breaker', desc: 'Brick Breaker: clear a whole wall.', check: (r, v) => v.level >= 2 },
    { id: 'breaker-level4', icon: '🏗️', name: 'Demolition crew', desc: 'Brick Breaker: reach level 4.', check: (r, v) => v.level >= 4 },
    { id: 'breaker-1000', icon: '💯', name: 'Four figures', desc: 'Brick Breaker: score 1,000.', check: (r) => r.score >= 1000 },
  ]),
  ...game('blocks', [
    { id: 'blocks-four', icon: '🟦', name: 'Four at once', desc: 'Blocks: clear 4 rows with one piece.', check: (r, v) => v.bestClear >= 4 },
    { id: 'blocks-40', icon: '📏', name: 'Forty lines', desc: 'Blocks: clear 40 rows in one run.', check: (r, v) => v.lines >= 40 },
    { id: 'blocks-10k', icon: '🏆', name: 'Block master', desc: 'Blocks: score 10,000.', check: (r) => r.score >= 10000 },
  ]),
  ...game('flappy', [
    { id: 'flappy-10', icon: '🐤', name: 'Fledgling', desc: 'Flappy: pass 10 pipes.', check: (r) => r.score >= 10 },
    { id: 'flappy-25', icon: '🕊️', name: 'Taking flight', desc: 'Flappy: pass 25 pipes.', check: (r) => r.score >= 25 },
    { id: 'flappy-50', icon: '🦅', name: 'Eagle', desc: 'Flappy: pass 50 pipes.', check: (r) => r.score >= 50 },
  ]),
  ...game('asteroids', [
    { id: 'asteroids-wave3', icon: '☄️', name: 'Rock breaker', desc: 'Asteroids: reach wave 3.', check: (r, v) => v.wave >= 3 },
    { id: 'asteroids-wave6', icon: '🚀', name: 'Deep space', desc: 'Asteroids: reach wave 6.', check: (r, v) => v.wave >= 6 },
    { id: 'asteroids-10k', icon: '⭐', name: 'Ace pilot', desc: 'Asteroids: score 10,000 (an extra ship!).', check: (r) => r.score >= 10000 },
  ]),

  // ---- puzzle ----
  ...game('2048', [
    { id: '2048-512', icon: '🔢', name: 'Halfway there', desc: '2048: make a 512 tile.', check: (r, v) => v.biggest >= 512 },
    { id: '2048-2048', icon: '🎯', name: '2048!', desc: '2048: make the 2048 tile.', check: (r, v) => v.biggest >= 2048 },
  ]),
  ...game('minesweeper', [
    { id: 'mines-easy', icon: '🚩', name: 'Sweeper', desc: 'Minesweeper: clear an Easy field.', check: (r, v) => scored(r) && r.variant === 'Easy' },
    { id: 'mines-easy-60', icon: '⏱️', name: 'Quick sweep', desc: 'Minesweeper: clear an Easy field in under a minute.', check: (r) => scored(r) && r.variant === 'Easy' && r.score < MIN },
    { id: 'mines-hard', icon: '💣', name: 'Bomb squad', desc: 'Minesweeper: clear a Hard field.', check: (r) => scored(r) && r.variant === 'Hard' },
  ]),
  ...game('sudoku', [
    { id: 'sudoku-easy', icon: '✏️', name: 'Number cruncher', desc: 'Sudoku: solve a puzzle.', check: (r) => scored(r) },
    { id: 'sudoku-hard', icon: '🧩', name: 'Hard nut', desc: 'Sudoku: solve a Hard puzzle.', check: (r) => scored(r) && r.variant === 'Hard' },
    { id: 'sudoku-fast', icon: '⚡', name: 'Speed solver', desc: 'Sudoku: solve a Medium or Hard puzzle in under 10 minutes.', check: (r) => scored(r) && r.variant !== 'Easy' && r.score < 10 * MIN },
  ]),
  ...game('solitaire', [
    { id: 'solitaire-win', icon: '🃏', name: 'Patience', desc: 'Solitaire: finish a game.', check: (r) => scored(r) },
    { id: 'solitaire-draw3', icon: '🂡', name: 'Three card trick', desc: 'Solitaire: finish a Draw 3 game.', check: (r) => scored(r) && r.variant === 'Draw 3' },
    { id: 'solitaire-fast', icon: '🏎️', name: 'Card shark', desc: 'Solitaire: finish a game in under 5 minutes.', check: (r) => scored(r) && r.score < 5 * MIN },
  ]),

  // ---- brain ----
  ...game('word-guess', [
    { id: 'word-first', icon: '🔤', name: 'Wordsmith', desc: 'Word Guess: find a word.', check: (r) => scored(r) },
    { id: 'word-3', icon: '🧠', name: 'Sharp', desc: 'Word Guess: find a word in 3 guesses or fewer.', check: (r) => scored(r) && r.score <= 3 },
    { id: 'word-daily-5', icon: '📆', name: 'Daily habit', desc: 'Word Guess: find today\'s word on 5 different days.', check: (r, v, h) => h.dailyWords >= 5 },
  ]),
  ...game('simon', [
    { id: 'simon-10', icon: '🟢', name: 'Good memory', desc: 'Simon: repeat a sequence of 10.', check: (r) => r.score >= 10 },
    { id: 'simon-20', icon: '🧠', name: 'Elephant', desc: 'Simon: repeat a sequence of 20.', check: (r) => r.score >= 20 },
  ]),
  ...game('reaction', [
    { id: 'reaction-300', icon: '⚡', name: 'Quick', desc: 'Reaction Rush: average under 300 ms.', check: (r) => scored(r) && r.score < 300 },
    { id: 'reaction-250', icon: '⚡', name: 'Lightning', desc: 'Reaction Rush: average under 250 ms.', check: (r) => scored(r) && r.score < 250 },
    { id: 'reaction-clean', icon: '🎯', name: 'Steady hands', desc: 'Reaction Rush: five rounds, no false starts, every one under 350 ms.', check: (r, v) => scored(r) && v.falseStarts === 0 && v.times.length >= 5 && v.times.every((t) => t < 350) },
  ]),
];

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const getAchievement = (id) => byId.get(id) || null;

/** What a screen needs to show an achievement (the check stays on the server). */
export const describe = (a, at = null) => ({ id: a.id, game: a.game || null, icon: a.icon, name: a.name, desc: a.desc, at });

/** The longest run of consecutive days (UTC) in a list of timestamps. */
export function longestStreak(times) {
  const days = [...new Set(times.map((t) => Math.floor(t / DAY)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * The achievements this run earns that the player didn't have. A check that
 * throws (a view missing a field) counts as not earned.
 */
export function newlyEarned(run, view, history, have) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (have[a.id] || (a.game && a.game !== run.game)) continue;
    let ok = false;
    try {
      ok = Boolean(a.check(run, view || {}, history));
    } catch {
      ok = false;
    }
    if (ok) out.push(a);
  }
  return out;
}
