/**
 * Geometric Rubik's cube model.
 *
 * Every cubie is stored as a position (x, y, z in {-1, 0, 1}) plus up to three
 * stickers, each with an outward normal and a colour. A face turn rotates the
 * nine cubies in that layer, positions and normals alike. Nothing about the
 * cube's structure is hand-encoded as permutation tables, so there is nothing
 * to get wrong there; the geometry is the model.
 *
 * Colours are numbered by the face they belong on when solved:
 *   0 U (yellow)  1 R (red)  2 F (green)  3 D (white)  4 L (orange)  5 B (blue)
 * so the beginner method builds the white cross on the bottom and finishes with yellow on top.
 */

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const AXIS = {
  U: [0, 1, 0], D: [0, -1, 0],
  R: [1, 0, 0], L: [-1, 0, 0],
  F: [0, 0, 1], B: [0, 0, -1],
};
export const COLOUR_NAMES = ['yellow', 'red', 'green', 'white', 'orange', 'blue'];
export const COLOUR_HEX = ['#fdd835', '#c62828', '#2e7d32', '#f5f5f5', '#ef6c00', '#1565c0'];

const STRIDE = 15;          // 3 position ints + 3 stickers * (3 normal ints + 1 colour)
const N_CUBIES = 26;

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Rotate integer vector v a quarter turn clockwise when viewed from outside along axis a. */
function rotQuarter(v, a) {
  const d = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const c = cross(a, v);
  return [a[0] * d - c[0], a[1] * d - c[1], a[2] * d - c[2]];
}

export class Cube {
  constructor(data) {
    if (data) {
      this.d = data;
      return;
    }
    this.d = new Int8Array(N_CUBIES * STRIDE);
    let i = 0;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const o = i * STRIDE;
          this.d[o] = x; this.d[o + 1] = y; this.d[o + 2] = z;
          let s = 0;
          for (const f of FACES) {
            const a = AXIS[f];
            if (a[0] * x + a[1] * y + a[2] * z === 1) {
              const so = o + 3 + s * 4;
              this.d[so] = a[0]; this.d[so + 1] = a[1]; this.d[so + 2] = a[2];
              this.d[so + 3] = FACES.indexOf(f);
              s++;
            }
          }
          for (; s < 3; s++) this.d[o + 3 + s * 4 + 3] = -1;   // unused sticker slot
          i++;
        }
      }
    }
  }

  clone() { return new Cube(this.d.slice()); }

  equals(other) {
    for (let i = 0; i < this.d.length; i++) if (this.d[i] !== other.d[i]) return false;
    return true;
  }

  /** Turn one face. q = number of clockwise quarter turns (1, 2 or 3). */
  turn(face, q = 1) {
    const a = AXIS[face];
    const d = this.d;
    for (let i = 0; i < N_CUBIES; i++) {
      const o = i * STRIDE;
      if (a[0] * d[o] + a[1] * d[o + 1] + a[2] * d[o + 2] !== 1) continue;
      for (let k = 0; k < q; k++) {
        let v = rotQuarter([d[o], d[o + 1], d[o + 2]], a);
        d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2];
        for (let s = 0; s < 3; s++) {
          const so = o + 3 + s * 4;
          if (d[so + 3] < 0) break;
          v = rotQuarter([d[so], d[so + 1], d[so + 2]], a);
          d[so] = v[0]; d[so + 1] = v[1]; d[so + 2] = v[2];
        }
      }
    }
    return this;
  }

  /** Apply a sequence like "R U R' U' F2". Returns this. */
  move(alg) {
    for (const [face, q] of parseAlg(alg)) this.turn(face, q);
    return this;
  }

  isSolved() {
    const d = this.d;
    for (let i = 0; i < N_CUBIES; i++) {
      const o = i * STRIDE;
      for (let s = 0; s < 3; s++) {
        const so = o + 3 + s * 4;
        const c = d[so + 3];
        if (c < 0) break;
        const a = AXIS[FACES[c]];
        if (d[so] !== a[0] || d[so + 1] !== a[1] || d[so + 2] !== a[2]) return false;
      }
    }
    return true;
  }

  /** Index of the cubie whose sticker colours are exactly this set. */
  find(colours) {
    const want = [...colours].sort().join();
    const d = this.d;
    for (let i = 0; i < N_CUBIES; i++) {
      const o = i * STRIDE;
      const got = [];
      for (let s = 0; s < 3; s++) {
        const c = d[o + 3 + s * 4 + 3];
        if (c < 0) break;
        got.push(c);
      }
      if (got.length === colours.length && got.sort().join() === want) return i;
    }
    throw new Error('no cubie with colours ' + colours);
  }

  pos(i) { const o = i * STRIDE; return [this.d[o], this.d[o + 1], this.d[o + 2]]; }

  /** Index of the cubie currently sitting at position (x, y, z). */
  cubieAt(x, y, z) {
    const d = this.d;
    for (let i = 0; i < N_CUBIES; i++) {
      const o = i * STRIDE;
      if (d[o] === x && d[o + 1] === y && d[o + 2] === z) return i;
    }
    throw new Error(`no cubie at ${x},${y},${z}`);
  }

  /** Sticker colours of cubie i. */
  colours(i) {
    const out = [];
    for (let s = 0; s < 3; s++) {
      const c = this.d[i * STRIDE + 3 + s * 4 + 3];
      if (c < 0) break;
      out.push(c);
    }
    return out;
  }

  /** Outward normal of the sticker with the given colour on cubie i, or null. */
  normalOf(i, colour) {
    const o = i * STRIDE;
    for (let s = 0; s < 3; s++) {
      const so = o + 3 + s * 4;
      if (this.d[so + 3] === colour) return [this.d[so], this.d[so + 1], this.d[so + 2]];
    }
    return null;
  }

  /** All stickers as [{pos, normal, colour}] (for rendering). */
  stickers() {
    const out = [];
    const d = this.d;
    for (let i = 0; i < N_CUBIES; i++) {
      const o = i * STRIDE;
      for (let s = 0; s < 3; s++) {
        const so = o + 3 + s * 4;
        if (d[so + 3] < 0) break;
        out.push({ cubie: i, pos: [d[o], d[o + 1], d[o + 2]],
          normal: [d[so], d[so + 1], d[so + 2]], colour: d[so + 3] });
      }
    }
    return out;
  }

  /** 54-character facelet string in URFDLB order (Kociemba layout), e.g. "UUUUUUUUURRR...". */
  toFacelets() {
    const out = [];
    const d = this.d;
    for (const f of FACES) {
      const a = AXIS[f];
      // Row/column directions for reading each face top-left to bottom-right.
      const [right, down] = FACE_FRAME[f];
      for (let r = -1; r <= 1; r++) {
        for (let c = -1; c <= 1; c++) {
          const p = [a[0] + right[0] * c + down[0] * r, a[1] + right[1] * c + down[1] * r, a[2] + right[2] * c + down[2] * r];
          let colour = -1;
          for (let i = 0; i < N_CUBIES && colour < 0; i++) {
            const o = i * STRIDE;
            if (d[o] !== p[0] || d[o + 1] !== p[1] || d[o + 2] !== p[2]) continue;
            for (let s = 0; s < 3; s++) {
              const so = o + 3 + s * 4;
              if (d[so + 3] < 0) break;
              if (d[so] === a[0] && d[so + 1] === a[1] && d[so + 2] === a[2]) { colour = d[so + 3]; break; }
            }
          }
          out.push(FACES[colour]);
        }
      }
    }
    return out.join('');
  }
}

