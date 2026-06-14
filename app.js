/* ============================================================
   Rosemount Tank Gauging — 3D terminal flyover
   A camera flies over a clay-rendered storage terminal while a
   glowing signal line routes through the scene from the radar
   gauge to the control room. Scroll scrubs the whole journey.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene');
const loader = document.getElementById('loader');

/* ---------------- renderer / scene ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;

// clip plane that slices the hero tank open toward the camera during step 02
// (constant pushed far out = nothing clipped = a normal closed tank)
const heroPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);

const scene = new THREE.Scene();
const SKY = new THREE.Color('#e7eef7');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 55, 340);

const camera = new THREE.PerspectiveCamera(36, 2, 0.1, 400);
camera.position.set(30, 24, 34);

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight('#ffffff', '#c4cedd', 0.95));
const sun = new THREE.DirectionalLight('#ffffff', 1.5);
sun.position.set(24, 40, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
sun.shadow.bias = -0.0004;
sun.shadow.radius = 5;
scene.add(sun);

/* ---------------- materials (clay) ---------------- */
const clay   = new THREE.MeshStandardMaterial({ color: '#eef2f8', roughness: .95, metalness: 0 });
const clayHi = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85, metalness: 0 });
const claySoft = new THREE.MeshStandardMaterial({ color: '#dce3ee', roughness: 1, metalness: 0 });
const accentCyan = new THREE.MeshStandardMaterial({ color: '#2bb6e6', roughness: .5, metalness: .1, emissive: '#0a3a4a', emissiveIntensity: .4 });
// hero-tank materials — clipped by heroPlane so ONLY the hero tank opens up
const heroShellMat = new THREE.MeshStandardMaterial({ color: '#eef2f8', roughness: .92, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [heroPlane], clipShadows: true });
const heroRingMat = new THREE.MeshStandardMaterial({ color: '#dce3ee', roughness: 1, metalness: 0, clippingPlanes: [heroPlane] });
const heroLiquidMat = new THREE.MeshStandardMaterial({ color: '#4fc4ec', roughness: .25, metalness: 0, transparent: true, opacity: .55, side: THREE.DoubleSide, clippingPlanes: [heroPlane] });
// interior features (NOT clipped — fully shown once the shell opens, hidden inside the closed shell otherwise)
const probeMat = new THREE.MeshStandardMaterial({ color: '#c9d3e0', roughness: .5, metalness: .3 });
const beadMat = new THREE.MeshStandardMaterial({ color: '#2bb6e6', roughness: .4, emissive: '#0a3a4a', emissiveIntensity: .6 });
const waveMat = new THREE.MeshBasicMaterial({ color: '#39c6ef', transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide });

/* ---------------- ground ---------------- */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: '#e3e9f2', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---------------- builders ---------------- */
const world = new THREE.Group();
scene.add(world);

// shared flat roof + gauge for a solid tank
function tankRoofAndGauge(g, r, h, accent) {
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 60), claySoft);
  rim.rotation.x = Math.PI / 2; rim.position.y = h; g.add(rim);
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16), claySoft);
  noz.position.set(r * 0.45, h + 0.25, 0); g.add(noz);
  const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), accent ? accentCyan : claySoft);
  gauge.position.set(r * 0.45, h + 0.72, 0); gauge.castShadow = true; g.add(gauge);
}

function tank(x, z, r, h, accent, cutaway) {
  const g = new THREE.Group();
  if (cutaway) { buildCutawayTank(g, r, h); }
  else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), clay);
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    for (let i = 1; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.04, 8, 56), claySoft);
      ring.rotation.x = Math.PI / 2; ring.position.y = (h / 4) * i; g.add(ring);
    }
    tankRoofAndGauge(g, r, h, accent);
  }
  g.position.set(x, 0, z);
  g.userData.gaugeWorld = new THREE.Vector3(x + r * 0.45, h + 0.72, z);
  g.userData.top = h;
  world.add(g);
  return g;
}

