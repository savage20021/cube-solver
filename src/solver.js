/**
 * Layer-by-layer ("beginner method") solver.
 *
 * The solve is a list of stages. Each stage has a goal (a predicate on the
 * cube), a small set of allowed moves or macros, and a depth limit. The stage
 * is solved by iterative-deepening search, which finds the shortest sequence
 * of allowed moves that reaches the goal while keeping everything already
 * solved intact. The first two layers only need single face turns; the last
 * layer uses the classic named algorithms as macros so the search stays tiny.
 *
 * Stages in order:
 *   1. Cross on D (four edges)
 *   2. First-layer corners
 *   3. Middle-layer edges
 *   4. Last layer: orient edges, orient corners, permute corners, permute edges
 */
import { Cube, AXIS, FACES, parseAlg, formatMove } from './cube.js';

const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;
const SIDES = ['F', 'R', 'B', 'L'];                    // clockwise seen from above
const colourOf = (face) => FACES.indexOf(face);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// ---------------------------------------------------------------- predicates

/** The edge belonging between faces f1,f2 is in place and oriented. */
function edgeSolved(cube, f1, f2) {
  const i = cube.find([colourOf(f1), colourOf(f2)]);
  return eq(cube.pos(i), add(AXIS[f1], AXIS[f2])) && eq(cube.normalOf(i, colourOf(f1)), AXIS[f1]);
}

function cornerSolved(cube, f1, f2, f3) {
  const i = cube.find([colourOf(f1), colourOf(f2), colourOf(f3)]);
  return eq(cube.pos(i), add(add(AXIS[f1], AXIS[f2]), AXIS[f3]))
    && eq(cube.normalOf(i, colourOf(f1)), AXIS[f1]) && eq(cube.normalOf(i, colourOf(f2)), AXIS[f2]);
}

function inLayer(cube, colours, face) {
  const p = cube.pos(cube.find(colours));
  const a = AXIS[face];
  return a[0] * p[0] + a[1] * p[1] + a[2] * p[2] === 1;
}

/** Which side faces does the slot holding this piece touch? (for choosing moves) */
function sideFacesAt(cube, colours) {
  const p = cube.pos(cube.find(colours));
  return SIDES.filter((f) => { const a = AXIS[f]; return a[0] * p[0] + a[2] * p[2] === 1; });
}

// ---------------------------------------------------------------- search

const SINGLE = {};
for (const f of FACES) for (const q of [1, 2, 3]) SINGLE[formatMove(f, q)] = { alg: formatMove(f, q), face: f, moves: [[f, q]] };

function macro(alg) {
  return { alg, face: null, moves: parseAlg(alg) };
}

function movesFor(faces, quarterOnly = false) {
  const out = [];
  for (const f of faces) for (const q of (quarterOnly ? [1, 3] : [1, 2, 3])) out.push(SINGLE[formatMove(f, q)]);
  return out;
}

const inverse = (moves) => moves.slice().reverse().map(([f, q]) => [f, 4 - q]);

/**
 * Iterative-deepening DFS. Returns the list of macro strings, or null.
 * Moves are applied in place and undone on backtrack, so no cloning.
 */
function search(cube, goal, macros, maxDepth) {
  if (goal(cube)) return [];
  const path = [];
  const inv = macros.map((m) => inverse(m.moves));
  function dfs(depth, lastFace) {
    if (depth === 0) return goal(cube);
    for (let k = 0; k < macros.length; k++) {
      const m = macros[k];
      if (m.face !== null && m.face === lastFace) continue;       // R R' is pointless
      for (const [f, q] of m.moves) cube.turn(f, q);
      path.push(m.alg);
      if (dfs(depth - 1, m.face)) return true;
      path.pop();
      for (const [f, q] of inv[k]) cube.turn(f, q);
    }
    return false;
  }
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (dfs(depth, null)) return path;
  }
  return null;
}

// ---------------------------------------------------------------- stages

