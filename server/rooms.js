import { randomBytes, randomInt } from 'node:crypto';
import { getGame, listGames } from './games/index.js';

const NAME_MAX = 16;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
const CODE_LENGTH = 4;
const IDLE_ROOM_MS = 30 * 60 * 1000;

const newToken = () => randomBytes(16).toString('hex');

export function sanitizeName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NAME_MAX);
}

export function normalizeCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

const isValidCode = (code) => code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
const isValidToken = (t) => typeof t === 'string' && /^[0-9a-f]{32}$/.test(t);

/**
 * One TV + one player, on a phone or on a controller (or the keyboard) at the
 * TV. The room owns the running game instance and is the only thing that
 * talks to Socket.IO on the game's behalf: games produce views, the room
 * pushes them out, and records the score when a run ends.
 */
export class Room {
  constructor(code, io, { stats = null, hostToken = null } = {}) {
    this.code = code;
    this.io = io;
    this.stats = stats; // score history (see stats.js), optional
    this.hostToken = hostToken || newToken();
    this.hostSockets = new Set();
    this.player = null; // { name, token, socketId, connected, local }
    this.hostOrigin = null; // the address the TV opened, used to build the join link
    this.joinUrl = null;
    this.joinGuess = false; // true when the join address is probably unreachable (see network.js)
    this.qr = null;
    this.gameId = null;
    this.game = null;
    this.generation = 0;
    this.timers = new Set();
    this.saved = {}; // per game: what it asked to keep between launches (e.g. chosen settings)
    this.result = null; // how the last run went, shown on its end screen
    this.touch();
  }

  get allChannel() { return `r:${this.code}`; }
  get hostChannel() { return `h:${this.code}`; }
  get playerChannel() { return `p:${this.code}`; }

  touch() { this.lastActive = Date.now(); }

  isIdle(now = Date.now()) {
    const anyoneHere = this.hostSockets.size > 0 || (this.player && this.player.connected);
    return !anyoneHere && now - this.lastActive > IDLE_ROOM_MS;
  }

  // ---- the player ----------------------------------------------------------

  /**
   * Take the seat. A matching token re-seats the same player (phone woke up,
   * page refreshed). Otherwise the seat must be free, or its player gone, so
   * a lost phone never locks the room.
   *
   * `local` players use a controller or the keyboard on the TV: they have no
   * socket of their own, the TV sends their input, and they're present while
   * the TV is.
   */
  seatPlayer(rawName, token, { local = false } = {}) {
    const p = this.player;
    if (token && p && p.token === token && Boolean(p.local) === local) {
      const name = sanitizeName(rawName);
      if (name) p.name = name;
      return { player: p, rejoined: true };
    }
    const name = sanitizeName(rawName);
    if (!name) return { error: 'Please enter a name.' };

    if (p && (p.connected || (p.local && local))) {
      // Same name on a phone that looks connected: a reloaded page doesn't always close its
      // connection, so `clash` asks the caller to check (see player:join).
      const same = !p.local && !local && p.name.toLowerCase() === name.toLowerCase();
      return { error: `${p.name} is playing right now. Wait for them to leave the room.`, clash: same || undefined };
    }
    const player = { name, token: newToken(), socketId: null, connected: local && this.hostSockets.size > 0, local };
    this.player = player;
    return { player, rejoined: false };
  }

  /** Controller players come and go with the TV. Call after the host sockets change. */
  syncLocalPlayer() {
    if (this.player && this.player.local) this.player.connected = this.hostSockets.size > 0;
  }

  /** Rename a controller player (phones pick their name when they join). */
  renameLocal(rawName) {
    const p = this.player;
    if (!p || !p.local) return { error: 'Only controller players can be renamed here.' };
    const name = sanitizeName(rawName);
    if (!name) return { error: 'Please enter a name.' };
    p.name = name;
    this.broadcastState();
    return { ok: true, name };
  }

  removePlayer() {
    if (!this.player) return;
    this.player = null;
    if (this.game) this.stopGame();
    else this.broadcastState();
  }

  get readyToPlay() {
    return Boolean(this.player && this.player.connected);
  }

  get playerName() {
    return this.player ? this.player.name : 'Player';
  }

  // ---- games -------------------------------------------------------------

  /** A random game for the "🎲 Random" button: not the one just played. */
  pickRandomGame(rng = Math.random) {
    let pool = listGames();
    if (pool.length > 1) pool = pool.filter((g) => g.id !== this.lastGameId);
    return pool[Math.floor(rng() * pool.length)].id;
  }

  startGame(gameId) {
    if (gameId === 'random') gameId = this.pickRandomGame();
    const def = getGame(gameId);
    if (!def) return { error: 'Unknown game.' };
    if (!this.readyToPlay) return { error: 'Join first: scan the code with your phone, or press a button on a controller.' };

    this.stopGame({ silent: true });
    this.lastPhase = null;
    this.lastGameId = def.id;
    const generation = ++this.generation;
    const room = this;
    const live = () => room.generation === generation;

    const ctx = {
      get player() {
        return { name: room.playerName, local: Boolean(room.player && room.player.local) };
      },
      now: () => Date.now(),
      // Kept by the room between launches of this game, e.g. the settings picked last time.
      saved: (this.saved[def.id] = this.saved[def.id] || {}),
      setTimeout(fn, ms) {
        const t = setTimeout(() => {
          room.timers.delete(t);
          if (live()) fn();
        }, ms);
        room.timers.add(t);
        return t;
      },
      clearTimeout(t) {
        clearTimeout(t);
        room.timers.delete(t);
      },
      update() {
        if (live()) room.pushGameViews();
      },
    };

    this.gameId = def.id;
    this.game = def.create(ctx);
    this.broadcastState();
    this.game.start();
    return { ok: true, gameId: def.id };
  }

