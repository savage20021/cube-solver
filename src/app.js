import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Cube, AXIS, FACES, COLOUR_HEX, parseAlg, formatMove, invertAlg, randomScramble } from './cube.js';

// ------------------------------------------------------------------ scene

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1115);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(5.2, 4.6, 6.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 16;

scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(4, 8, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-6, -3, -4);
scene.add(fill);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ cube meshes

const cube = new Cube();                      // the logical cube, source of truth
const bodyGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.1 });
const stickerGeo = roundedSquare(0.86, 0.1);
const stickerMats = COLOUR_HEX.map((hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45 }));

const Z = new THREE.Vector3(0, 0, 1);
const cubies = [];                            // index = logical cubie index
const stickerMeshes = [];                     // all sticker planes, for raycasting
for (const st of groupStickers(cube.stickers())) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bodyGeo, bodyMat));
  g.userData.stickers = st.map((s) => {
    const m = new THREE.Mesh(stickerGeo, stickerMats[s.colour]);
    m.userData = { cubie: s.cubie, colour: s.colour };
    g.add(m);
    stickerMeshes.push(m);
    return m;
  });
  cubies.push(g);
  scene.add(g);
}
syncFromModel();

function groupStickers(all) {
  const by = [];
  for (const s of all) (by[s.cubie] ??= []).push(s);
  return by;
}

function roundedSquare(size, r) {
  const h = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h); shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r); shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h); shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r); shape.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(shape, 6);
}

/** Put every mesh exactly where the logical model says it is. */
function syncFromModel() {
  for (let i = 0; i < cubies.length; i++) {
    const g = cubies[i];
    scene.attach(g);
    g.position.fromArray(cube.pos(i));
    g.quaternion.identity();
    for (const m of g.userData.stickers) {
      const n = new THREE.Vector3().fromArray(cube.normalOf(i, m.userData.colour));
      m.position.copy(n).multiplyScalar(0.487);
      m.quaternion.setFromUnitVectors(Z, n);
    }
  }
}

// ------------------------------------------------------------------ animation queue

const pivot = new THREE.Group();
scene.add(pivot);
let queue = [];                  // [{face, q, onDone}]
let current = null;              // {face, q, axis, angle, t0, dur, onDone}
const speedInput = document.getElementById('speed');
const durationFor = (q) => (q === 2 ? 1.5 : 1) * (1100 / Number(speedInput.value) ** 1.1);

function enqueue(alg, onDone) {
  const moves = parseAlg(alg);
  moves.forEach(([face, q], k) => queue.push({ face, q, onDone: k === moves.length - 1 ? onDone : null }));
}

function startNext() {
  const mv = queue.shift();
  if (!mv) return;
  const axis = new THREE.Vector3().fromArray(AXIS[mv.face]);
  for (const g of cubies) {
    if (Math.round(g.position.dot(axis)) === 1) pivot.attach(g);
  }
  current = { ...mv, axis, angle: -Math.PI / 2 * mv.q, t0: mv.t0 ?? performance.now(), dur: durationFor(mv.q) };
}

function finishCurrent() {
  cube.turn(current.face, current.q);
  pivot.quaternion.identity();
  syncFromModel();
  const done = current.onDone;
  current = null;
  updateBadge();
  if (done) done();
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function animate(now) {
  requestAnimationFrame(animate);
  // Finish as many moves as the clock says are due, so a paused tab catches up.
  for (let guard = 0; guard < 64; guard++) {
    if (!current) startNext();
    if (!current) break;
    const t = (now - current.t0) / current.dur;
    if (t < 1) {
      pivot.quaternion.setFromAxisAngle(current.axis, current.angle * easeInOut(Math.max(0, t)));
      break;
    }
    const nextStart = current.t0 + current.dur;
    finishCurrent();
    if (queue.length) queue[0].t0 = Math.max(nextStart, now - 400);
  }
  refreshButtons();
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

const busy = () => current !== null || queue.length > 0;
let wasBusy = null;
function refreshButtons() {
  const b = busy();
  if (b === wasBusy) return;
  wasBusy = b;
  for (const id of ['scramble', 'reset', 'solve', 'apply']) document.getElementById(id).disabled = b;
  for (const el of document.querySelectorAll('.faces button')) el.disabled = b;
}

// ------------------------------------------------------------------ clicking stickers

const raycaster = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6 || busy()) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(stickerMeshes, false)[0];
  if (!hit) return;
  const n = cube.normalOf(hit.object.userData.cubie, hit.object.userData.colour);
  const face = FACES.find((f) => AXIS[f].every((v, i) => v === n[i]));
  userMove(formatMove(face, e.shiftKey ? 3 : 1));
});

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const f = e.key.toUpperCase();
  if ('URFDLB'.includes(f) && f.length === 1 && !e.ctrlKey && !e.metaKey) userMove(formatMove(f, e.shiftKey ? 3 : 1));
});

// ------------------------------------------------------------------ panel