// the hero tank: a normal closed tank that, during step 02 only, is sliced open
// toward the camera (via heroPlane) to reveal the radar waves and the 2240S
// multi-spot temperature probe inside the product.
function buildCutawayTank(g, r, h) {
  const fillH = h * 0.56;
  // closed shell (clipped open only at step 02) — double-sided so the inner wall shows when cut
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64), heroShellMat);
  shell.position.y = h / 2; shell.castShadow = true; shell.receiveShadow = true; g.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 60), heroRingMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = h; g.add(rim);
  for (let i = 1; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.04, 8, 56), heroRingMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = (h / 4) * i; g.add(ring);
  }
  // product (translucent) — also clipped, so the cut reveals the fill level
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.985, r * 0.985, fillH, 64), heroLiquidMat);
  liquid.position.y = fillH / 2; g.add(liquid);

  // radar gauge (5900S) on top + descending waves to the surface (waves shown only at step 02)
  const gx = r * 0.5;
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16), claySoft);
  noz.position.set(gx, h + 0.25, 0); g.add(noz);
  const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), accentCyan);
  gauge.position.set(gx, h + 0.72, 0); gauge.castShadow = true; g.add(gauge);
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 40), waveMat.clone());
    w.rotation.x = Math.PI / 2; w.position.set(gx, h, 0); g.add(w); waves.push(w);
  }

  // 2240S multi-spot temperature probe, hanging through the product near the cut face
  const px = -r * 0.2, pz = r * 0.1;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h - 0.4, 12), probeMat);
  rod.position.set(px, (h - 0.4) / 2 + 0.2, pz); g.add(rod);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), accentCyan);
  head.position.set(px, h + 0.5, pz); head.castShadow = true; g.add(head);
  const hnoz = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 12), claySoft);
  hnoz.position.set(px, h + 0.15, pz); g.add(hnoz);
  for (let i = 0; i < 8; i++) {                       // spot elements down the probe
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), beadMat);
    bead.position.set(px, 0.7 + i * (h - 1.2) / 7, pz); g.add(bead);
  }

  g.userData.waves = waves;
  g.userData.gaugeY = h; g.userData.surfaceY = fillH; g.userData.r = r;
}

function box(x, z, w, h, d, mat = clay) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
  world.add(m); return m;
}

function building(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(9, 4.2, 11), clayHi);
  base.position.y = 2.1; base.castShadow = true; base.receiveShadow = true; g.add(base);

  g.position.set(x, 0, z);
  world.add(g);

  return g;
}

function pipeRack(x1, z1, x2, z2, n = 4) {
  const g = new THREE.Group();
  const dx = x2 - x1, dz = z2 - z1; const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 12), claySoft);
    p.rotation.z = Math.PI / 2; p.rotation.y = -ang;
    p.position.set((x1 + x2) / 2, 0.55 + i * 0.32, (z1 + z2) / 2);
    p.castShadow = true; g.add(p);
  }
  world.add(g); return g;
}

function coolingTower(x, z) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; const r = 2.4 - Math.sin(t * Math.PI) * 1.1; pts.push(new THREE.Vector2(r, t * 6)); }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), clayHi);
  m.position.set(x, 0, z); m.castShadow = true; m.receiveShadow = true; world.add(m); return m;
}

function figure(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), claySoft);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), claySoft);
  head.position.y = 1.05; g.add(head);
  g.position.set(x, 0, z); g.rotation.y = Math.random() * Math.PI; world.add(g); return g;
}

/* ---------------- lay out the terminal ---------------- */
const heroTank = tank(0, 0, 3.2, 7.5, true, true);   // the star — cutaway: radar + waves + temp probe
const tankB = tank(12.825, 4.05, 3.8, 9, false);
const tankC = tank(-10.125, 6.75, 2.6, 6, false);
const tankD = tank(4.05, 17.55, 4.4, 6.5, false);
const tankE = tank(-12.15, -8.1, 3, 8.5, false);

// tank hub (2410) — junction box at base of hero tank
const hub2410 = box(3.4, 1.5, 0.9, 1.3, 0.6, accentCyan);
hub2410.userData = { p: new THREE.Vector3(3.4, 1.3, 1.5) };
// system hub (2460) — cabinet on the way to the building
const hub2460 = box(14.175, 14.85, 1.2, 1.8, 0.8, accentCyan);
hub2460.userData = { p: new THREE.Vector3(14.175, 1.6, 14.85) };

