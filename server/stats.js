import fs from 'node:fs';
import path from 'node:path';

export const MAX_RUNS = 5000; // oldest are dropped beyond this
const RECENT = 30;
const TOP = 10;

/** Players are matched by name, ignoring case and surrounding spaces. */
export const nameKey = (name) => String(name || '').trim().toLowerCase();

/** True when score a beats score b ('higher' or 'lower' is better). */
export const beats = (a, b, better) => (better === 'lower' ? a < b : a > b);

const sameBoard = (r, game, variant) => r.game === game && (r.variant || '') === (variant || '');

/**
 * Every finished run and the bests built from it, kept in stats.json in the
 * data folder (a Docker volume, so it survives updates).
 *
 * A run:
 *   { at, game, gameName, player, score, variant, better: 'higher' | 'lower', unit }
 *
 * variant splits the bests of one game (a difficulty, a board size): a 9×9
 * Minesweeper time doesn't compete with a 16×16 one.
 *
 * dailies remembers each player's go at a daily puzzle (Word Guess's word of
 * the day), so it can be played once a day: 'game|YYYY-MM-DD|name' -> what the game saved.
 */
export class Stats {
  constructor(dataDir) {
    this.file = dataDir ? path.join(dataDir, 'stats.json') : null;
    const data = this.load();
    this.runs = Array.isArray(data.runs) ? data.runs : [];
    this.dailies = data.dailies && typeof data.dailies === 'object' ? data.dailies : {};
    this.version = 0; // goes up on every change, so callers can cache what they looked up
  }

  load() {
    if (!this.file) return {};
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ runs: this.runs, dailies: this.dailies }));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Could not save the score history:', err.message);
    }
  }

  /**
   * Add a run. Returns how it went: the player's best before it, whether it
   * beat that, and where it ranks among every run of that game and variant
   * (1 = the best on this hub).
   */
  record(run) {
    const entry = { at: Date.now(), ...run, variant: run.variant || '' };
    const best = this.bestFor(entry.game, entry.variant, entry.player, entry.better);
    const rank = 1 + this.runs.filter((r) => sameBoard(r, entry.game, entry.variant) && beats(r.score, entry.score, entry.better)).length;
    this.runs.push(entry);
    this.version++;
    if (this.runs.length > MAX_RUNS) this.runs.splice(0, this.runs.length - MAX_RUNS);
    this.save();
    return { score: entry.score, best, newBest: best === null || beats(entry.score, best, entry.better), rank };
  }

  reset() {
    this.runs = [];
    this.dailies = {};
    this.version++;
    this.save();
  }

  /** A player's go at a game's daily puzzle (day: 'YYYY-MM-DD'), or null. */
  getDaily(game, day, name) {
    return this.dailies[`${game}|${day}|${nameKey(name)}`] || null;
  }

  setDaily(game, day, name, data) {
    this.dailies[`${game}|${day}|${nameKey(name)}`] = data;
    // Only the last few weeks matter: drop older days so the file doesn't grow forever.
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    for (const key of Object.keys(this.dailies)) if (key.split('|')[1] < cutoff) delete this.dailies[key];
    this.save();
  }

  /** A player's best score in a game and variant, or null. */
  bestFor(game, variant, name, better = 'higher') {
    const key = nameKey(name);
    let best = null;
    for (const r of this.runs) {
      if (sameBoard(r, game, variant) && nameKey(r.player) === key && (best === null || beats(r.score, best, better))) best = r.score;
    }
    return best;
  }

  /**
   * A player's best in each game, for the lobby cards: gameId -> { score, variant, unit, better },
   * in the variant they played last.
   */
  bestsOf(name) {
    const key = nameKey(name);
    const lastVariant = {};
    for (const r of this.runs) if (nameKey(r.player) === key) lastVariant[r.game] = r.variant || '';
    const out = {};
    for (const [game, variant] of Object.entries(lastVariant)) {
      const r = this.runs.find((x) => x.game === game);
      out[game] = { score: this.bestFor(game, variant, name, r.better), variant, unit: r.unit, better: r.better };
    }
    return out;
  }

  /** gameId -> when it was last finished. */
  lastPlayed() {
    const out = {};
    for (const r of this.runs) out[r.game] = Math.max(out[r.game] || 0, r.at || 0);
    return out;
  }

  /** Names seen in the history, most recent first (for controller players to pick from). */
  knownNames(limit = 12) {
    const seen = new Map();
    for (let i = this.runs.length - 1; i >= 0 && seen.size < limit; i--) {
      const k = nameKey(this.runs[i].player);
      if (k && !seen.has(k)) seen.set(k, this.runs[i].player);
    }
    return [...seen.values()];
  }

  /**
   * For /stats/: each game and variant's top 10 (one row per player, their best),
   * the most active players and the latest runs.
   */
  leaderboard() {
    const boards = new Map();
    const players = new Map();
    for (const r of this.runs) {
      const id = r.game + '\u0000' + (r.variant || '');
      if (!boards.has(id)) boards.set(id, { game: r.game, gameName: r.gameName, variant: r.variant || '', better: r.better, unit: r.unit, runs: 0, bests: new Map() });
      const b = boards.get(id);
      b.runs++;
      const k = nameKey(r.player);
      const cur = b.bests.get(k);
      if (!cur || beats(r.score, cur.score, r.better)) b.bests.set(k, { name: r.player, score: r.score, at: r.at });
      if (!players.has(k)) players.set(k, { name: r.player, runs: 0, games: new Set(), last: 0 });
      const p = players.get(k);
      p.runs++;
      p.games.add(r.game);
      p.last = Math.max(p.last, r.at || 0);
    }
    const games = [...boards.values()]
      .map(({ bests, ...b }) => ({
        ...b,
        top: [...bests.values()].sort((x, y) => (beats(x.score, y.score, b.better) ? -1 : beats(y.score, x.score, b.better) ? 1 : x.at - y.at)).slice(0, TOP),
      }))
      .sort((x, y) => y.runs - x.runs);
    return {
      total: this.runs.length,
      games,
      players: [...players.values()].map((p) => ({ name: p.name, runs: p.runs, games: p.games.size, last: p.last })).sort((a, b) => b.runs - a.runs),
      recent: this.runs.slice(-RECENT).reverse(),
    };
  }
}