/** Builds the ordered stage list. Each stage: {name, goal, macros(cube), maxDepth}. */
function buildStages() {
  const stages = [];
  const done = [];                                   // predicates that must stay true
  // Each stage snapshots the list as it stood when the stage was built.
  const keeper = () => { const must = done.slice(); return (cube) => must.every((p) => p(cube)); };

  // 1. Cross on D
  for (const s of SIDES) {
    const colours = [D, colourOf(s)];
    const solved = (c) => edgeSolved(c, 'D', s);
    stages.push({
      name: `White cross: ${s} edge up`,
      goal: ((keep) => (c) => keep(c) && (solved(c) || inLayer(c, colours, 'U')))(keeper()),
      macros: () => movesFor(['U', 'R', 'F', 'L', 'B']),
      maxDepth: 3,
    });
    stages.push({
      name: `White cross: ${s} edge in`,
      goal: ((keep) => (c) => keep(c) && solved(c))(keeper()),
      macros: () => movesFor(['U', 'R', 'F', 'L', 'B']),
      maxDepth: 5,
    });
    done.push(solved);
  }

  // 2. First-layer corners
  for (let k = 0; k < 4; k++) {
    const a = SIDES[k], b = SIDES[(k + 1) % 4];       // slot between a and b (e.g. F and R)
    const colours = [D, colourOf(a), colourOf(b)];
    const solved = (c) => cornerSolved(c, 'D', a, b);
    stages.push({
      name: `Corner ${a}${b}: bring up`,
      goal: ((keep) => (c) => keep(c) && (solved(c) || inLayer(c, colours, 'U')))(keeper()),
      macros: (c) => movesFor(['U', ...sideFacesAt(c, colours)], true),
      maxDepth: 3,
    });
    stages.push({
      name: `Corner ${a}${b}: insert`,
      goal: ((keep) => (c) => keep(c) && solved(c))(keeper()),
      macros: () => movesFor(['U', a, b], true).concat([SINGLE['U2']]),
      maxDepth: 8,
    });
    done.push(solved);
  }

  // 3. Middle-layer edges
  for (let k = 0; k < 4; k++) {
    const a = SIDES[k], b = SIDES[(k + 1) % 4];
    const colours = [colourOf(a), colourOf(b)];
    const solved = (c) => edgeSolved(c, a, b);
    stages.push({
      name: `Edge ${a}${b}: bring up`,
      goal: ((keep) => (c) => keep(c) && (solved(c) || inLayer(c, colours, 'U')))(keeper()),
      macros: (c) => movesFor(['U', ...sideFacesAt(c, colours)], true).concat([SINGLE['U2']]),
      maxDepth: 8,
    });
    stages.push({
      name: `Edge ${a}${b}: insert`,
      goal: ((keep) => (c) => keep(c) && solved(c))(keeper()),
      macros: () => movesFor(['U', a, b], true).concat([SINGLE['U2']]),
      maxDepth: 8,
    });
    done.push(solved);
  }

  // 4. Last layer
  const uEdges = SIDES.map((s) => [U, colourOf(s)]);
  const uCorners = SIDES.map((s, k) => [U, colourOf(s), colourOf(SIDES[(k + 1) % 4])]);
  const edgesOriented = (c) => uEdges.every((col) => eq(c.normalOf(c.find(col), U), AXIS.U));
  const cornersOriented = (c) => uCorners.every((col) => eq(c.normalOf(c.find(col), U), AXIS.U));
  const cornersPlaced = (c) => SIDES.every((s, k) => cornerSolved(c, 'U', s, SIDES[(k + 1) % 4]));
  const uTurns = movesFor(['U']);

  stages.push({
    name: 'Last layer: orient edges (yellow cross)',
    goal: ((keep) => (c) => keep(c) && edgesOriented(c))(keeper()),
    macros: () => uTurns.concat([macro("F R U R' U' F'"), macro("F U R U' R' F'")]),
    maxDepth: 6,
  });
  done.push(edgesOriented);
  stages.push({
    name: 'Last layer: orient corners',
    goal: ((keep) => (c) => keep(c) && cornersOriented(c))(keeper()),
    macros: () => uTurns.concat([macro("R U R' U R U2 R'"), macro("R U2 R' U' R U' R'")]),
    maxDepth: 6,
  });
  done.push(cornersOriented);
  stages.push({
    name: 'Last layer: permute corners',
    goal: ((keep) => (c) => keep(c) && cornersPlaced(c))(keeper()),
    macros: () => uTurns.concat([macro("U R U' L' U R' U' L"), macro("R' F R' B2 R F' R' B2 R2")]),
    maxDepth: 6,
  });
  done.push(cornersPlaced);
  stages.push({
    name: 'Last layer: permute edges',
    goal: (c) => c.isSolved(),
    macros: () => uTurns.concat([macro("R U' R U R U R U' R' U' R2"), macro("R2 U R U R' U' R' U' R' U R'"),
      macro("F2 U L R' F2 L' R U F2")]),
    maxDepth: 6,
  });
  return stages;
}

/**
 * Solve the cube. Returns {steps: [{name, moves: ["R","U'",...]}], moves: [...all...]}.
 * Throws if any stage cannot be solved within its depth limit (which would be a bug).
 */
export function solve(cube) {
  const work = cube.clone();
  const steps = [];
  for (const stage of buildStages()) {
    const found = search(work, stage.goal, stage.macros(work), stage.maxDepth);
    if (found === null) throw new Error(`stage failed: ${stage.name}`);
    const moves = found.flatMap((alg) => alg.split(' '));
    if (moves.length) steps.push({ name: stage.name, moves: simplify(moves) });
  }
  return { steps, moves: steps.flatMap((s) => s.moves) };
}

/** Merge consecutive turns of the same face ("U U" -> "U2", "R R'" -> nothing). */
export function simplify(moves) {
  const out = [];
  for (const [f, q] of moves.flatMap((m) => parseAlg(m))) {
    const last = out[out.length - 1];
    if (last && last[0] === f) {
      last[1] = (last[1] + q) % 4;
      if (last[1] === 0) out.pop();
    } else {
      out.push([f, q]);
    }
  }
  return out.map(([f, q]) => formatMove(f, q));
}