const ctrl = building(24, 23);

pipeRack(3.4, 1.5, 14.175, 14.85);
pipeRack(14.175, 14.85, 23.5, 22.5);
pipeRack(0, 0, 12.825, 4.05, 3);

coolingTower(34, -6); coolingTower(38, -2);
tank(-24, -14, 3.4, 9, false); tank(-30, -4, 2.8, 6.5, false);
tank(-20, -22, 3, 7.5, false); tank(-31, -20, 2.4, 5.5, false);
for (let i = 0; i < 14; i++) figure(-14 + Math.random() * 40, -18 + Math.random() * 40);

/* ---------------- the glowing signal path ---------------- */
const wp = [
  heroTank.userData.gaugeWorld.clone(),            // at the radar
  new THREE.Vector3(1.4, 6.6, 0.4),
  new THREE.Vector3(2.8, 3.2, 0.9),
  new THREE.Vector3(3.4, 1.6, 1.5),                // tank hub 2410
  new THREE.Vector3(8.3, 1.0, 7.6),
  new THREE.Vector3(14.175, 1.2, 14.85),           // system hub 2460
  new THREE.Vector3(19.0, 1.0, 18.8),
  new THREE.Vector3(23.8, 2.0, 22.8),              // control room entrance
];
const curve = new THREE.CatmullRomCurve3(wp, false, 'catmullrom', 0.5);
const TUBE_SEG = 400;
const tubeGeo = new THREE.TubeGeometry(curve, TUBE_SEG, 0.11, 10, false);
const tubeMat = new THREE.MeshBasicMaterial({ color: '#39c6ef', toneMapped: false });
const tube = new THREE.Mesh(tubeGeo, tubeMat);
scene.add(tube);
const tubeIndexCount = tubeGeo.index.count;
tubeGeo.setDrawRange(0, 0);

// soft under-glow tube (fat, faint)
const glowGeo = new THREE.TubeGeometry(curve, TUBE_SEG, 0.26, 10, false);
const glowMat = new THREE.MeshBasicMaterial({ color: '#7fe0ff', transparent: true, opacity: 0.18, toneMapped: false });
const glowTube = new THREE.Mesh(glowGeo, glowMat);
scene.add(glowTube);
glowGeo.setDrawRange(0, 0);

// the travelling pulse
const comet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
scene.add(comet);
const halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 20), new THREE.MeshBasicMaterial({ color: '#6fd8ff', transparent: true, opacity: .45, toneMapped: false }));
scene.add(halo);

// dot field under the path (vectr-style)
const dotGeo = new THREE.CircleGeometry(0.12, 12);
const dotMat = new THREE.MeshBasicMaterial({ color: '#5fc8ee', transparent: true, opacity: .5, toneMapped: false });
const dots = new THREE.InstancedMesh(dotGeo, dotMat, 260);
const m4 = new THREE.Matrix4();
for (let i = 0; i < 260; i++) {
  const t = Math.random();
  const p = curve.getPoint(t);
  const off = new THREE.Vector3((Math.random() - .5) * 4.5, 0, (Math.random() - .5) * 4.5);
  m4.makeRotationX(-Math.PI / 2);
  m4.setPosition(p.x + off.x, 0.02, p.z + off.z);
  dots.setMatrixAt(i, m4);
}
dots.instanceMatrix.needsUpdate = true;
scene.add(dots);

/* ---------------- regional layer (sites + HQ network; fades in when zoomed out) ---------------- */
const regional = new THREE.Group();
regional.visible = false;
scene.add(regional);

// faint map grid that reads when you pull back to the region
const grid = new THREE.GridHelper(440, 44, 0x6f93c2, 0xa9bedb);
grid.material.transparent = true; grid.material.opacity = 0; grid.position.y = 0.03;
regional.add(grid);

