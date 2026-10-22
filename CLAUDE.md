# Ark 1P Hub

Solo arcade games for the living room: the TV shows the game, the player's phone (or a gamepad, or the
TV's keyboard) is the controller, and every run is scored against your best and the hub's high scores.
The one-player sibling of Ark 2P Hub, built the same way. Node 20+ ES modules, Express + Socket.IO on the
server, plain browser JS on the client (no build step, no framework, no bundler). Runs in one Docker
container, built for amd64 and arm64 (Raspberry Pi), so keep things light on the TV side.

## Commands

- `npm run dev`: server with `--watch` on http://localhost:3000 (TV at `/host/`, phones at `/play/`, admin at `/admin/`, scores at `/stats/`)
- `npm test`: every `test/*.test.js` (node:test, no extra runner)
- `node --test test/snake.test.js`: one game's tests

## Layout

- `server/games/<id>.js`: one game. Exports `{ id, name, tagline, category, music?, score: { better, unit }, create(ctx) }`;
  the instance has `start()`, `onInput(input)`, `hostView()`, `playerView()`. The contract is
  documented at the top of `server/games/index.js`.
- `server/games/index.js`: the `GAMES` registry. Setup screens are added here with `withSetup(game, spec)`
  (see `server/games/options.js`); the game reads its choices with `settingOf(ctx, key, fallback)`.
- `server/rooms.js`: one TV, one seat. Records a run when `hostView().phase` turns `'over'`, and adds `best`
  (and `record` on the end screen) to every view. `server/stats.js` keeps the runs and works out bests.
- `public/games/<id>/host.js` (TV) and `player.js` (phone): IIFEs that call `Ark.register('host' | 'player', '<id>', {...})`,
  plus an optional `style.css` and shared helpers, loaded with `Ark.loadCss` / `Ark.loadScript`.
- `public/shared/common.js`: the `Ark` helpers (score formatting, setup screens). `public/host/gamepads.js`: controllers and the keyboard.
- `test/<id>.test.js`: game tests use `fakeCtx()` from `test/helpers.js` (manual clock: `ctx.advance(ms)`), and
  pass a fixed rng (`seeded(n)`) into the game class where randomness matters.

## Conventions

- Server state is the truth; views are plain objects. Don't put what the player shouldn't know yet in a view
  (Minesweeper's mines, Simon's whole sequence) until it's over.
- A run ends with `phase: 'over'` and `score` (a number, or `null` when it doesn't count). Set `variant` when a
  setting changes how hard it is, so those scores get their own bests. The hub draws the end screen (score, best,
  play again): renderers only hide their controls when it's over, and can add a line with `overHtml(view)`.
- Timers only through `ctx.setTimeout` / `ctx.clearTimeout` (they are cleared when the game ends). Keep one
  `this.timer` and clear it on every phase change; `{ type: 'rematch' }` when `phase === 'over'` calls `start()`.
  Real-time games take `{ type: 'pause' }`.
- Validate every `onInput` field (type, phase, integer ranges, `hasOwnProperty` for lookups) and ignore bad input silently.
- Comments are short, plain-English, and explain the rules or the why; match the density of the file you're in.
- Every phone control should work with a gamepad and the keyboard on the TV too (`pad`, `padPoll`, `padHint`).

## Design tokens

The palette, radii and type sizes live as CSS custom properties at the top of `public/shared/common.css`
(`--bg`, `--panel`, `--text`, `--muted`, `--p1`, `--p2`, `--me`, `--good`, `--bad`, `--warn`, `--r-sm` … `--radius`,
`--fs-sm` … `--fs-2xl`). Use them in UI styles. Keep literal colours for game objects whose colour is the thing
itself (a 2048 tile, a Simon pad, a brick row, red/green in Reaction Rush).

## When you change a game

1. Server module + its test (`npm test` must pass; `test/hub.test.js` checks every game is well formed).
2. TV and phone renderers under `public/games/<id>/`.
3. The game's row in the **README.md** games table (and the controls table), in the same player-facing tone.

Commit messages: `Game Name: what changed, in plain words` (for example `Snake: wrap-round walls`).
