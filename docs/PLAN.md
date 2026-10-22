# Ark 1P Hub: plan

A **solo** arcade hub for the living room, built the same way as
[Ark 2P Hub](https://github.com/areyesromo/Ark-2P-Hub): the TV shows the game and your phone
is the controller (scan a QR code, nothing to install). Instead of beating the person next to
you, you chase your own **best score** and the hub's **leaderboard**.

## What carries over from Ark 2P Hub

- The stack: Node 20+ ES modules, Express + Socket.IO, plain browser JS (no build step),
  one Docker container for amd64 and arm64 (Raspberry Pi).
- Rooms with a 4-letter code and a QR on the TV, phones that rejoin by themselves after a
  sleep or a refresh, the TV that reclaims its room after a server restart.
- Game controllers plugged into the TV play as a "local" seat, so the hub works with no phone.
- The `withSetup` setup screens, the sound effects and live-composed music, the version
  watcher (screens reload after an update), the `/admin/` page (join address, password),
  https on the same port for phones that need the motion sensor.

## What changes for one player

| 2P Hub | 1P Hub |
| --- | --- |
| Two seats, "waiting for two players" | **One seat**: the phone, a controller or the TV's keyboard. A second phone can only take the seat when the first has gone. |
| `onInput(slot, input)`, `playerView(slot)` | `onInput(input)`, `playerView()` |
| Winner, scores, head to head, tournaments | A **score** at the end of each run. Each game says whether higher or lower is better and how to show it (points, ms). |
| Leaderboard of wins | **Personal bests** (shown on the lobby cards and live in-game) and a **top 10 per game** at `/stats/`, plus recent runs. A new best gets a 🎉 on the end screen. |
| Categories: competitive, board, casual | **🕹️ Arcade** (real time), **🧩 Puzzle** (think at your own pace), **🧠 Brain** (memory and reflexes) |
| — | **Keyboard on the TV**: arrows/WASD + Enter/Space act as a controller, so a laptop is a whole console. |

## Game contract

```js
export default {
  id, name, tagline, category, music?,
  score: { better: 'higher' | 'lower', unit: 'pts' | 'ms' | 's' | 'tiles' | ... },
  create(ctx),   // -> { start(), onInput(input), hostView(), playerView() }
};
```

`ctx` gives `player` ({ name, local }), `now()`, `setTimeout` / `clearTimeout` (cleared when the
game ends), `update()`, `saved` and, with `withSetup`, `settings`.

When a run ends, the TV view has `phase: 'over'` and `score` (a number, or `null` for "doesn't
count", e.g. a lost Minesweeper). An optional `variant` string ("Hard", "9×9") keeps separate
bests per difficulty. The room records the run once, and adds `best` (the player's best so far
for this game and variant) to every view and `record` (`{ score, best, newBest, rank }`) to the
end screen.

## First games (this PR)

| Game | Category | Score |
| --- | --- | --- |
| **Snake** | Arcade | Food eaten, higher is better. Speed and wrap-around walls on the setup screen. |
| **Brick Breaker** | Arcade | Bricks smashed across levels, 3 lives. Drag strip on the phone, stick/D-pad on a pad. |
| **2048** | Puzzle | The classic tile score. Swipe on the phone, D-pad or arrows on the TV. |
| **Minesweeper** | Puzzle | Time to clear the field, lower is better (only wins count). Three sizes. |
| **Simon** | Brain | Longest sequence repeated. Four big pads on the phone, A/B/X/Y on a pad. |
| **Reaction Rush** | Brain | Average reaction over 5 rounds in ms, lower is better. A false start costs a penalty. |

## Later

- More games (Blocks, Flappy, Asteroids, Invaders, Runner, Sudoku, Solitaire, Sliding Puzzle, Gem Swap, Word Guess
  with a daily word, Quick Maths and Colour Trap are in): nonograms, trivia, a daily challenge for other games.
- Pi deploy scripts (kiosk, controller pairing) as in Ark 2P Hub's `deploy/pi/` (`update.sh` / `update.ps1` are already here).
- Screenshots in the README.
