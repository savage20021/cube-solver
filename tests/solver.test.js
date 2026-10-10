import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cube, randomScramble } from '../src/cube.js';
import { solve, simplify } from '../src/solver.js';

test('a solved cube needs no moves', () => {
  const r = solve(new Cube());
  assert.deepEqual(r.moves, []);
});

test('simplify merges and cancels same-face turns', () => {
  assert.deepEqual(simplify(['U', 'U']), ['U2']);
  assert.deepEqual(simplify(['R', "R'"]), []);
  assert.deepEqual(simplify(['F2', 'F', 'U']), ["F'", 'U']);
  assert.deepEqual(simplify(['L', 'U', "U'", "L'"]), []);
});

test('solves 40 random scrambles, every solution verified by replay', () => {
  let longest = 0;
  for (let i = 0; i < 40; i++) {
    const s = randomScramble(25);
    const c = new Cube().move(s);
    const r = solve(c);
    assert.ok(c.clone().move(r.moves.join(' ')).isSolved(), `did not solve: ${s}`);
    assert.equal(r.moves.length, r.steps.reduce((n, st) => n + st.moves.length, 0));
    longest = Math.max(longest, r.moves.length);
  }
  assert.ok(longest < 200, `solutions should stay well under 200 moves, got ${longest}`);
});

test('solves the superflip and a checkerboard', () => {
  const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
  for (const s of [superflip, 'U2 D2 F2 B2 L2 R2']) {
    const c = new Cube().move(s);
    const r = solve(c);
    assert.ok(c.clone().move(r.moves.join(' ')).isSolved(), s);
  }
});