const $ = (id) => document.getElementById(id);
const badge = $('badge'), errorBox = $('error'), stepsBox = $('steps'), summary = $('summary'), playback = $('playback');
let solution = null;             // {steps, flat: [{move, step}], k}
let playing = false;

function updateBadge() {
  const solved = cube.isSolved();
  badge.textContent = solved ? 'Solved' : 'Scrambled';
  badge.classList.toggle('solved', solved);
}

function clearSolution() {
  solution = null;
  playing = false;
  playback.hidden = true;
  stepsBox.innerHTML = '';
  summary.textContent = '';
}

/** A move made by the user (click, key, button, or typed): drops any loaded solution. */
function userMove(alg) {
  if (busy()) return;
  clearSolution();
  enqueue(alg);
}

$('reset').onclick = () => {
  if (busy()) return;
  clearSolution();
  cube.d.set(new Cube().d);
  syncFromModel();
  updateBadge();
};

$('scramble').onclick = () => {
  if (busy()) return;
  clearSolution();
  const s = randomScramble(25);
  $('alg').value = s;
  enqueue(s);
};

$('apply').onclick = () => {
  errorBox.textContent = '';
  try { userMove($('alg').value); } catch (e) { errorBox.textContent = e.message; }
};
$('alg').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('apply').click(); });
for (const b of document.querySelectorAll('.faces button')) b.onclick = () => userMove(b.dataset.move);

// Solving happens in a worker so the cube keeps animating while it thinks.
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let tablesReady = false;
worker.postMessage({ type: 'init' });
worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'ready') { tablesReady = true; if (!solution && !summary.textContent) summary.textContent = ''; return; }
  $('solve').disabled = false;
  if (msg.type === 'error') { summary.textContent = 'Solver error: ' + msg.message; return; }
  solution = { steps: msg.steps, k: 0, flat: [], ms: msg.ms };
  msg.steps.forEach((st, si) => st.moves.forEach((move) => solution.flat.push({ move, step: si })));
  renderSteps();
  playback.hidden = false;
  playing = true;
  stepForward();
};
worker.onerror = (e) => { summary.textContent = 'Solver failed to load: ' + e.message; $('solve').disabled = false; };

$('solve').onclick = () => {
  if (busy()) return;
  if (cube.isSolved()) { summary.textContent = 'Already solved. Scramble it first.'; return; }
  clearSolution();
  $('solve').disabled = true;
  summary.textContent = tablesReady ? 'Thinking…' : 'Building lookup tables, then thinking…';
  worker.postMessage({ type: 'solve', method: $('method').value, data: Array.from(cube.d) });
};

function renderSteps() {
  stepsBox.innerHTML = '';
  let idx = 0;
  solution.steps.forEach((st, si) => {
    const div = document.createElement('div');
    div.className = 'step';
    div.dataset.step = si;
    div.innerHTML = `<div class="name">${si + 1}. ${st.name}</div><div class="moves">` +
      st.moves.map((m) => `<span class="mv" data-i="${idx++}">${m}</span>`).join(' ') + '</div>';
    stepsBox.appendChild(div);
  });
  updateStepHighlight();
}

function updateStepHighlight() {
  const k = solution.k, n = solution.flat.length;
  stepsBox.querySelectorAll('.mv').forEach((el) => {
    const i = Number(el.dataset.i);
    el.classList.toggle('done', i < k);
    el.classList.toggle('current', i === k);
  });
  const active = k < n ? solution.flat[k].step : -1;
  stepsBox.querySelectorAll('.step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === active));
  const cur = stepsBox.querySelector('.mv.current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  summary.textContent = `${n} moves in ${solution.steps.length} steps, found in ${solution.ms} ms · move ${Math.min(k, n)} of ${n}` +
    (k >= n ? ' · solved!' : '');
  $('play').textContent = playing ? '⏸ Pause' : '▶ Play';
  $('next').disabled = k >= n;
  $('prev').disabled = k === 0;
  $('first').disabled = k === 0;
}

function stepForward() {
  if (!solution || solution.k >= solution.flat.length || busy()) { playing = false; if (solution) updateStepHighlight(); return; }
  const { move } = solution.flat[solution.k];
  solution.k++;
  updateStepHighlight();
  enqueue(move, () => { if (playing) stepForward(); });
}

function stepBack() {
  if (!solution || solution.k === 0 || busy()) return;
  playing = false;
  solution.k--;
  updateStepHighlight();
  enqueue(invertAlg(solution.flat[solution.k].move));
}

$('next').onclick = () => { playing = false; stepForward(); };
$('prev').onclick = stepBack;
$('play').onclick = () => { playing = !playing; updateStepHighlight(); if (playing) stepForward(); };
$('first').onclick = () => {
  if (!solution || busy()) return;
  playing = false;
  const undo = solution.flat.slice(0, solution.k).map((f) => f.move).join(' ');
  solution.k = 0;
  updateStepHighlight();
  if (undo) {
    // Rewind instantly rather than animating a hundred moves backwards.
    cube.move(invertAlg(undo));
    syncFromModel();
    updateBadge();
  }
};

updateBadge();
