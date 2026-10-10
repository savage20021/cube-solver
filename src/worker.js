/**
 * Web Worker: builds the two-phase tables and runs solves off the main thread,
 * so the 3D view keeps animating while the solver thinks.
 */
import { Cube } from './cube.js';
import { solve as beginner } from './solver.js';
import { init, solve as twophase } from './twophase.js';

self.onmessage = (e) => {
  const { id, type, data, method } = e.data;
  try {
    if (type === 'init') {
      const t = performance.now();
      init();
      self.postMessage({ id, type: 'ready', ms: Math.round(performance.now() - t) });
      return;
    }
    const cube = new Cube(Int8Array.from(data));
    const t = performance.now();
    let steps;
    if (method === 'beginner') {
      steps = beginner(cube).steps;
    } else {
      const r = twophase(cube, { timeLimit: 1500 });
      steps = [
        { name: 'Phase 1: orient every piece and bring the middle-layer edges home', moves: r.moves.slice(0, r.phase1) },
        { name: 'Phase 2: finish using only U, D and half turns', moves: r.moves.slice(r.phase1) },
      ].filter((s) => s.moves.length);
    }
    self.postMessage({ id, type: 'solution', steps, ms: Math.round(performance.now() - t) });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message });
  }
};