// For each face: [direction of increasing column, direction of increasing row]
// when looking straight at that face with U on top (B is read with U on top too).
const FACE_FRAME = {
  U: [[1, 0, 0], [0, 0, 1]],
  D: [[1, 0, 0], [0, 0, -1]],
  F: [[1, 0, 0], [0, -1, 0]],
  B: [[-1, 0, 0], [0, -1, 0]],
  R: [[0, 0, -1], [0, -1, 0]],
  L: [[0, 0, 1], [0, -1, 0]],
};

/** "R U' F2" -> [["R",1],["U",3],["F",2]] */
export function parseAlg(alg) {
  const out = [];
  for (const tok of alg.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = /^([URFDLB])(2'?|'|)$/.exec(tok);
    if (!m) throw new Error('bad move: ' + tok);
    out.push([m[1], m[2] === '' ? 1 : m[2].startsWith('2') ? 2 : 3]);
  }
  return out;
}

export function formatMove(face, q) {
  return face + (q === 1 ? '' : q === 2 ? '2' : "'");
}

export function invertAlg(alg) {
  return parseAlg(alg).reverse().map(([f, q]) => formatMove(f, 4 - q)).join(' ');
}

/** Random scramble of n moves, never the same face twice in a row. */
export function randomScramble(n = 25, rng = Math.random) {
  const out = [];
  let last = '';
  for (let i = 0; i < n; i++) {
    let f;
    do f = FACES[Math.floor(rng() * 6)]; while (f === last);
    last = f;
    out.push(formatMove(f, 1 + Math.floor(rng() * 3)));
  }
  return out.join(' ');
}