  stopGame({ silent = false } = {}) {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.generation++;
    this.game = null;
    this.gameId = null;
    this.result = null;
    if (!silent) this.broadcastState();
  }

  handleInput(input) {
    if (!this.game || !input || typeof input !== 'object') return;
    this.touch();
    try {
      this.game.onInput(input);
    } catch (err) {
      console.error(`[room ${this.code}] game input error:`, err);
    }
  }

  // ---- scores --------------------------------------------------------------

  /** The player's best in the running game (in the variant on screen), or null. */
  bestNow(view) {
    const def = getGame(this.gameId);
    if (!this.stats || !def || !this.player) return null;
    // Views go out up to 30 times a second: look the best up again only when something changed.
    const key = [def.id, view.variant || '', this.player.name, this.stats.version].join('\u0000');
    if (!this.bestCache || this.bestCache.key !== key) {
      this.bestCache = { key, best: this.stats.bestFor(def.id, view.variant || '', this.player.name, def.score.better) };
    }
    return this.bestCache.best;
  }

  /**
   * A run just ended: add it to the history, unless it doesn't count (score null,
   * e.g. a lost Minesweeper) or scored nothing where more is better (that's no best).
   */
  recordResult(view) {
    const def = getGame(this.gameId);
    const score = Number(view.score);
    if (view.score === null || view.score === undefined || !Number.isFinite(score)) {
      this.result = { score: null };
      return;
    }
    if (def.score.better === 'higher' && score <= 0) {
      this.result = { score: null, zero: true };
      return;
    }
    const run = { game: def.id, gameName: def.name, player: this.playerName, score, variant: typeof view.variant === 'string' ? view.variant : '', better: def.score.better, unit: def.score.unit };
    this.result = this.stats ? this.stats.record(run) : { score, best: null, newBest: true, rank: 1 };
  }

  /** What the hub adds to a game's views: the best to beat, and on the end screen how this run went. */
  decorate(view, hostView) {
    const out = { ...view, best: this.bestNow(hostView) };
    if (hostView.phase === 'over' && this.result) out.record = this.result;
    return out;
  }

  // ---- broadcasting ------------------------------------------------------

  publicState() {
    const p = this.player;
    return {
      code: this.code,
      joinUrl: this.joinUrl,
      joinGuess: this.joinGuess,
      phase: this.game ? 'playing' : 'lobby',
      gameId: this.gameId,
      hostConnected: this.hostSockets.size > 0,
      readyToPlay: this.readyToPlay,
      player: p ? { name: p.name, connected: p.connected, local: Boolean(p.local) } : null,
      games: this.lobbyGames(),
      knownNames: this.stats ? this.stats.knownNames() : [],
    };
  }

  broadcastState() {
    this.io.to(this.allChannel).emit('room:state', this.publicState());
  }

  pushGameViews() {
    if (!this.game) return;
    const { gameId } = this;
    const host = this.game.hostView();
    if (host.phase === 'over' && this.lastPhase !== 'over') {
      // Recorded before the best is looked up, so the end screen's best includes this run.
      this.recordResult(host);
      this.broadcastState(); // the lobby cards' bests
    }
    if (host.phase !== 'over') this.result = null;
    this.lastPhase = host.phase;
    this.io.to(this.hostChannel).emit('game:view', { gameId, view: this.decorate(host, host) });
    if (this.player && !this.player.local) {
      this.io.to(this.playerChannel).emit('game:view', { gameId, view: this.decorate(this.game.playerView(), host) });
    }
  }

  /** Games for the lobby: in registry order, with this player's best in each. */
  lobbyGames() {
    const bests = this.stats && this.player ? this.stats.bestsOf(this.player.name) : {};
    const last = this.stats ? this.stats.lastPlayed() : {};
    return listGames().map((g) => ({ ...g, best: bests[g.id] || null, lastPlayed: last[g.id] || null }));
  }

  /** Bring a (re)connecting socket fully up to date. */
  sendSnapshot(socket, role) {
    socket.emit('room:state', this.publicState());
    if (!this.game) return;
    const host = this.game.hostView();
    const view = role === 'host' ? host : this.game.playerView();
    socket.emit('game:view', { gameId: this.gameId, view: this.decorate(view, host) });
  }

  dispose() {
    this.stopGame({ silent: true });
  }
}

export class RoomManager {
  constructor(io, { stats = null } = {}) {
    this.io = io;
    this.stats = stats;
    this.rooms = new Map();
  }

  /**
   * A new room with a random code, or (after a server restart) the code and
   * host token a TV asks for, so phones that knew the old room find it again.
   */
  create({ code: wanted = null, hostToken = null } = {}) {
    let code = normalizeCode(wanted);
    if (!isValidCode(code) || this.rooms.has(code)) {
      do {
        code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      } while (this.rooms.has(code));
      hostToken = null;
    }
    const room = new Room(code, this.io, { stats: this.stats, hostToken: isValidToken(hostToken) ? hostToken : null });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(normalizeCode(code)) || null;
  }

  /** How many rooms are in the middle of a game (an updater can wait for 0). */
  get playing() {
    let n = 0;
    for (const room of this.rooms.values()) if (room.game) n++;
    return n;
  }

  /** Drop rooms nobody has touched in a while. Returns how many were removed. */
  sweep(now = Date.now()) {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.isIdle(now)) {
        room.dispose();
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }
}
