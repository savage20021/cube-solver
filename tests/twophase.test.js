import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cube, randomScramble } from '../src/cube.js';
import { CubieCube, init, solve, validate } from '../src/twophase.js';

test('cubie representation composes the same way the geometric model does', () => {
  for (let i = 0; i < 30; i++) {
    const s = randomScramble(15);
    const viaGeometry = CubieCube.fromCube(new Cube().move(s));
    let viaMultiply = new CubieCube();
    for (const tok of s.split(' ')) {
      const one = CubieCube.fromCube(new Cube().turn(tok[0], 1));
      const q = tok.endsWith('2') ? 2 : tok.endsWith("'") ? 3 : 1;
      for (let k = 0; k < q; k++) viaMultiply = viaMultiply.multiply(one);
    }
    for (const f of ['cp', 'co', 'ep', 'eo']) assert.deepEqual([...viaMultiply[f]], [...viaGeometry[f]], `${f} after ${s}`);
  }
});

test('coordinate getters and setters are inverses', () => {
  const c = new CubieCube();
  for (const [coord, size] of [['twist', 2187], ['flip', 2048], ['slice', 495], ['cornerPerm', 40320], ['udEdgePerm', 40320], ['slicePerm', 24]]) {
    for (const v of [0, 1, 7, Math.floor(size / 3), size - 1]) {
      c[coord] = v;
      assert.equal(c[coord], v, `${coord} ${v}`);
    }
  }
});

test('orientation sums stay invariant under moves', () => {
  for (let i = 0; i < 20; i++) {
    const c = CubieCube.fromCube(new Cube().move(randomScramble(20)));
    assert.equal([...c.co].reduce((a, b) => a + b, 0) % 3, 0);
    assert.equal([...c.eo].reduce((a, b) => a + b, 0) % 2, 0);
  }
});

test('tables build and solve 30 random scrambles in about 20 moves each', () => {
  const t = performance.now();
  init();
  assert.ok(performance.now() - t < 15000, 'table generation should be quick');
  let longest = 0;
  for (let i = 0; i < 30; i++) {
    const s = randomScramble(30);
    const c = new Cube().move(s);
    const r = solve(c, { timeLimit: 1000 });
    assert.ok(c.clone().move(r.moves.join(' ')).isSolved(), `did not solve: ${s}`);
    assert.ok(r.phase1 >= 0 && r.phase1 <= r.moves.length);
    longest = Math.max(longest, r.moves.length);
  }
  assert.ok(longest <= 24, `two-phase solutions should be short, got ${longest}`);
});

test('solved cube and superflip', () => {
  assert.deepEqual(solve(new Cube()).moves, []);
  const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
  const c = new Cube().move(superflip);
  const r = solve(c, { timeLimit: 2000 });
  assert.ok(c.clone().move(r.moves.join(' ')).isSolved());
});

test('facelet round trip and the validator', () => {
  for (let i = 0; i < 20; i++) {
    const f = new Cube().move(randomScramble(20)).toFacelets();
    assert.equal(Cube.fromFacelets(f).toFacelets(), f);
    assert.ok(validate(Cube.fromFacelets(f)).ok);
  }
  const solved = new Cube().toFacelets().split('');
  const mutate = (pairs) => { const t = solved.slice(); for (const [i, c] of pairs) t[i] = c; return validate(Cube.fromFacelets(t.join(''))); };
  assert.match(mutate([[8, 'F'], [20, 'R'], [9, 'U']]).error, /twisted/);          // URF corner rotated
  assert.match(mutate([[7, 'F'], [19, 'U']]).error, /flipped/);                     // UF edge flipped
  assert.match(mutate([[7, 'L'], [19, 'U'], [3, 'F'], [37, 'U']]).error, /swapped/); // UF and UL swapped
  assert.match(mutate([[7, 'U'], [19, 'U']]).error, /exactly 9/);
  assert.throws(() => Cube.fromFacelets('UUU'));
});
