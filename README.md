# Ark 1P Hub

**Solo arcade games** for your living room. The TV shows the game and your
**phone is the controller**: scan a QR code and play in the browser, nothing to
install. No phone handy? A game controller plugged into the TV, or the TV's
keyboard, works too. Every run is scored, and the hub keeps your **best** and a
**high-score table** for everyone who plays. Self-hosted in a single Docker
container on your home network.

It's the one-player sibling of [Ark 2P Hub](https://github.com/areyesromo/Ark-2P-Hub)
(1v1 party games), built the same way. See [docs/PLAN.md](docs/PLAN.md) for the plan.

## Games

The lobby groups games into **🕹️ Arcade** (real time, quick hands),
**🧩 Puzzle** (think it through, at your own pace) and **🧠 Brain** (memory and
reflexes). Each card shows your best, and **🎲 Random game** at the top picks one
for you (never the one you just played). During a game the top of the TV shows
the best to beat; at the end the hub shows your score, whether it's a
**🎉 New best!** and where it ranks on this hub, then **Play again**, change
the settings, or pick another game.

### 🕹️ Arcade

| Game | How it plays |
| --- | --- |
| **Snake** | The classic: eat the glowing food to grow, don't hit a wall or your own tail. Every 4 bites the snake speeds up. Tap a side of the phone pad or swipe to turn (turns can be chained in one swipe). Before you start, pick the speed (Normal or ⚡ Fast) and the walls (🧱 Solid, or 🌀 Wrap round: come out on the other side). ⏸ Pause on the phone (or Start on a controller). Score: food eaten; each speed and wall setting keeps its own bests. |
| **Brick Breaker** | Keep the ball in play with your paddle and smash the wall. Slide a finger along the phone's strip to move the paddle (or the stick / D-pad). Where the ball hits the paddle sets its angle, and it speeds up a little on every hit. Higher rows score more (1, 3, 5, 7 points). Clear the wall for a new, faster level with a different pattern (and a life back); lose the ball 3 times and it's over. 🚀 Launch on the phone, or it goes by itself after 3 s. Pick 3 lives or 5 (easy, with its own scores). |
| **Blocks** | The falling-block classic: pieces of four squares drop into a 10×20 well. Move and turn them so they fill whole rows, which clear. Every 10 rows the level goes up and pieces fall faster. Clearing several rows at once scores far more (100, 300, 500 or 800 points for 1 to 4 rows, times the level), plus a point a row when you drop a piece yourself. **Hold** puts a piece aside for later (once per piece); the TV shows it, the next three pieces and a shadow where yours will land. On the phone: ◀ ▶ move (hold to repeat), ⟲ ⟳ turn, ▼ soft drop, **⤓ Drop** drops it at once. Pieces come in shuffled sets of seven, so you never wait long for a straight piece. The run ends when a new piece has no room. |
| **Flappy** | Tap the phone's big button to flap; the bird falls the rest of the time. Fly through the gaps between the pipes without touching them or the ground (the top just stops you). The pipes come a little faster and the gaps get a little smaller as you go. The first tap starts the run. Score: pipes passed. |

### 🧩 Puzzle

| Game | How it plays |
| --- | --- |
| **2048** | Swipe on the phone (or tap a side of the pad) to slide every tile on the 4×4 board; two equal tiles that bump into each other merge into their sum, which is added to your score. A new 2 (sometimes a 4) appears after every move. Make a 2048 tile and keep going; the run ends when nothing can move (or tap **End this run** twice). |
| **Minesweeper** | Open every cell that isn't a mine. A number counts the mines in the 8 cells around it. Tap to dig, hold to flag (or switch the phone to 🚩 flag mode); tapping a number whose mines are all flagged opens the rest around it. The first cell you open is always safe. Three fields: Easy 9×9 (10 mines), Medium 16×16 (40), Hard 30×16 (99, shown turned on an upright phone). Score: your time, only when you clear the field; lower is better, and each field has its own bests. |

### 🧠 Brain

| Game | How it plays |
| --- | --- |
| **Simon** | The TV lights the four pads (each with its own note) in a sequence; tap them back in the same order on your phone's four big pads. Every round adds one more and plays a little faster. One wrong pad, or 5 s without a press, and it's over. Score: the longest sequence you repeated. |
| **Reaction Rush** | The screen says **Wait…** (red), then after a random moment **TAP!** (green): hit the phone's big button as fast as you can. Five rounds. Tap before green and it's a false start: that round starts again and 100 ms goes on your time. Score: your average time plus penalties, in ms (lower is better). No music, so you can concentrate. |

