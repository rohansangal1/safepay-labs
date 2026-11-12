// Wireframe 3D scenes for the landing page, drawn with the 2D canvas API.
// Each scene illustrates one idea from the research in lines: payment messages, the checks
// they pass through, and what happens when one is fake. No libraries: the CSP allows only
// same-origin scripts, and a few hundred lines of projection code are all this needs.

const TAU = Math.PI * 2;
const CREAM = '243,237,226';
const GREY = '128,121,112';
const WHITE = '255,255,255';
const BLUE = '183,162,217';
const BG = '#121110';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ---------- Geometry ----------

const rotate = ([x, y, z], ax = 0, ay = 0, az = 0) => {
  let c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => scale(a, 1 / Math.hypot(...a));

const ring = (r, n = 96) => {
  const v = [], e = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; v.push([Math.cos(a) * r, Math.sin(a) * r, 0]); e.push([i, (i + 1) % n]); }
  return { v, e };
};

const sphere = (r, lat = 9, lon = 16, seg = 48) => {
  const v = [], e = [];
  for (let i = 1; i < lat; i++) {
    const phi = (i / lat) * Math.PI, y = Math.cos(phi) * r, rr = Math.sin(phi) * r, base = v.length;
    for (let j = 0; j < seg; j++) { const a = (j / seg) * TAU; v.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); e.push([base + j, base + ((j + 1) % seg)]); }
  }
  for (let j = 0; j < lon; j++) {
    const a = (j / lon) * TAU, base = v.length;
    for (let i = 0; i <= seg / 2; i++) { const phi = (i / (seg / 2)) * Math.PI; v.push([Math.cos(a) * Math.sin(phi) * r, Math.cos(phi) * r, Math.sin(a) * Math.sin(phi) * r]); if (i) e.push([base + i - 1, base + i]); }
  }
  return { v, e };
};

const icosahedron = (r) => {
  const p = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]].map((q) => scale(norm(q), r));
  const e = [];
  const edge = Math.hypot(...v[0].map((c, i) => c - v[1][i]));
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (Math.abs(Math.hypot(...v[i].map((c, k) => c - v[j][k])) - edge) < 1e-6) e.push([i, j]);
  return { v, e };
};

const box = (w, h, d) => {
  const v = [];
  for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) v.push([x, y, z]);
  const e = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if ([0, 1, 2].filter((k) => v[i][k] !== v[j][k]).length === 1) e.push([i, j]);
  return { v, e };
};

const torus = (R, r, nu = 48, nv = 12) => {
  const v = [], e = [];
  for (let i = 0; i < nu; i++) {
    const u = (i / nu) * TAU;
    for (let j = 0; j < nv; j++) {
      const w = (j / nv) * TAU;
      v.push([(R + r * Math.cos(w)) * Math.cos(u), r * Math.sin(w), (R + r * Math.cos(w)) * Math.sin(u)]);
      const k = i * nv + j;
      e.push([k, i * nv + ((j + 1) % nv)]);
      if (i % 2 === 0) e.push([k, ((i + 1) % nu) * nv + j]);
    }
  }
  return { v, e };
};

const fibonacciPoints = (n, r) => Array.from({ length: n }, (_, i) => {
  const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(a) * rr * r, y * r, Math.sin(a) * rr * r];
});

// ---------- Drawing ----------

// A view projects world points to the canvas with a simple perspective camera.
const makeView = (w, h, cx, cy, size, dist = 6) => ({
  project: ([x, y, z]) => { const f = dist / (dist + z); return [cx + x * size * f, cy - y * size * f, z]; },
  dist, size,
});

// Depth fades lines: near edges are bright, far edges recede.
const depthAlpha = (z, range) => clamp(0.62 - z / (range * 2.2), 0.08, 1);

const BUCKETS = 8;
const drawMesh = (ctx, view, mesh, xf, rgb, alpha = 1, width = 1, range = 2) => {
  const pts = mesh.v.map((p) => view.project(xf(p)));
  const paths = Array.from({ length: BUCKETS }, () => new Path2D());
  for (const [a, b] of mesh.e) {
    const pa = pts[a], pb = pts[b];
    const k = Math.min(BUCKETS - 1, Math.floor(depthAlpha((pa[2] + pb[2]) / 2, range) * BUCKETS));
    paths[k].moveTo(pa[0], pa[1]);
    paths[k].lineTo(pb[0], pb[1]);
  }
  ctx.lineWidth = width;
  paths.forEach((p, k) => { ctx.strokeStyle = `rgba(${rgb},${(((k + 0.5) / BUCKETS) * alpha).toFixed(3)})`; ctx.stroke(p); });
  return pts;
};

