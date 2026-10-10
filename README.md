# Cube Solver

A 3D Rubik's cube in the browser that you can scramble, turn by hand, and then watch solve itself one
animated move at a time, with every step named.

**[Try it live](https://savage20021.github.io/cube-solver/)**

No build step, no dependencies beyond Three.js from a CDN. Open `index.html` through any static server.

## What it does

- **Turn it yourself.** Click a sticker to turn that face clockwise, shift-click for anticlockwise, or use
  the keyboard (`U R F D L B`, hold shift for the inverse). Drag to orbit.
- **Scramble** with a random 25-move sequence, or type any sequence in standard notation and apply it.
- **Solve.** The solver works out a full solution in about a second, then plays it back. Step forward and
  back through the moves, pause, or jump to the start. Each step is labelled with what it is doing
  ("White cross: R edge in", "Corner FR: insert", "Last layer: permute edges").

## How it works

### The cube model (`src/cube.js`)

There are no hand-typed permutation tables. Each of the 26 cubies is stored as a position vector and up
to three stickers, each with an outward normal vector and a colour. A face turn is a quarter rotation
applied to the positions and normals of the nine cubies in that layer. The geometry *is* the model, so
there is nothing to transcribe wrongly. The tests check single turns against the standard facelet
reference strings, and that things like `(R U R' U') x6` return to solved.

### The solver (`src/solver.js`)

A layer-by-layer beginner method, but with a twist: instead of hard-coding every case, each step is a
tiny search problem.

A solve is a list of **stages**. Each stage has a goal (a predicate on the cube), a small set of allowed
moves, and a depth limit. Iterative-deepening depth-first search finds the shortest sequence of allowed
moves that reaches the goal while keeping everything already solved intact.

| Stage | Goal | Allowed moves |
|---|---|---|
| White cross, one edge at a time | edge in place and oriented | face turns, no D |
| First-layer corners | corner in its slot, oriented | U plus the slot's two side faces |
| Middle-layer edges | edge in its slot, oriented | U plus the slot's two side faces |
| Last layer, orient edges | yellow cross | U turns + `F R U R' U' F'` |
| Last layer, orient corners | all yellow up | U turns + Sune and anti-Sune |
| Last layer, permute corners | corners placed | U turns + two corner 3-cycles |
| Last layer, permute edges | solved | U turns + U-perms |

The first two layers only need single face turns, searched to a depth of up to 8. The last layer uses
the classic named algorithms as macros, so the search there only has to decide how many times to apply
them and which U turns go between. Pieces that are stuck in a wrong slot are handled by a "bring up"
stage that first lifts them into the top layer.

Solutions average about 110 moves. Fine for a beginner method, and every one is verified by replaying
it on the model in the tests.

### Rendering (`src/app.js`)

Three.js. The logical cube is the single source of truth: a move is animated by rotating a pivot group,
then the logical model is updated and every mesh is snapped to exactly where the model says it is, so
there is no drift. Clicking a sticker ray-casts to find which face it belongs to.

## Running the tests

```
npm test
```

Node's built-in test runner. There is also a quick benchmark: `node scripts/bench.js 100`.

## Roadmap

- **Kociemba two-phase solver** for solutions around 20 moves instead of 110.
- **Enter your own cube** by painting the colours on a net, then solve it.
- Webcam colour scanning.

## Licence

MIT
