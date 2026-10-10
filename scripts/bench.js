// Solve N random scrambles and report success rate, length and timing.
//   node scripts/bench.js 100
import { Cube, randomScramble } from '../src/cube.js';
import { solve } from '../src/solver.js';

const N = Number(process.argv[2] || 50);
let total = 0, longest = 0, fails = 0, worst = 0;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const s = randomScramble(25);
  const c = new Cube().move(s);
  const t = performance.now();
  const r = solve(c);
  worst = Math.max(worst, performance.now() - t);
  if (!c.clone().move(r.moves.join(' ')).isSolved()) { fails++; console.log('FAILED', s); }
  total += r.moves.length;
  longest = Math.max(longest, r.moves.length);
}
console.log({ scrambles: N, fails, avgMoves: +(total / N).toFixed(1), longest,
  avgMs: Math.round((performance.now() - t0) / N), worstMs: Math.round(worst) });