// remote sites — small clay tank farms (with their own gauges) scattered across the region
const remoteClay = new THREE.MeshStandardMaterial({ color: '#d7e2f0', roughness: .96, metalness: 0, transparent: true, opacity: 0, emissive: '#3a4a5e', emissiveIntensity: .18 });
const remoteCyan = new THREE.MeshBasicMaterial({ color: '#39c6ef', transparent: true, opacity: 0, toneMapped: false });
// ground "site pad" ring — makes each location read as a marker on the map, even from steep angles
const padMat = new THREE.MeshBasicMaterial({ color: '#39c6ef', transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide });
function miniSite(cx, cz) {
  const g = new THREE.Group();
  const specs = [[0, 0, 3.3, 6.9, remoteCyan], [7.5, 2.2, 2.4, 5.1, remoteCyan], [-6, 3, 2.8, 5.8, null], [2.2, -6, 2.1, 4.5, null]];
  specs.forEach(([x, z, r, h, gaugeMat]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), remoteClay);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; g.add(b);
    if (gaugeMat) {
      const gauge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), gaugeMat);
      gauge.position.set(x + r * 0.4, h + 0.4, z); g.add(gauge);
    }
  });
  const pad = new THREE.Mesh(new THREE.RingGeometry(7, 7.8, 48), padMat);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.04; g.add(pad);
  g.position.set(cx, 0, cz);
  g.userData.top = new THREE.Vector3(cx, 0.3, cz);
  regional.add(g);
  return g;
}
const remoteSpots = [[-58, -34], [64, -48], [78, 28], [-44, 68], [33, 80], [-80, 12]];
const sites = remoteSpots.map(([x, z]) => miniSite(x, z));

// HQ — a glowing ground hub at the centre of the region, marked by a halo ring
const hqPos = new THREE.Vector3(16, 0, 12);
const hqTopPos = new THREE.Vector3(16, 0.5, 12);
const hqRingMat = new THREE.MeshBasicMaterial({ color: '#39c6ef', transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide });
const hqRing = new THREE.Mesh(new THREE.TorusGeometry(6, 0.18, 10, 64), hqRingMat);
hqRing.position.set(hqPos.x, 0.06, hqPos.z); hqRing.rotation.x = Math.PI / 2; regional.add(hqRing);
const hqPad = new THREE.Mesh(new THREE.RingGeometry(8.5, 9.3, 48), padMat);
hqPad.rotation.x = -Math.PI / 2; hqPad.position.set(hqPos.x, 0.04, hqPos.z); regional.add(hqPad);

// glowing connection arcs: every site (+ the main terminal) up to HQ
const arcMat = new THREE.MeshBasicMaterial({ color: '#39c6ef', transparent: true, opacity: 0, toneMapped: false });
const pulseMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, toneMapped: false });
const arcs = [];
[new THREE.Vector3(8, 0.3, 8), ...sites.map(s => s.userData.top)].forEach(origin => {
  const mid = origin.clone().lerp(hqTopPos, 0.5); mid.y += 1.2;   // a gentle ground-hugging rise, not an airborne arc
  const c = new THREE.QuadraticBezierCurve3(origin, mid, hqTopPos.clone());
  const geo = new THREE.TubeGeometry(c, 60, 0.13, 8, false);
  geo.setDrawRange(0, 0);
  regional.add(new THREE.Mesh(geo, arcMat));
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), pulseMat);
  pulse.visible = false; regional.add(pulse);
  arcs.push({ curve: c, geo, idx: geo.index.count, pulse, off: Math.random() });
});

/* ---------------- camera keyframes ---------------- */
const camPos = new THREE.CatmullRomCurve3([
  new THREE.Vector3(33, 27, 41),     // 0 establishing wide
  new THREE.Vector3(11, 13, 15),     // 1 over the radar
  new THREE.Vector3(8, 9, 11),       // 2 cross-section: probe in the product
  new THREE.Vector3(7.5, 5, 10),     // 3 down to tank hub
  new THREE.Vector3(16.175, 6.5, 20.85),  // 4 along to system hub
  new THREE.Vector3(45, 22, 51),     // 5 control room
  new THREE.Vector3(34, 46, 58),     // 6 local site overview (pull up & back)
  new THREE.Vector3(67, 99, 137),    // 7 regional multi-site (high, wide map view — fits all remote sites)
]);
const camLook = new THREE.CatmullRomCurve3([
  new THREE.Vector3(4, 3.5, 4),
  new THREE.Vector3(0, 6, 0),
  new THREE.Vector3(-0.5, 3.8, 0.3),  // 2 look into the cross-section
  new THREE.Vector3(3.4, 1.6, 2),
  new THREE.Vector3(14.675, 1.5, 14.85),
  new THREE.Vector3(24, 4.5, 24),     // 5 control room
  new THREE.Vector3(6, 1, 8),         // 6 whole single site
  new THREE.Vector3(2, 2, 16),        // 7 region centre (sites + HQ)
]);