const dot = (ctx, x, y, r, rgb, a, glow = 0) => {
  ctx.fillStyle = `rgba(${rgb},${a})`;
  if (glow) { ctx.shadowColor = `rgba(${rgb},${a})`; ctx.shadowBlur = glow; }
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
};

const mix = (a, b, t) => a.split(',').map((c, i) => Math.round(lerp(+c, +b.split(',')[i], t))).join(',');

// ---------- Scenes ----------

// Hero: the app at the core, wrapped in rings of checks. Messages fly in; genuine ones reach
// the core, fake ones are stopped at a ring and shatter.
const hero = () => {
  const radii = [1.12, 1.48, 1.84];
  const tilts = [[0.35, 0.25, 0.5], [1.25, 0.9, -0.2], [1.95, -0.6, 0.55]];
  const speeds = [0.25, -0.18, 0.12];
  const rings = radii.map((r) => ring(r, 120));
  const ticks = radii.map((r) => {
    const v = [], e = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, c = Math.cos(a), s = Math.sin(a), l = i % 6 === 0 ? 0.12 : 0.05; v.push([c * r, s * r, 0], [c * (r + l), s * (r + l), 0]); e.push([i * 2, i * 2 + 1]); }
    return { v, e };
  });
  const core = icosahedron(0.55);
  const inner = sphere(0.3, 6, 10, 32);
  const shell = fibonacciPoints(220, 3.1);
  const flash = [0, 0, 0];
  let coreFlash = 0, coreGood = 0, spawnAt = 0;
  const msgs = [], shards = [];

  const spawn = (t) => {
    const dir = norm([Math.random() * 2 - 1, Math.random() * 1.4 - 0.7, Math.random() * 2 - 1]);
    const fake = Math.random() < 0.55;
    msgs.push({ dir, r: 3.6, born: t, fake, stopAt: fake ? 2 - Math.floor(Math.random() * 3) : -1, spin: (Math.random() - 0.5) * 0.9, trail: [] });
  };

  return (ctx, w, h, t, dt, input) => {
    const wide = w > 760;
    const size = Math.min(w, h) * (wide ? 0.24 : 0.2);
    const view = makeView(w, h, wide ? w * 0.38 : w * 0.5, h * (wide ? 0.5 : 0.36), size);
    const gx = 0.32 + input.y * 0.25, gy = t * 0.08 + input.x * 0.5;
    const world = (p) => rotate(p, gx, gy, 0);

    // Starry shell for depth.
    for (const p of shell) {
      const q = view.project(world(rotate(p, 0, t * 0.02, 0)));
      dot(ctx, q[0], q[1], 0.9, CREAM, (depthAlpha(q[2], 3.1) * 0.35).toFixed(3));
    }

    radii.forEach((r, i) => {
      const [ax, ay, az] = tilts[i];
      const xf = (p) => world(rotate(rotate(p, 0, 0, t * speeds[i]), ax, ay, az));
      const rgb = mix(CREAM, WHITE, flash[i]);
      drawMesh(ctx, view, rings[i], xf, rgb, 0.75 + flash[i] * 0.5, 1 + flash[i] * 1.2, 2);
      drawMesh(ctx, view, ticks[i], xf, rgb, 0.9, 1, 2);
      flash[i] = Math.max(0, flash[i] - dt * 1.6);
    });

    const pulse = 1 + coreFlash * 0.18;
    const coreRgb = mix(CREAM, BLUE, coreGood);
    drawMesh(ctx, view, core, (p) => world(rotate(scale(p, pulse), t * 0.3, t * 0.45, 0)), coreRgb, 1, 1.3, 0.6);
    drawMesh(ctx, view, inner, (p) => world(rotate(p, -t * 0.2, -t * 0.3, 0)), coreRgb, 0.45, 1, 0.4);
    const c0 = view.project(world([0, 0, 0]));
    const g = ctx.createRadialGradient(c0[0], c0[1], 0, c0[0], c0[1], size * (0.9 + coreFlash * 0.6));
    g.addColorStop(0, `rgba(${coreRgb},${0.12 + coreFlash * 0.25})`);
    g.addColorStop(1, `rgba(${coreRgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    coreFlash = Math.max(0, coreFlash - dt * 1.4);
    coreGood = Math.max(0, coreGood - dt * 0.9);

    if (t > spawnAt) { spawn(t); spawnAt = t + 0.5 + Math.random() * 0.5; }
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      m.r -= dt * (0.7 + (3.6 - m.r) * 0.25);
      const d = rotate(m.dir, 0, (3.6 - m.r) * m.spin, 0);
      const pos = scale(d, m.r);
      m.trail.push(pos);
      if (m.trail.length > 22) m.trail.shift();
      const stop = m.stopAt >= 0 ? radii[m.stopAt] : 0.55;
      const done = m.r <= stop;
      const pts = m.trail.map((p) => view.project(world(p)));
      for (let k = 1; k < pts.length; k++) {
        ctx.strokeStyle = `rgba(${mix(CREAM, BLUE, k / pts.length)},${((k / pts.length) ** 1.5).toFixed(3)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
      }
      const head = pts[pts.length - 1];
      dot(ctx, head[0], head[1], 3, BLUE, 1, 18);
      if (done) {
        if (m.fake) {
          flash[m.stopAt] = 1;
          for (let s = 0; s < 10; s++) shards.push({ p: pos, v: scale(norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]), 0.6 + Math.random() * 0.8), life: 1 });
        } else { coreFlash = 1; coreGood = 1; }
        msgs.splice(i, 1);
      }
    }

    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      const a = view.project(world(s.p));
      s.p = add(s.p, scale(s.v, dt));
      s.life -= dt * 1.3;
      const b = view.project(world(s.p));
      if (s.life <= 0) { shards.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${CREAM},${(s.life * 0.7).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] + (b[0] - a[0]) * 4, b[1] + (b[1] - a[1]) * 4); ctx.stroke();
      dot(ctx, b[0], b[1], 1.6, CREAM, s.life, 10);
    }
  };
};

