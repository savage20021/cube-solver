/**
 * Kociemba's two-phase algorithm.
 *
 * Phase 1 brings the cube into the subgroup G1 = <U, D, R2, L2, F2, B2>: every
 * corner and edge correctly oriented, and the four middle-layer edges back in
 * the middle layer. Phase 2 finishes the solve using only G1 moves. Each phase
 * is an IDA* search over coordinate tables with precomputed pruning depths.
 * Trying several phase-1 solutions and keeping the shortest total gives
 * solutions of about 20 moves.
 *
 * Nothing here is typed in by hand. The cubie-level representation (which
 * piece sits in which slot, and how it is twisted or flipped) is read off the
 * geometric model in cube.js, including the effect of each basic move, and
 * every table is generated from that.
 */
import { Cube, FACES } from './cube.js';

// Slots in the standard order: URF UFL ULB UBR DFR DLF DBL DRB and
// UR UF UL UB DR DF DL DB FR FL BL BR.
const CORNER_SLOTS = [[1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1], [1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]];
const EDGE_SLOTS = [[1, 1, 0], [0, 1, 1], [-1, 1, 0], [0, 1, -1], [1, -1, 0], [0, -1, 1], [-1, -1, 0], [0, -1, -1],
  [1, 0, 1], [-1, 0, 1], [-1, 0, -1], [1, 0, -1]];
const UD = new Set([0, 3]);     // colours that live on U and D
const FB = new Set([2, 5]);     // colours that live on F and B

const solvedCube = new Cube();
const key = (colours) => colours.slice().sort().join(',');
const CORNER_ID = new Map(CORNER_SLOTS.map((p, i) => [key(solvedCube.colours(solvedCube.cubieAt(...p))), i]));
const EDGE_ID = new Map(EDGE_SLOTS.map((p, i) => [key(solvedCube.colours(solvedCube.cubieAt(...p))), i]));

/** Clockwise order of the three face axes around a corner, starting at U/D, seen from outside. */
function cornerAxes([x, y, z]) {
  const ey = [0, y, 0], ex = [x, 0, 0], ez = [0, 0, z];
  // (ey x ex) . p < 0  means ey -> ex -> ez runs clockwise viewed from outside.
  const cx = ey[1] * ex[2] - ey[2] * ex[1], cy = ey[2] * ex[0] - ey[0] * ex[2], cz = ey[0] * ex[1] - ey[1] * ex[0];
  return (cx * x + cy * y + cz * z) < 0 ? [ey, ex, ez] : [ey, ez, ex];
}
const sameVec = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Permutation + orientation form of a cube. */
export class CubieCube {
  constructor() {
    this.cp = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    this.co = new Uint8Array(8);
    this.ep = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    this.eo = new Uint8Array(12);
  }

  static fromCube(cube) {
    const c = new CubieCube();
    CORNER_SLOTS.forEach((p, slot) => {
      const i = cube.cubieAt(...p);
      c.cp[slot] = CORNER_ID.get(key(cube.colours(i)));
      const udColour = cube.colours(i).find((col) => UD.has(col));
      const n = cube.normalOf(i, udColour);
      c.co[slot] = cornerAxes(p).findIndex((a) => sameVec(a, n));
    });
    EDGE_SLOTS.forEach((p, slot) => {
      const i = cube.cubieAt(...p);
      c.ep[slot] = EDGE_ID.get(key(cube.colours(i)));
      const cols = cube.colours(i);
      const primary = cols.find((col) => UD.has(col)) ?? cols.find((col) => FB.has(col));
      const n = cube.normalOf(i, primary);
      const axis = p[1] !== 0 ? 1 : 2;             // U/D slots use the y axis, middle slots the z axis
      c.eo[slot] = Math.abs(n[axis]) === 1 ? 0 : 1;
    });
    return c;
  }

  /** this followed by b (b is normally a basic move). */
  multiply(b) {
    const r = new CubieCube();
    for (let i = 0; i < 8; i++) {
      r.cp[i] = this.cp[b.cp[i]];
      r.co[i] = (this.co[b.cp[i]] + b.co[i]) % 3;
    }
    for (let i = 0; i < 12; i++) {
      r.ep[i] = this.ep[b.ep[i]];
      r.eo[i] = (this.eo[b.ep[i]] + b.eo[i]) % 2;
    }
    return r;
  }

