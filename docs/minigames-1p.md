# Next 1P games

The games planned next for Ark 1P Hub, best first. Each one is built the way the others are
(server module and tests, TV and phone screens, controller and keyboard, achievements, a README
row), and plays everywhere: on the TV with a phone, on the TV alone with a controller or the
keyboard (Steam Deck), and on the phone alone at `/phone`.

| # | Game | Type | Phone only | Size of the job |
| --- | --- | --- | --- | --- |
| 1 | Tango | Puzzle | Whole game on the phone | Small: reuses Dog Park's one-answer board maker and level ladder |
| 2 | Zip | Puzzle | Whole game on the phone | Small to medium |
| 3 | Rush Hour | Puzzle | Whole game on the phone | Medium (level packs) |
| 4 | Pipes | Puzzle | Whole game on the phone | Medium |
| 5 | Futoshiki | Puzzle | Whole game on the phone | Small: like KenKen |
| 6 | Peg Solitaire | Puzzle | Whole game on the phone | Small |
| 7 | Hashi (Bridges) | Puzzle | Whole game on the phone | Large: making fair boards is the hard part |
| 8 | Slitherlink | Puzzle | Whole game on the phone | Large: as above |

## 1. Tango

A grid (6 × 6 to 10 × 10) to fill with suns ☀️ and moons 🌙.

- No three of the same in a row or column.
- Every row and column has as many suns as moons.
- Some pairs of squares have a sign between them: **=** means the same, **×** means different.
- Some squares are given.

**Plays:** tap a square for sun → moon → empty, like Dog Park. Squares that break a rule light up.
Hint, Undo and Clear as in Dog Park.
**Boards:** made like Dog Park's: start from a full legal grid, remove clues while it still has
exactly one answer. Ladder of levels (6 × 6 up to 10 × 10) that open in turn, plus random boards and a
daily slot. **Score:** time, per size.
**Looks to unlock:** sun / moon, cat / dog, ⚪ / ⚫.

## 2. Zip

A grid with numbered dots (1, 2, 3 …). Draw one path that visits the numbers in order and covers
every square exactly once. Some levels have walls between squares.

**Plays:** drag a finger along the path; drag back over it to undo. On the TV the D-pad draws it,
B steps back. **Boards:** make a random path that covers the grid (a Hamiltonian path), drop
numbers along it, then keep only boards with one answer. Ladder of levels plus random boards.
**Score:** time.

## 3. Rush Hour

A 6 × 6 parking lot of cars and trucks that only move forwards and backwards. Slide them until the
red car can drive out.

**Plays:** drag a car (or pick it with the D-pad and push it). **Boards:** a pack of 40 levels,
easy to expert, each with its fewest moves worked out by a solver (a par, like Sokoban).
**Score:** moves (fewer is better), per level; ⭐ for solving in par.

## 4. Pipes

A grid of pipe pieces (straight, bend, T, cross). Rotate them until water from the tap reaches
every pipe, with no open ends.

**Plays:** tap a piece to turn it; the water flows live as you connect. **Boards:** grow a random
tree of pipes over the grid, then scramble the pieces. 5 × 5 to 10 × 10, and a "wrap round the
edges" mode. **Score:** time, per size.

## 5. Futoshiki

A Latin square (each number once per row and column, 4 × 4 to 7 × 7) with **<** and **>** signs
between some squares, and a few numbers given.

**Plays:** like Sudoku and KenKen (pick a square, tap a number, pencil marks). **Boards:** made like
KenKen's, keeping only boards with one answer. **Score:** time, per size.

## 6. Peg Solitaire

The classic cross-shaped board of pegs with the middle hole empty. Jump a peg over a neighbour
into an empty hole; the jumped peg is taken off. Finish with one peg, ideally in the middle.

**Plays:** tap a peg, then where it lands. **Boards:** English and European boards plus a few
small warm-ups. **Score:** pegs left (fewer is better); one in the middle is a perfect game.

## 7. Hashi (Bridges)

Islands with numbers. Join them with bridges (straight, at most two between any two islands, no
crossing) so each island has as many bridges as its number and every island is connected.

**Plays:** drag from one island to another to add a bridge; again for a double; again to remove.

## 8. Slitherlink

A grid of dots with numbers in some squares. Draw one closed loop along the dots; each number says
how many of its square's four sides the loop uses.

**Plays:** tap an edge to draw a line, again for ✕ (no line), again to clear.

For both 7 and 8, the work is in making boards that are fair (one answer, solvable without
guessing) fast enough for a Raspberry Pi, so they'd start as fixed level packs made ahead of time.

## Other 1P ideas (not games)

- **Phone-only mode as an app:** "Add to Home Screen" support, so `/phone` opens full screen with
  its own icon, and a game picks up where you left off.
- **Asteroids on the phone:** a steering stick instead of four buttons, for the split screen.
- **Tidy up achievement names** used twice: Steady hands, Clean sweep, Number cruncher,
  Wordsmith, Elephant.