// A message card: a thin slab with lines of "text" and a seal.
const card = () => {
  const m = box(1.6, 1, 0.08);
  for (const [y, len] of [[0.25, 0.9], [0.05, 1.1], [-0.15, 0.7]]) { m.v.push([-0.65, y, 0.05], [-0.65 + len, y, 0.05]); m.e.push([m.v.length - 2, m.v.length - 1]); }
  return m;
};

// Forged: a genuine card with an unbroken seal, and a copy beside it that glitches.
const forged = () => {
  const c = card();
  const seal = ring(0.16, 40);
  const broken = { v: seal.v, e: seal.e.filter((_, i) => i % 40 < 30) };
  return (ctx, w, h, t, dt, input) => {
    const view = makeView(w, h, w / 2, h / 2, Math.min(w, h) * 0.3);
    const ry = -0.5 + Math.sin(t * 0.6) * 0.25 + input.x * 0.4, rx = 0.25 + input.y * 0.2;
    const real = (o) => (p) => rotate(add(p, o), rx, ry, 0);
    drawMesh(ctx, view, c, real([-0.35, 0.3, -0.3]), CREAM, 0.95, 1.2);
    drawMesh(ctx, view, seal, (p) => rotate(add(p, [0.45, -0.25, -0.25]), rx, ry, 0), BLUE, 1, 1.4);
    const glitch = (t % 2.2) > 1.6;
    const jitter = () => (glitch ? (Math.random() - 0.5) * 0.14 : 0);
    const fake = (p) => rotate(add(p, [0.35 + jitter(), -0.3, 0.35]), rx, ry, 0);
    drawMesh(ctx, view, c, fake, GREY, glitch ? 0.5 + Math.random() * 0.5 : 0.85, 1.2);
    drawMesh(ctx, view, broken, (p) => rotate(add(p, [1.15 + jitter(), -0.85, 0.4]), rx, ry, 0), GREY, 1, 1.4);
  };
};