  // ---- phase 1 coordinates
  get twist() { let t = 0; for (let i = 0; i < 7; i++) t = 3 * t + this.co[i]; return t; }
  set twist(t) { let s = 0; for (let i = 6; i >= 0; i--) { this.co[i] = t % 3; s += t % 3; t = Math.floor(t / 3); } this.co[7] = (3 - s % 3) % 3; }
  get flip() { let f = 0; for (let i = 0; i < 11; i++) f = 2 * f + this.eo[i]; return f; }
  set flip(f) { let s = 0; for (let i = 10; i >= 0; i--) { this.eo[i] = f % 2; s += f % 2; f = Math.floor(f / 2); } this.eo[11] = (2 - s % 2) % 2; }
  /** Which 4 of the 12 slots hold middle-layer edges: 0..494. */
  get slice() {
    let a = 0, x = 0;
    for (let j = 11; j >= 0; j--) if (this.ep[j] >= 8) { a += choose(11 - j, x + 1); x++; }
    return a;
  }
  set slice(idx) {
    const sliceEdge = [8, 9, 10, 11], other = [0, 1, 2, 3, 4, 5, 6, 7];
    let a = idx, x = 4;
    this.ep.fill(255);
    for (let j = 0; j < 12; j++) if (a - choose(11 - j, x) >= 0) { this.ep[j] = sliceEdge[4 - x]; a -= choose(11 - j, x--); }
    let k = 0;
    for (let j = 0; j < 12; j++) if (this.ep[j] === 255) this.ep[j] = other[k++];
  }

  // ---- phase 2 coordinates (valid only inside G1)
  get cornerPerm() { return permIndex(this.cp, 8); }
  set cornerPerm(i) { this.cp.set(indexPerm(i, 8)); }
  get udEdgePerm() { return permIndex(this.ep.subarray(0, 8), 8); }
  set udEdgePerm(i) { this.ep.set(indexPerm(i, 8), 0); }
  get slicePerm() { return permIndex(Array.from(this.ep.subarray(8, 12), (e) => e - 8), 4); }
  set slicePerm(i) { this.ep.set(indexPerm(i, 4).map((e) => e + 8), 8); }
}

const CHOOSE = [];
for (let n = 0; n <= 12; n++) { CHOOSE[n] = [1]; for (let k = 1; k <= n; k++) CHOOSE[n][k] = CHOOSE[n - 1][k - 1] + (CHOOSE[n - 1][k] || 0); }
function choose(n, k) { return k < 0 || k > n ? 0 : CHOOSE[n][k]; }

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
/** Lehmer code of a permutation of 0..n-1. */
function permIndex(p, n) {
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    idx += smaller * FACT[n - 1 - i];
  }
  return idx;
}
function indexPerm(idx, n) {
  const pool = Array.from({ length: n }, (_, i) => i);
  const p = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const k = Math.floor(idx / f);
    idx %= f;
    p.push(pool.splice(k, 1)[0]);
  }
  return p;
}

// ---------------------------------------------------------------- validation

const FACE_WORD = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' };
const COLOUR_WORD = ['yellow', 'red', 'green', 'white', 'orange', 'blue'];
function slotWords(p) {
  const faces = [];
  if (p[1] === 1) faces.push('U'); if (p[1] === -1) faces.push('D');
  if (p[2] === 1) faces.push('F'); if (p[2] === -1) faces.push('B');
  if (p[0] === 1) faces.push('R'); if (p[0] === -1) faces.push('L');
  return faces.map((f) => FACE_WORD[f]).join('-');
}
function parity(perm) {
  let inv = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inv++;
  return inv % 2;
}

/**
 * Check whether a Cube (perhaps painted by hand) is a reachable state.
 * Returns {ok: true} or {ok: false, error: "plain-English reason"}.
 */