## Controllers and the keyboard

The player can use a phone, **or** a game controller connected to the device
showing the TV screen (Xbox, PlayStation or most others, Bluetooth or USB),
**or** that device's keyboard. With no phone seated, press **A** (or **Enter**)
on the TV to play there.

| Where | Controller | Keyboard | Does |
| --- | --- | --- | --- |
| Lobby | **A** / **Start** | **Enter** / **Space** | Take the seat (as "Controller 1" or "Keyboard"), then start the picked game |
| Lobby | **D-pad** / stick | **Arrows** / **WASD** | Pick a game |
| Lobby | **Y** | **E** | Change your name: cycles through the names on the high-score table (so your scores count for you), then ready-made ones (Ace, Blaze, Comet…) |
| Lobby | **B** | **Backspace** | Leave the seat |
| Setup screen | **↑↓** row, **←→** change, **A** start | Arrows, **Enter** | |
| Any game | **Back / Select** | **Esc** | Back to the lobby |
| Game over | **A** play again · **Y** change settings · **B** lobby | **Enter** · **E** · **Backspace** | |
| Snake | **D-pad** / stick (or **Y**↑ **A**↓ **X**← **B**→), **Start** pauses | Arrows, **P** pauses | Turn |
| Brick Breaker | Stick or **D-pad ← →**, **A** launches, **Start** pauses | Arrows, **Enter**, **P** | Move the paddle |
| Blocks | **D-pad ← →** move, **↓** soft drop, **↑** / **RT** drop, **A** / **X** turn ⟳, **B** turn ⟲, **Y** / **LB** / **RB** hold, **Start** pauses | Arrows, **Enter** ⟳, **Backspace** ⟲, **E** hold, **P** | Held directions repeat |
| Flappy | **A**, **↑** or any face button, bumper or trigger; **Start** pauses | **Space**, **Enter** or **↑**; **P** | Flap |
| 2048 | **D-pad** / stick | Arrows | Slide |
| Minesweeper | **D-pad** moves a cursor on the TV, **A** opens, **X** / **B** flags | Arrows, **Enter**, **Q** / **Backspace** | |
| Simon | **A** green, **B** red, **Y** yellow, **X** blue, or the **D-pad** by position (↑ green, → red, ← yellow, ↓ blue) | Arrows by position | |
| Reaction Rush | Any face button, bumper or trigger | **Enter** / **Space** | Tap |

Buttons use Xbox names. On a PlayStation controller A = ✕, B = ○, X = □, Y = △.
Browsers only notice a controller after one of its buttons is pressed, so press
A once if the TV doesn't react. A phone can take the seat only when nobody is
playing; tap ✕ on the player card on the TV (then **Remove?**) to free it.

## Sound and music

The TV plays sound effects (countdowns, bites, bricks, merges, Simon's notes, a
fanfare for a new best) and background music made up live (no audio files): a
laid-back tune in the lobby, chiptune for arcade games, calm music for puzzles.
Browsers only allow sound after someone interacts with the page, so the first
time the TV shows **🔈 Tap for sound**: click it, or press any key. 🔊 mutes,
🎵 turns the music off (both remembered on that TV).

## High scores

Every finished run is saved in `stats.json` in the data folder (so it survives
updates). The lobby shows your best in each game, and the TV shows the best to
beat while you play. The 🏆 button on the TV (and the link in the phone lobby)
opens `/stats/`: a top 10 for every game (and difficulty), the players, and the
latest runs. Players are matched by name (ignoring capitals), so use the same
name each time. A run that scores nothing, or a lost Minesweeper, isn't
recorded. Settings (`/admin/`) can clear all scores.

## Secure page (https)

The hub answers both `http://` and `https://` on the same port. The certificate
is self-signed (made once and kept in the data folder), so each phone warns the
first time. None of the games so far need it (it's for future tilt and motion
games). Set `HTTPS=off` to serve plain http only.

## Quick start

### Docker (any machine on your network)

```bash
docker compose up -d --build
```

Then open `http://<server-ip>:3001/host/` in the TV's browser (a PC on HDMI, a
Google TV browser, or a Raspberry Pi). Your phone scans the QR code. The compose
file maps port **3001**, so it can run next to Ark 2P Hub (on 3000).