// Replayed: one message loops the same path, leaving echoes that would each count again.
const replayed = () => {
  const tor = torus(1.1, 0.34, 44, 8);
  return (ctx, w, h, t, dt, input) => {
    const view = makeView(w, h, w / 2, h / 2, Math.min(w, h) * 0.3);
    const rx = 0.9 + input.y * 0.25, ry = t * 0.15 + input.x * 0.4;
    const xf = (p) => rotate(p, rx, ry, 0);
    drawMesh(ctx, view, tor, xf, CREAM, 0.42, 1, 1.5);
    for (let k = 4; k >= 0; k--) {
      const a = t * 1.6 - k * 0.55;
      const p = view.project(xf([Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1]));
      if (k === 0) dot(ctx, p[0], p[1], 3.2, BLUE, 1, 18);
      else dot(ctx, p[0], p[1], 2.6 - k * 0.3, GREY, (0.9 - k * 0.16).toFixed(2), 10);
    }
  };
};

// Reordered: a stack of messages whose top and bottom keep trading places.
const reordered = () => {
  const plate = box(1.7, 0.1, 1.1);
  return (ctx, w, h, t, dt, input) => {
    const view = makeView(w, h, w / 2, h / 2, Math.min(w, h) * 0.3);
    const rx = 0.5 + input.y * 0.2, ry = 0.6 + t * 0.12 + input.x * 0.4;
    const cyc = t % 4;
    const swap = cyc < 1.4 ? 0 : cyc < 2.2 ? ease((cyc - 1.4) / 0.8) : cyc < 3.2 ? 1 : 1 - ease((cyc - 3.2) / 0.8);
    const arc = Math.sin(swap * Math.PI) * 1.1;
    const place = (y, x) => (p) => rotate(add(p, [x, y, 0]), rx, ry, 0);
    drawMesh(ctx, view, plate, place(lerp(0.55, -0.55, swap), arc), CREAM, 0.95, 1.2);
    drawMesh(ctx, view, plate, place(0, 0), CREAM, 0.5, 1);
    drawMesh(ctx, view, plate, place(lerp(-0.55, 0.55, swap), -arc), GREY, 0.95, 1.2);
  };
};

// Mismatched: a gate shaped for one thing. The right shape passes; the wrong one bounces.
const mismatched = () => {
  const gate = ring(0.62, 64);
  const frame = box(1.7, 1.7, 0.02);
  const good = sphere(0.42, 6, 10, 28);
  const bad = box(1.05, 1.05, 1.05);
  let flash = 0, flashRgb = BLUE;
  return (ctx, w, h, t, dt, input) => {
    const view = makeView(w, h, w / 2, h / 2, Math.min(w, h) * 0.28);
    const rx = 0.15 + input.y * 0.2, ry = -0.75 + input.x * 0.4;
    const xf = (p) => rotate(p, rx, ry, 0);
    const n = Math.floor(t / 3.2), c = (t % 3.2) / 3.2, isBad = n % 2 === 1;
    let z;
    if (!isBad) z = lerp(3, -3, ease(c));
    else z = c < 0.45 ? lerp(3, 0.62, ease(c / 0.45)) : lerp(0.62, 3, ease((c - 0.45) / 0.55));
    if (!isBad && Math.abs(z) < 0.15) { flash = 1; flashRgb = BLUE; }
    if (isBad && c > 0.43 && c < 0.47) { flash = 1; flashRgb = WHITE; }
    flash = Math.max(0, flash - dt * 1.5);
    drawMesh(ctx, view, frame, xf, CREAM, 0.35, 1);
    drawMesh(ctx, view, gate, xf, mix(CREAM, flashRgb, flash), 1, 1.4 + flash);
    const shape = isBad ? bad : good;
    const rgb = isBad ? mix(CREAM, GREY, clamp(1 - Math.abs(c - 0.45) * 3)) : BLUE;
    drawMesh(ctx, view, shape, (p) => xf(add(rotate(p, t * 0.8, t * 0.6, 0), [0, 0, z])), rgb, 0.9, 1.2);
  };
};

