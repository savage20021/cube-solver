import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cube, invertAlg, randomScramble, parseAlg, formatMove } from '../src/cube.js';

test('a fresh cube is solved and reads as the standard facelet string', () => {
  const c = new Cube();
  assert.ok(c.isSolved());
  assert.equal(c.toFacelets(), 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
});

test('single turns match the reference facelet layouts', () => {
  // Reference strings from the Kociemba facelet convention.
  assert.equal(new Cube().move('U').toFacelets(), 'UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB');
  assert.equal(new Cube().move('F').toFacelets(), 'UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB');
  assert.equal(new Cube().move('R').toFacelets(), 'UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
});

test('group identities hold', () => {
  for (const f of 'URFDLB') {
    assert.ok(new Cube().move(`${f} ${f} ${f} ${f}`).isSolved(), `${f}^4`);
    assert.ok(new Cube().move(`${f}2 ${f}2`).isSolved(), `${f}2^2`);
    assert.ok(new Cube().move(`${f} ${f}'`).isSolved(), `${f} ${f}'`);
  }
  assert.ok(new Cube().move("R U R' U' ".repeat(6)).isSolved(), 'sexy move has order 6');
  assert.ok(!new Cube().move("R U R' U'").isSolved());
});

test('a scramble followed by its inverse is the identity', () => {
  for (let i = 0; i < 20; i++) {
    const s = randomScramble(30);
    assert.ok(new Cube().move(s).move(invertAlg(s)).isSolved(), s);
  }
});

test('parseAlg and formatMove round-trip, and reject junk', () => {
  assert.deepEqual(parseAlg("R U' F2"), [['R', 1], ['U', 3], ['F', 2]]);
  assert.equal(parseAlg("R U' F2").map(([f, q]) => formatMove(f, q)).join(' '), "R U' F2");
  assert.throws(() => parseAlg('X'));
  assert.throws(() => parseAlg('R3'));
});

test('find and normalOf locate pieces geometrically', () => {
  const c = new Cube().move('R');
  const i = c.find([0, 1, 2]);              // the U-R-F corner
  assert.deepEqual(c.pos(i), [1, 1, -1]);   // R moves UFR to UBR
  assert.deepEqual(c.normalOf(i, 0), [0, 0, -1]); // its white sticker now faces back
});
