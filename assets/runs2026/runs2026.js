(() => {
  'use strict';

  const DATA_URL = document.currentScript.dataset.src;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const track = document.getElementById('track');
  const intro = document.querySelector('.intro');
  const introCount = document.getElementById('intro-count');
  const hud = document.getElementById('hud');
  const hudBody = document.getElementById('hud-body');
  const hudFinal = document.getElementById('hud-final');
  const hudKm = document.getElementById('hud-km');
  const toggle = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const THEMES = {
    light: {
      bg: '#f0efe9', trace: '194,74,51', race: '112,120,132', road: '60,64,72', lake: '58,90,128', label: '118,123,133',
      wallFill: 0.16, raceFill: 0.24, mapLine: 0.42, roadA: 0.15, streetA: 0.075, lakeA: 0.5,
    },
    dark: {
      bg: '#0e0f12', trace: '226,106,82', race: '196,201,208', road: '160,164,172', lake: '140,164,190', label: '140,137,129',
      wallFill: 0.2, raceFill: 0.3, mapLine: 0.46, roadA: 0.16, streetA: 0.075, lakeA: 0.42,
    },
  };
  let theme = THEMES.light;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DEG = Math.PI / 180;
  const PHI_TOWER = 16 * DEG;
  const PHI_ISO = Math.atan(1 / Math.SQRT2);
  const PHI_TOP = 90 * DEG;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t;
  const smooth = t => t * t * (3 - 2 * t);
  const mdy = d => d.slice(4, 6) + d.slice(6, 8) + d.slice(0, 4);
  const words = d => `${MONTHS[+d.slice(4, 6) - 1]} ${+d.slice(6, 8)} ${d.slice(0, 4)}`;

  let routes = [];
  let N = 0;
  let lake = [];
  let roads = [];
  let streets = [];
  let meta = null;
  let TX = 0, TY = 0;
  let W = 0, H = 0, dpr = 1;
  let L = null;
  let pending = false;
  let hudMode = '';
  let liveText = '';

  // ---------- data ----------

  function flat(line) {
    const f = new Float64Array(line.length * 2);
    line.forEach(([x, y], j) => { f[2 * j] = x; f[2 * j + 1] = y; });
    return f;
  }

  function prepare(data) {
    meta = data.meta;
    routes = data.runs.map((r, i) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of r.p) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const n = r.p.length;
      return {
        i, d: r.d, k: r.k, t: r.t, m: r.m === 1, n, f: flat(r.p),
        cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0,
        g: new Float32Array(2 * n), b: new Float32Array(2 * n), tp: new Float32Array(2 * n),
      };
    });
    N = routes.length;
    TX = routes.reduce((a, r) => a + r.cx, 0) / N;
    TY = routes.reduce((a, r) => a + r.cy, 0) / N;
    const under = line => ({ n: line.length, f: flat(line), b: new Float32Array(2 * line.length) });
    lake = (data.lake || []).map(under);
    roads = (data.roads || []).map(under);
    streets = (data.streets || []).map(under);
  }

  // ---------- camera ----------

  function view(c) {
    const ct = Math.cos(c.th), st = Math.sin(c.th), sp = Math.sin(c.ph), cp = Math.cos(c.ph);
    const [tx, ty, tz] = c.t;
    return {
      ct, st, sp, cp, k: c.k, ax: c.a[0], ay: c.a[1],
      px: tx * ct - ty * st,
      py: (tx * st + ty * ct) * sp - tz * cp,
    };
  }

  function projectInto(v, f, n, dx, dy, z, out) {
    const { ct, st, sp, k, ax, ay, px, py } = v;
    const zc = z * v.cp;
    for (let j = 0; j < n; j++) {
      const x = f[2 * j] + dx, y = f[2 * j + 1] + dy;
      out[2 * j] = ax + k * (x * ct - y * st - px);
      out[2 * j + 1] = ay + k * ((x * st + y * ct) * sp - zc - py);
    }
  }

  function mix(A, B, u) {
    return {
      th: lerp(A.th, B.th, u),
      ph: lerp(A.ph, B.ph, u),
      k: A.k * Math.pow(B.k / A.k, u),
      t: [lerp(A.t[0], B.t[0], u), lerp(A.t[1], B.t[1], u), lerp(A.t[2], B.t[2], u)],
      a: [lerp(A.a[0], B.a[0], u), lerp(A.a[1], B.a[1], u)],
    };
  }

  // Scale and ground-plane target that frame every route, flat on the ground, in a box.
  function fitGround(th, ph, boxW, boxH) {
    const ct = Math.cos(th), st = Math.sin(th), sp = Math.sin(ph);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of routes) {
      for (let j = 0; j < r.n; j += 2) {
        const x = r.f[2 * j], y = r.f[2 * j + 1];
        const sx = x * ct - y * st, sy = (x * st + y * ct) * sp;
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
        if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
      }
    }
    const k = Math.min(boxW / (x1 - x0), boxH / (y1 - y0));
    const xr = (x0 + x1) / 2, yr = (y0 + y1) / 2 / sp;
    return { k, t: [xr * ct + yr * st, -xr * st + yr * ct, 0] };
  }

  // ---------- layout ----------

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (!N) return;

    const side = clamp(W * 0.05, 16, 56);
    const cols = Math.round(clamp(W / 104, 5, 14));
    const cell = (W - 2 * side) / cols;
    const rows = Math.ceil(N / cols);
    const gridTop = intro.offsetHeight + clamp(H * 0.07, 32, 72);
    const A = Math.max(0, gridTop + rows * cell + 32 - H);

    const kT = Math.min(W, H * 1.4) / 15000;
    const step = clamp(H / 110, 5, 8.5);
    const GAP = step / (kT * Math.cos(PHI_TOWER));
    const WALL = GAP * 0.45;
    const kC = kT * Math.min(1, (H * 0.62) / ((N - 1) * step));
    const iso = fitGround(45 * DEG, PHI_ISO, W * 0.88, H * 0.66);
    const top = fitGround(0, PHI_TOP, W * 0.88, H * 0.78);
    const topZ = (N - 1) * GAP;

    const B = H * 2.6, C = H * 1.1, D = H * 2.8, E = H * 1.3, F = H * 0.9;
    track.style.height = `${A + B + C + D + E + F + H}px`;

    for (const r of routes) r.gs = (cell * 0.66) / Math.max(r.w, r.h, 1);
    const labelFont = `${clamp(cell * 0.095, 9, 11).toFixed(1)}px "IBM Plex Mono", ui-monospace, monospace`;

    L = {
      side, cols, cell, gridTop, A, B, C, D, E, GAP, WALL, topZ, labelFont,
      K0: { th: 22 * DEG, ph: PHI_TOWER, k: kT, t: [TX, TY, 0], a: [W / 2, H * 0.68] },
      K1: { th: 40 * DEG, ph: PHI_TOWER, k: kT, t: [TX, TY, topZ], a: [W / 2, H * 0.42] },
      K2: { th: 58 * DEG, ph: PHI_TOWER + 3 * DEG, k: kC, t: [TX, TY, topZ * 0.5], a: [W / 2, H * 0.55] },
      K3: { th: 45 * DEG, ph: PHI_ISO, k: iso.k, t: iso.t, a: [W / 2, H * 0.56] },
      K4: { th: 0, ph: PHI_TOP, k: top.k, t: top.t, a: [W / 2, H * 0.53] },
    };
  }

  // ---------- drawing ----------

  // Newest run sits top-left, so the oldest are at the bottom where the tower starts.
  function gridInto(r, scroll, out) {
    const gi = N - 1 - r.i;
    const col = gi % L.cols, row = Math.floor(gi / L.cols);
    const cx = L.side + (col + 0.5) * L.cell;
    const cy = L.gridTop + (row + 0.45) * L.cell - scroll;
    const s = r.gs, f = r.f;
    for (let j = 0; j < r.n; j++) {
      out[2 * j] = cx + (f[2 * j] - r.cx) * s;
      out[2 * j + 1] = cy + (f[2 * j + 1] - r.cy) * s;
    }
    return cy;
  }

  function drawLabel(r, scroll, alpha) {
    if (alpha <= 0.01) return;
    const gi = N - 1 - r.i, col = gi % L.cols, row = Math.floor(gi / L.cols);
    ctx.fillStyle = `rgba(${theme.label},${alpha})`;
    ctx.fillText(`${r.k.toFixed(1)}km`, L.side + (col + 0.17) * L.cell, L.gridTop + (row + 0.95) * L.cell - scroll);
  }

  function stroke(buf, n) {
    ctx.beginPath();
    ctx.moveTo(buf[0], buf[1]);
    for (let j = 1; j < n; j++) ctx.lineTo(buf[2 * j], buf[2 * j + 1]);
    ctx.stroke();
  }

  // Wall quads share one winding so overlapping ones fill once instead of cancelling.
  function fillWall(b, t, n) {
    ctx.beginPath();
    for (let j = 0; j < n - 1; j++) {
      const ax = b[2 * j], ay = b[2 * j + 1], bx = b[2 * j + 2], by = b[2 * j + 3];
      const cx = t[2 * j + 2], cy = t[2 * j + 3], dx = t[2 * j], dy = t[2 * j + 1];
      if ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay) >= 0) {
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
      } else {
        ctx.moveTo(dx, dy); ctx.lineTo(cx, cy); ctx.lineTo(bx, by); ctx.lineTo(ax, ay);
      }
      ctx.closePath();
    }
    ctx.fill();
  }

  function drawTile(r, alpha) {
    ctx.strokeStyle = `rgba(${r.m ? theme.race : theme.trace},${(r.m ? 0.95 : 0.85) * alpha})`;
    ctx.lineWidth = 1.15;
    stroke(r.g, r.n);
  }

  function drawItem(it) {
    const r = it.r, rgb = r.m ? theme.race : theme.trace, land = it.land;
    if (it.wall) {
      ctx.fillStyle = `rgba(${rgb},${(r.m ? theme.raceFill : theme.wallFill) * (1 - land)})`;
      fillWall(r.b, r.tp, r.n);
      ctx.strokeStyle = `rgba(${rgb},${0.28 * (1 - land)})`;
      ctx.lineWidth = 0.7;
      stroke(r.b, r.n);
    }
    ctx.strokeStyle = `rgba(${rgb},${lerp(r.m ? 0.92 : 0.85, r.m ? 0.75 : theme.mapLine, land)})`;
    ctx.lineWidth = lerp(1, 0.95, land);
    stroke(it.wall ? r.tp : r.b, r.n);
  }

  // One path per layer: thousands of street segments in a single stroke.
  function strokeLayer(v, lines, rgb, alpha, width) {
    ctx.beginPath();
    for (const l of lines) {
      projectInto(v, l.f, l.n, 0, 0, 0, l.b);
      ctx.moveTo(l.b[0], l.b[1]);
      for (let j = 1; j < l.n; j++) ctx.lineTo(l.b[2 * j], l.b[2 * j + 1]);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(${rgb},${alpha})`;
    ctx.stroke();
  }

  function drawUnder(v, alpha) {
    if (alpha <= 0.002) return;
    strokeLayer(v, streets, theme.road, theme.streetA * alpha, 0.5);
    strokeLayer(v, roads, theme.road, theme.roadA * alpha, 0.7);
    strokeLayer(v, lake, theme.lake, theme.lakeA * alpha, 1);
  }

  function frame() {
    pending = false;
    if (!L) return;
    const s = window.scrollY;
    const { A, B, C, D, E, GAP, WALL, topZ } = L;
    const pB = clamp((s - A) / B);
    const pC = clamp((s - A - B) / C);
    const pD = clamp((s - A - B - C) / D);
    const pE = clamp((s - A - B - C - D) / E);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.font = L.labelFont;
    if (s <= A) {
      for (const r of routes) {
        const cy = gridInto(r, s, r.g);
        if (cy > -L.cell && cy < H + L.cell) { drawTile(r, 1); drawLabel(r, s, 1); }
      }
      setHud('off');
      return;
    }

    let cam;
    if (pC === 0) {
      cam = mix(L.K0, L.K1, easeIO(pB));
      cam.t[2] = smooth(clamp((pB - 0.22) / 0.78)) * topZ;
    } else if (pD === 0) {
      cam = mix(L.K1, L.K2, easeIO(pC));
    } else if (pE === 0) {
      cam = mix(L.K2, L.K3, easeIO(clamp(pD / 0.75)));
    } else {
      cam = mix(L.K3, L.K4, easeIO(pE));
    }
    const v = view(cam);

    drawUnder(v, pE > 0 ? 1 : smooth(clamp((pD - 0.35) / 0.5)));

    const items = [];
    let stacked = 0;
    for (const r of routes) {
      const dx = TX - r.cx, dy = TY - r.cy, z = r.i * GAP;
      if (pC === 0) {
        const e = easeIO(clamp((pB - 0.6 * r.i / (N - 1)) / 0.4));
        if (e <= 0) {
          gridInto(r, A, r.g);
          drawTile(r, 1 - 0.55 * pB);
          drawLabel(r, A, 1 - clamp(pB / 0.06));
          continue;
        }
        if (e >= 1) stacked++;
        projectInto(v, r.f, r.n, dx, dy, z, r.b);
        projectInto(v, r.f, r.n, dx, dy, z + WALL, r.tp);
        if (e < 1) {
          gridInto(r, A, r.g);
          const lift = Math.sin(Math.PI * e) * H * 0.05;
          for (let j = 0; j < 2 * r.n; j += 2) {
            r.b[j] = lerp(r.g[j], r.b[j], e);
            r.tp[j] = lerp(r.g[j], r.tp[j], e);
            r.b[j + 1] = lerp(r.g[j + 1], r.b[j + 1], e) - lift;
            r.tp[j + 1] = lerp(r.g[j + 1], r.tp[j + 1], e) - lift;
          }
        }
        items.push({ r, wall: true, land: 0, key: e < 1 ? 1e9 + r.i : z });
      } else if (pD === 0) {
        projectInto(v, r.f, r.n, dx, dy, z, r.b);
        projectInto(v, r.f, r.n, dx, dy, z + WALL, r.tp);
        items.push({ r, wall: true, land: 0, key: z });
      } else {
        const f = pE > 0 ? 1 : clamp((pD - 0.6 * (N - 1 - r.i) / (N - 1)) / 0.4);
        const ex = easeOut(f), zz = z * (1 - easeIn(f)), wall = WALL * (1 - ex);
        projectInto(v, r.f, r.n, dx * (1 - ex), dy * (1 - ex), zz, r.b);
        const hasWall = wall > WALL * 0.03;
        if (hasWall) projectInto(v, r.f, r.n, dx * (1 - ex), dy * (1 - ex), zz + wall, r.tp);
        items.push({ r, wall: hasWall, land: ex, key: f >= 1 ? -1e9 + (r.m ? 1 : 0) : zz });
      }
    }
    items.sort((a, b) => a.key - b.key);
    for (const it of items) drawItem(it);

    if (pC === 0) setHud('live', stacked - 1);
    else if (pD === 0 || pD < 0.12) setHud('live', N - 1);
    else if (pE > 0.35) setHud('final');
    else setHud('off');
  }

  // ---------- text ----------

  function liveReadout(idx) {
    const n = String(N).padStart(3, '0');
    if (idx < 0) return `run   000/${n}\ndate  --------\nkm    0000.0`;
    const r = routes[idx];
    const tag = r.m ? '  race' : '';
    return `run   ${String(idx + 1).padStart(3, '0')}/${n}\ndate  ${mdy(r.d)}${tag}\nkm    ${r.t.toFixed(1).padStart(6, '0')}`;
  }

  function setHud(mode, idx) {
    if (mode === 'live') {
      const text = liveReadout(idx);
      if (text !== liveText) { liveText = text; hudBody.textContent = text; }
    }
    if (mode === hudMode) return;
    hudMode = mode;
    hud.classList.toggle('on', mode !== 'off');
    hud.classList.toggle('final', mode === 'final');
    hudBody.hidden = mode === 'final';
    hudFinal.hidden = mode !== 'final';
  }

  // ---------- boot ----------

  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(frame); }
  }

  function applyTheme(name) {
    theme = THEMES[name];
    document.documentElement.dataset.theme = name;
    themeMeta.content = theme.bg;
    const other = name === 'light' ? 'dark' : 'light';
    toggle.textContent = other;
    toggle.setAttribute('aria-label', `Switch to ${other} theme`);
    try { localStorage.setItem('runs2026-theme', name); } catch (e) { /* private mode */ }
    schedule();
  }

  let saved = null;
  try { saved = localStorage.getItem('runs2026-theme'); } catch (e) { /* private mode */ }
  applyTheme(saved === 'dark' ? 'dark' : 'light');
  toggle.addEventListener('click', () => applyTheme(theme === THEMES.light ? 'dark' : 'light'));

  layout();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  fetch(DATA_URL)
    .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(data => {
      prepare(data);
      introCount.textContent = `my runs, ${words(data.meta.first)} to ${words(data.meta.last)}`;
      hudKm.textContent = `${data.meta.training_km.toFixed(1)}km`;
      layout();
      frame();
      if (document.fonts) document.fonts.load(L.labelFont).then(schedule);
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', () => { layout(); schedule(); });
    })
    .catch(() => {
      introCount.textContent = 'the routes did not load. refresh to try again.';
    });
})();