/* ---------------- scroll → progress ---------------- */
const flyover = document.getElementById('flyover');
const steps = [...document.querySelectorAll('#steps li')];
const intro = document.getElementById('intro');
const scrollcue = document.getElementById('scrollcue');
const railFill = document.getElementById('railFill');
let target = 0, current = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* Dark-act reveals + counters. Driven from BOTH the scroll handler and the
   render loop, because in some headless/background contexts rAF is suspended
   while scroll events still fire (and vice-versa). Defined before the scroll
   handler so the initial computeTarget() can call it safely. */
const revealEls = [...document.querySelectorAll('[data-scene]')];
let countersDone = false;
function runCounters(root) {
  root.querySelectorAll('.count').forEach(el => {
    const to = +el.dataset.to, dur = 1400, t0 = performance.now();
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e).toLocaleString();
      if (k >= 1) clearInterval(id);
    }, 16);
  });
  const spark = document.getElementById('spark');
  if (spark) {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const x = (i / 30) * 300, y = 70 - (Math.sin(i / 3) * 14 + i * 0.9 + Math.random() * 4);
      pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
    }
    spark.setAttribute('points', pts.join(' '));
  }
}
function updateReveals() {
  const vh = innerHeight;
  for (const el of revealEls) {
    if (!el.classList.contains('in') && el.getBoundingClientRect().top < vh * 0.82) el.classList.add('in');
  }
  if (!countersDone && document.getElementById('software').getBoundingClientRect().top < vh * 0.55) {
    countersDone = true; runCounters(document.getElementById('software'));
  }
}

const topbar = document.querySelector('.topbar');
function computeTarget() {
  const r = flyover.getBoundingClientRect();
  const span = flyover.offsetHeight - innerHeight;
  target = clamp(-r.top / span, 0, 1);
  // topbar switches to light text once the dark act covers the top
  topbar.classList.toggle('over-dark', r.bottom <= innerHeight * 0.6);
  updateReveals();
}
addEventListener('scroll', computeTarget, { passive: true });

/* ---------------- resize ---------------- */
let composer;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}
addEventListener('resize', resize);

/* ---------------- post (bloom) ---------------- */
composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.55, 0.78);
composer.addPass(bloom);
resize();

/* ---------------- step highlight ---------------- */
// map flyover progress to a step. Keyframe i sits at p = i/7, so the steps
// (keyframes 1..7) land on these beats; small lead-in switches just before.
function activeStep(p) {
  const beats = [1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 7 / 7];
  let idx = 0;
  for (let i = 0; i < beats.length; i++) if (p >= beats[i] - 0.07) idx = i;
  return idx;
}
let lastStep = -1;