// Field: ridgelines of a measurement, with the odd spike flagged where harm shows up.
const field = () => {
  const rows = 34, cols = 90;
  return (ctx, w, h, t, dt, input) => {
    const view = makeView(w, h, w / 2, h * 0.5, Math.min(w * 0.2, h * 0.3), 5);
    const rx = -0.62 + input.y * 0.12, ry = input.x * 0.25;
    const spikeX = Math.sin(t * 0.35) * 1.6, spikeZ = Math.cos(t * 0.27) * 1.2;
    for (let r = 0; r < rows; r++) {
      const z = lerp(2.4, -2.4, r / (rows - 1));
      const pts = [];
      let hot = 0;
      for (let c = 0; c < cols; c++) {
        const x = lerp(-3, 3, c / (cols - 1));
        const env = Math.exp(-(x * x) / 3.2);
        let y = env * (0.16 * Math.sin(x * 2.2 + t + z * 1.3) + 0.1 * Math.sin(x * 4.7 - t * 1.3 + z * 2.1));
        const d2 = (x - spikeX) ** 2 + (z - spikeZ) ** 2;
        const spike = Math.exp(-d2 * 5) * 0.9;
        hot = Math.max(hot, spike);
        y += spike;
        pts.push(view.project(rotate([x, y, z], rx, ry, 0)));
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(pts[pts.length - 1][0], h);
      ctx.lineTo(pts[0][0], h);
      ctx.closePath();
      ctx.fillStyle = BG;
      ctx.fill();
      const a = clamp(0.25 + (r / rows) * 0.75);
      ctx.strokeStyle = `rgba(${mix(CREAM, BLUE, clamp(hot * 1.4))},${a.toFixed(3)})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
  };
};

// Globe: research shared openly, arcs travelling between points.
const globe = () => {
  const g = sphere(1.5, 12, 20, 64);
  const nodes = fibonacciPoints(26, 1.5);
  const arcs = Array.from({ length: 9 }, (_, i) => ({ a: nodes[(i * 7) % 26], b: nodes[(i * 11 + 5) % 26], off: i * 0.7 }));
  const slerpUp = (a, b, s) => {
    const p = norm([lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s)]);
    return scale(p, 1.5 * (1 + Math.sin(s * Math.PI) * 0.22));
  };
  return (ctx, w, h, t, dt, input) => {
    const wide = w > 760;
    const view = makeView(w, h, wide ? w * 0.74 : w * 0.5, wide ? h * 0.5 : h * 0.3, Math.min(w, h) * (wide ? 0.34 : 0.22));
    const xf = (p) => rotate(p, 0.35 + input.y * 0.2, t * 0.12 + input.x * 0.5, 0.2);
    drawMesh(ctx, view, g, xf, CREAM, 0.5, 1, 1.5);
    for (const n of nodes) {
      const p = view.project(xf(n));
      if (p[2] < 0.3) dot(ctx, p[0], p[1], 1.8, CREAM, depthAlpha(p[2], 1.5).toFixed(2), 8);
    }
    for (const arc of arcs) {
      const prog = ((t * 0.35 + arc.off) % 2) / 2;
      const head = clamp(prog * 1.6), tail = clamp(prog * 1.6 - 0.45);
      if (head <= tail) continue;
      ctx.beginPath();
      for (let s = tail; s <= head + 1e-6; s += 0.02) {
        const p = view.project(xf(slerpUp(arc.a, arc.b, s)));
        if (s === tail) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = `rgba(${BLUE},0.85)`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      const hp = view.project(xf(slerpUp(arc.a, arc.b, head)));
      dot(ctx, hp[0], hp[1], 2.4, BLUE, 1, 14);
    }
  };
};

const SCENES = { hero, forged, replayed, reordered, mismatched, field, globe };

// ---------- Runner ----------

// Mount every <canvas data-scene>: size it to its box, animate only while on screen, follow the
// pointer gently, and draw a single still frame when reduced motion is requested.
export const mountScenes = ({ reduceMotion = false } = {}) => {
  for (const canvas of document.querySelectorAll('canvas[data-scene]')) {
    const make = SCENES[canvas.dataset.scene];
    if (!make) continue;
    const draw = make();
    const ctx = canvas.getContext('2d');
    const host = canvas.parentElement;
    const input = { x: 0, y: 0, tx: 0, ty: 0 };
    let w = 0, h = 0, visible = false, raf = 0, last = 0, t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) frame(0, 6);
    };
    const frame = (dt, at) => {
      if (at !== undefined) t = at;
      ctx.clearRect(0, 0, w, h);
      input.x += (input.tx - input.x) * 0.06;
      input.y += (input.ty - input.y) * 0.06;
      draw(ctx, w, h, t, dt, input);
    };
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      t += dt;
      frame(dt);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    new ResizeObserver(resize).observe(canvas);
    if (reduceMotion) continue;
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }, { rootMargin: '100px' }).observe(canvas);
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      input.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      input.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    host.addEventListener('pointerleave', () => { input.tx = 0; input.ty = 0; });
  }
};
