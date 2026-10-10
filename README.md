# Cube Solver

A 3D Rubik's cube in the browser that you can scramble, turn by hand, and then watch solve itself one
animated move at a time. Two solvers: Kociemba's two-phase algorithm for solutions of about 20 moves,
and a layer-by-layer beginner method with every step named.

**[Try it live](https://savage20021.github.io/cube-solver/)**

No build step, no dependencies beyond Three.js from a CDN. Open `index.html` through any static server.

## What it does

- **Turn it yourself.** Click a sticker to turn that face clockwise, shift-click for anticlockwise, or use
  the keyboard (`U R F D L B`, hold shift for the inverse). Drag to orbit.
- **Scramble** with a random 25-move sequence, or type any sequence in standard notation and apply it.
- **Solve.** Pick a method, and the solver works out a solution in about a second, then plays it back.
  Step forward and back through the moves, pause, or jump to the start. Each step is labelled with what
  it is doing ("White cross: R edge in", "Corner FR: insert", "Phase 2: finish using only U, D and half turns").
  Solving runs in a Web Worker, so the cube keeps animating while it thinks.

## How it works

### The cube model (`src/cube.js`)

There are no hand-typed permutation tables. Each of the 26 cubies is stored as a position vector and up
to three stickers, each with an outward normal vector and a colour. A face turn is a quarter rotation
applied to the positions and normals of the nine cubies in that layer. The geometry *is* the model, so
there is nothing to transcribe wrongly. The tests check single turns against the standard facelet
reference strings, and that things like `(R U R' U') x6` return to solved.

### Two-phase solver (`src/twophase.js`)

Kociemba's algorithm, the same idea behind every serious cube solver.

- **Phase 1** gets the cube into the subgroup G1 = <U, D, R2, L2, F2, B2>: every corner and edge
  correctly oriented, and the four middle-layer edges back in the middle layer. The state is described
  by three numbers (corner twist 0..2186, edge flip 0..2047, which slots hold the middle edges 0..494),
  and the search is IDA* over precomputed move tables with pruning tables that give an exact lower bound
  on the moves still needed.
- **Phase 2** finishes the solve using only G1 moves, with three more coordinates (corner permutation,
  U/D edge permutation, middle-edge permutation).
- It keeps trying different phase-1 solutions and keeps the shortest total until it hits 20 moves or
  1.5 seconds pass. Solutions average about 20 moves, 21 worst case in testing.

The cubie-level representation, and the effect of each basic move on it, are read off the geometric
model rather than typed in, and every lookup table is generated from that at load time (about 0.7 s).
Table generation and the search both run in a Web Worker.

### Layer-by-layer solver (`src/solver.js`)

A beginner method, but with a twist: instead of hard-coding every case, each step is a tiny search
problem.

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
them and which U turns go between. Solutions average about 110 moves, which is what a human beginner
would produce, and every one is verified by replaying it on the model in the tests.

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

- **Enter your own cube** by painting the colours on a net, then solve it.
- Webcam colour scanning.
- Optimal solver (20 moves or fewer, always), which needs much bigger tables.

## Licence

MIT