export function validate(cube) {
  const counts = new Array(6).fill(0);
  for (const col of cube.toFacelets()) counts[FACES.indexOf(col)]++;
  const wrong = counts.map((n, i) => (n !== 9 ? `${COLOUR_WORD[i]} ${n}` : null)).filter(Boolean);
  if (wrong.length) return { ok: false, error: `Every colour needs exactly 9 stickers. Off: ${wrong.join(', ')}.` };

  const seenC = new Set(), seenE = new Set();
  for (const p of CORNER_SLOTS) {
    const cols = cube.colours(cube.cubieAt(...p));
    const id = CORNER_ID.get(key(cols));
    if (id === undefined) {
      return { ok: false, error: `The ${slotWords(p)} corner has colours ${cols.map((c) => COLOUR_WORD[c]).join(', ')}, which no real corner has.` };
    }
    if (seenC.has(id)) return { ok: false, error: `The ${cols.map((c) => COLOUR_WORD[c]).join('-')} corner appears twice.` };
    seenC.add(id);
  }
  for (const p of EDGE_SLOTS) {
    const cols = cube.colours(cube.cubieAt(...p));
    const id = EDGE_ID.get(key(cols));
    if (id === undefined) {
      return { ok: false, error: `The ${slotWords(p)} edge has colours ${cols.map((c) => COLOUR_WORD[c]).join(', ')}, which no real edge has.` };
    }
    if (seenE.has(id)) return { ok: false, error: `The ${cols.map((c) => COLOUR_WORD[c]).join('-')} edge appears twice.` };
    seenE.add(id);
  }
  const c = CubieCube.fromCube(cube);
  if ([...c.co].reduce((a, b) => a + b, 0) % 3 !== 0) return { ok: false, error: 'A corner is twisted. Check the three stickers of each corner piece.' };
  if ([...c.eo].reduce((a, b) => a + b, 0) % 2 !== 0) return { ok: false, error: 'An edge is flipped. Check the two stickers of each edge piece.' };
  if (parity(c.cp) !== parity(c.ep)) return { ok: false, error: 'Two pieces are swapped, which no sequence of turns can produce. Check for two corners or two edges in each other’s places.' };
  return { ok: true };
}

// ---------------------------------------------------------------- moves

// Move index m = 3 * face + (quarter turns - 1); faces in URFDLB order.
export const MOVE_NAMES = [];
const MOVE_CUBES = [];
for (let f = 0; f < 6; f++) {
  const one = CubieCube.fromCube(new Cube().turn(FACES[f], 1));
  let acc = new CubieCube();
  for (let k = 0; k < 3; k++) {
    acc = acc.multiply(one);
    MOVE_CUBES.push(acc);
    MOVE_NAMES.push(FACES[f] + ['', '2', "'"][k]);
  }
}
const PHASE2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];   // U U2 U' R2 F2 D D2 D' L2 B2
const AXIS_OF = (m) => Math.floor(m / 3) % 3;              // U/D, R/L, F/B share an axis
const FACE_OF = (m) => Math.floor(m / 3);

/** Moves that may follow move `last` (never the same face; same axis only in one order). */
function allowed(last, m) {
  if (last < 0) return true;
  const fl = FACE_OF(last), fm = FACE_OF(m);
  if (fl === fm) return false;
  return !(AXIS_OF(last) === AXIS_OF(m) && fm < fl);
}

// ---------------------------------------------------------------- tables

let T = null;   // built lazily by init()

function moveTable(size, moves, coord, Arr = Uint16Array) {
  const t = new Arr(size * moves.length);
  const c = new CubieCube();
  for (let i = 0; i < size; i++) {
    c.cp.set([0, 1, 2, 3, 4, 5, 6, 7]); c.co.fill(0); c.ep.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); c.eo.fill(0);
    c[coord] = i;
    moves.forEach((m, k) => { t[i * moves.length + k] = c.multiply(MOVE_CUBES[m])[coord]; });
  }
  return t;
}

/** BFS depths over the product of two coordinates, both moved by the same move list. */
function pruneTable(sizeA, tabA, sizeB, tabB, nMoves) {
  const p = new Uint8Array(sizeA * sizeB).fill(255);
  p[0] = 0;
  let depth = 0, done = 1;
  while (done < p.length) {
    for (let i = 0; i < p.length; i++) {
      if (p[i] !== depth) continue;
      const a = Math.floor(i / sizeB), b = i % sizeB;
      for (let k = 0; k < nMoves; k++) {
        const j = tabA[a * nMoves + k] * sizeB + tabB[b * nMoves + k];
        if (p[j] === 255) { p[j] = depth + 1; done++; }
      }
    }
    depth++;
  }
  return p;
}