#### Fixing the QR code address

Inside Docker, the server only knows its own internal IP. If the TV page is
opened as `http://localhost:…`, the QR code can point somewhere phones can't
reach, and the TV shows a ⚠ warning. To fix it:

1. On a phone or PC, open `http://<server-ip>:3001/admin/` (or press ⚙ on the TV screen).
2. The first visit asks you to create an admin password.
3. Press **Use this page's address**, or type the address, then **Save**. The QR
   code on the TV updates right away.

The setting is stored in the `ark-data` Docker volume. You can also set
`ADMIN_PASSWORD` and/or `PUBLIC_URL` in `docker-compose.yml`; `PUBLIC_URL`
overrides the saved address.

### Update and redeploy from GitHub

Clone the repo once on the Docker machine, then run the update script from the
repo folder whenever there are bug fixes or new games:

```bash
git clone https://github.com/areyesromo/Ark-1p-Hub.git && cd Ark-1p-Hub

./update.sh                  # Linux / macOS / Pi
./update.sh --branch main    # switch to (and follow) another branch
./update.sh --force          # recreate the container even if nothing changed
./update.sh --port 3001      # where to check it's up (if you changed the port in docker-compose.yml)
```

```powershell
.\update.ps1                 # Windows (Docker Desktop), PowerShell 5.1 or 7
.\update.ps1 -Branch main
.\update.ps1 -Force
.\update.ps1 -Port 3001
```

It runs `git pull`, builds the image, redeploys with Docker Compose, then
checks `http://localhost:3001/version` and prints the version and commit that
are running. Details:

- **Failed build:** the running container is left as it is.
- **Pinned version:** if you've checked out a tag or commit to roll back, it
  won't pull.
- **Local changes:** they're kept, and the build is tagged `+dirty`.
- **Common git errors:** it explains them, including folders owned by another
  user ("dubious ownership") and ZIP downloads that aren't a git clone.
- **Screens:** after an update the TV and the phone reload by themselves, and
  the TV keeps its room code, so the phone reconnects without scanning again.
  (A run in progress does end, so update between games.) Scores and settings
  live in the `ark-data` volume and survive every update.

If Windows blocks the script, run `Set-ExecutionPolicy -Scope Process Bypass` first.

To update automatically, schedule it:

- **Linux (cron):** `*/10 * * * * /path/to/Ark-1p-Hub/update.sh >> /var/log/ark-update.log 2>&1`
- **Windows (Task Scheduler):** run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\path\to\Ark-1p-Hub\update.ps1` on a timer.

### Local development

```bash
npm install
npm run dev        # restarts on file changes
npm test
```

Open <http://localhost:3000/host/> in one window and
<http://localhost:3000/play/> in another (or on your phone via your computer's
LAN IP), or just use the keyboard on the TV window.

## How it works

```
TV browser  /host  ◄──┐
                      ├── Socket.IO ──►  Node server (rooms + game logic + scores)
Phone       /play  ◄──┘
```

- **The server is the source of truth.** The phone only sends inputs
  (`{ type: 'turn', dir: 'up' }`); the server runs the game and pushes a *view*
  to the TV and the phone. A controller or the keyboard is read on the TV page,
  which sends its input for it.
- **Scores:** when a run ends, the room records it and adds your best and
  your rank to the end screen (see `server/stats.js`).
- **Reconnects are built in.** The phone keeps a seat token, so a locked
  screen, a refresh or a Wi-Fi blip drops you straight back in. The TV resumes
  its room after a refresh or a server restart too.
- **Room codes** are 4 letters; rooms are cleaned up after 30 idle minutes.

```
server/
  app.js, index.js        HTTP + Socket.IO setup
  sockets.js              the socket protocol (join, start game, input…)
  rooms.js                the room, its one seat, running a game, recording scores
  stats.js                runs, bests and high-score tables
  games/                  one file per game (pure logic, unit-tested)
public/
  host/                   TV page (and gamepads.js: controllers + keyboard)
  play/                   phone controller page
  games/<id>/host.js      how a game looks on the TV
  games/<id>/player.js    how a game looks and behaves on the phone
  stats/, admin/          high scores, settings
update.sh / update.ps1     pull from GitHub, rebuild and redeploy
```