/* ---------------- scene update (shared by loop + debug capture) ---------------- */
const tmpLook = new THREE.Vector3();
const heroDir = new THREE.Vector3();
function updateScene(p, t, tp = p) {
  // camera along its curve
  camera.position.copy(camPos.getPoint(p));
  camLook.getPoint(p, tmpLook);
  camera.lookAt(tmpLook);
  // widen the lens as we pull back, for a map-like regional view
  const fovP = clamp((p - 5 / 7) / (2 / 7), 0, 1);
  camera.fov = 36 + fovP * 24;
  camera.updateProjectionMatrix();

  // the field→control-room signal draws in and completes at the control room (p≈5/7)
  const pathP = clamp((p - 0.05) / (5 / 7 - 0.05), 0, 1);
  const drawTo = Math.floor(tubeIndexCount * pathP);
  tubeGeo.setDrawRange(0, drawTo);
  glowGeo.setDrawRange(0, drawTo);
  if (pathP > 0.001 && pathP < 0.999) {
    const cp = curve.getPoint(pathP);
    comet.position.copy(cp); halo.position.copy(cp);
    comet.visible = halo.visible = true;
    halo.scale.setScalar(1 + Math.sin(t * 0.006) * 0.18);
  } else { comet.visible = halo.visible = false; }

  // ---- step 02: slice the hero tank open toward the camera (cross-section) ----
  const hv = heroTank.userData;
  // keyed off the scroll target (not the lag-smoothed camera value) so the slice
  // opens exactly on schedule: starts opening halfway through step 01 (tp=1.5/7),
  // fully open at the temperature beat (tp=2/7), then closes.
  const s2 = Math.min(
    clamp((tp - 1.5 / 7) / (0.5 / 7), 0, 1),                  // ramp up: 0 until halfway in, 1 by step 02
    clamp(1 - (tp - 2 / 7) / 0.085, 0, 1));                   // ramp down after the beat
  // plane normal points away from the camera, so the camera-facing half is removed
  heroDir.set(camera.position.x, 0, camera.position.z).normalize();
  heroPlane.normal.set(-heroDir.x, 0, -heroDir.z);
  heroPlane.constant = (1 - s2) * (hv.r + 1.4);              // pushed out (closed) → through centre (open)
  // radar waves only while the cross-section is open
  const span = hv.gaugeY - hv.surfaceY, n = hv.waves.length;
  hv.waves.forEach((w, i) => {
    const ph = ((t * 0.0006) + i / n) % 1;                   // 0 at gauge → 1 at surface
    w.position.y = hv.gaugeY - ph * span;
    const sc = 0.5 + ph * 0.85; w.scale.set(sc, sc, 1);
    w.material.opacity = s2 * (1 - ph * 0.7) * 0.85;
  });

  // ---- regional layer: sites fade in, then the HQ network draws ----
  scene.fog.far = lerp(340, 760, clamp((p - 0.6) / 0.32, 0, 1));   // let the region read clearly when pulled back
  const reg = clamp((p - 5 / 7) / (2 / 7), 0, 1);     // sites + map grid — stays hidden through step 05
  regional.visible = reg > 0.001;
  if (regional.visible) {
    remoteClay.opacity = reg;
    remoteCyan.opacity = reg;
    padMat.opacity = reg * 0.6;
    grid.material.opacity = reg * 0.7;
    hqRingMat.opacity = reg * 0.8;
    hqRing.rotation.z += 0.012;
    const arcP = clamp((p - 0.74) / 0.2, 0, 1);   // connection arcs + data pulses
    arcMat.opacity = arcP * 0.85;
    for (const a of arcs) {
      a.geo.setDrawRange(0, Math.floor(a.idx * arcP));
      if (arcP > 0.02) {
        a.pulse.visible = true;
        a.pulse.position.copy(a.curve.getPoint((t * 0.00018 + a.off) % 1));
        a.pulse.material.opacity = arcP;
      } else a.pulse.visible = false;
    }
  }
}

/* ---------------- render loop ---------------- */
function frame(t) {
  current = lerp(current, target, reduce ? 1 : 0.075);
  const p = current;
  updateScene(p, t, target);

  // overlay state
  intro.style.opacity = clamp(1 - p * 7, 0, 1);
  scrollcue.style.opacity = clamp(1 - p * 7, 0, 1);
  railFill.style.width = (p * 100).toFixed(1) + '%';
  const s = activeStep(p);
  if (s !== lastStep) {
    steps.forEach((li, i) => li.classList.toggle('on', i === s));
    lastStep = s;
  }
  // steps fade in once we're past the intro
  document.getElementById('steps').style.opacity = clamp((p - 0.04) * 10, 0, 1);

  updateReveals();

  composer.render();
  requestAnimationFrame(frame);
}

/* kick off once three is ready */
loader.style.display = 'none';
computeTarget();
resize();
requestAnimationFrame(frame);
updateReveals();