/** Build all move and pruning tables. Takes a second or two; call once. */
export function init() {
  if (T) return T;
  const all = Array.from({ length: 18 }, (_, i) => i);
  const twistM = moveTable(2187, all, 'twist');
  const flipM = moveTable(2048, all, 'flip');
  const sliceM = moveTable(495, all, 'slice');
  const cpM = moveTable(40320, PHASE2_MOVES, 'cornerPerm');
  const udM = moveTable(40320, PHASE2_MOVES, 'udEdgePerm');
  const spM = moveTable(24, PHASE2_MOVES, 'slicePerm');
  T = {
    twistM, flipM, sliceM, cpM, udM, spM,
    twistSliceP: pruneTable(2187, twistM, 495, sliceM, 18),
    flipSliceP: pruneTable(2048, flipM, 495, sliceM, 18),
    cpSliceP: pruneTable(40320, cpM, 24, spM, 10),
    udSliceP: pruneTable(40320, udM, 24, spM, 10),
  };
  return T;
}

// ---------------------------------------------------------------- search

/**
 * Solve a Cube. Returns {moves: [...], phase1: n} where the first n moves are phase 1.
 * Keeps searching for shorter solutions until `timeLimit` ms pass or a solution
 * of at most `target` moves is found.
 */
export function solve(cube, { timeLimit = 1500, target = 20, maxLength = 30 } = {}) {
  init();
  const start = CubieCube.fromCube(cube);
  if (start.twist === 0 && start.flip === 0 && start.slice === 0 && start.cornerPerm === 0
      && start.udEdgePerm === 0 && start.slicePerm === 0) return { moves: [], phase1: 0 };

  const t0 = performance.now();
  let best = null, bestPhase1 = 0;
  let bestLen = maxLength + 1;
  const path1 = [], path2 = [];

  function phase2(cp, ud, sp, depth, last) {
    if (depth === 0) return cp === 0 && ud === 0 && sp === 0;
    if (Math.max(T.cpSliceP[cp * 24 + sp], T.udSliceP[ud * 24 + sp]) > depth) return false;
    for (let k = 0; k < 10; k++) {
      const m = PHASE2_MOVES[k];
      if (!allowed(last, m)) continue;
      path2.push(m);
      if (phase2(T.cpM[cp * 10 + k], T.udM[ud * 10 + k], T.spM[sp * 10 + k], depth - 1, m)) return true;
      path2.pop();
    }
    return false;
  }

  function finishPhase1() {
    // Phase-1 solutions must not end in a phase-2 move, or we would revisit the same state.
    const last = path1[path1.length - 1];
    if (path1.length && PHASE2_MOVES.includes(last)) return;
    let c = start;
    for (const m of path1) c = c.multiply(MOVE_CUBES[m]);
    const cp = c.cornerPerm, ud = c.udEdgePerm, sp = c.slicePerm;
    const lower = Math.max(T.cpSliceP[cp * 24 + sp], T.udSliceP[ud * 24 + sp]);
    for (let d2 = lower; path1.length + d2 < bestLen; d2++) {
      path2.length = 0;
      if (phase2(cp, ud, sp, d2, last ?? -1)) {
        best = path1.concat(path2);
        bestPhase1 = path1.length;
        bestLen = best.length;
        return;
      }
    }
  }

  function phase1(twist, flip, slice, depth, last) {
    if (depth === 0) {
      if (twist === 0 && flip === 0 && slice === 0) finishPhase1();
      return;
    }
    if (Math.max(T.twistSliceP[twist * 495 + slice], T.flipSliceP[flip * 495 + slice]) > depth) return;
    for (let m = 0; m < 18; m++) {
      if (!allowed(last, m)) continue;
      path1.push(m);
      phase1(T.twistM[twist * 18 + m], T.flipM[flip * 18 + m], T.sliceM[slice * 18 + m], depth - 1, m);
      path1.pop();
      if (bestLen <= target || performance.now() - t0 > timeLimit) return;
    }
  }

  for (let d1 = 0; d1 <= 12 && d1 < bestLen; d1++) {
    path1.length = 0;
    phase1(start.twist, start.flip, start.slice, d1, -1);
    if (bestLen <= target || performance.now() - t0 > timeLimit) break;
  }
  if (!best) throw new Error('two-phase search found no solution (is the cube state valid?)');
  return { moves: best.map((m) => MOVE_NAMES[m]), phase1: bestPhase1 };
}
