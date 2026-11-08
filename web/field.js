// The live field behind the landing page: one ink mark per open hackathon,
// sized by its score, Marquee ones in amber. Marks drift slowly and part
// around the pointer, then settle back. Purely decorative: the canvas takes
// no input (pointer-events: none), so every control above it works as usual.
const canvas = document.getElementById('field');
const raw = document.getElementById('field-data');
if (canvas && raw && canvas.getContext) {
  // [[score, marquee 0|1], ...], strongest first. Small screens get fewer,
  // about one mark per 6,000 square pixels, keeping the strongest.
  const all = JSON.parse(raw.textContent || '[]');
  const marks = all.slice(0, Math.max(40, Math.round((innerWidth * innerHeight) / 6000)));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const INK = css.getPropertyValue('--color-ink').trim();
  const AMBER = css.getPropertyValue('--color-accent').trim();
  const RADIUS = 150; // how far the pointer reaches, in CSS pixels

  // Stable pseudo-random numbers, so the field looks the same on every load.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Home positions on a jittered grid, as fractions of the viewport.
  const n = marks.length;
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / cols);
  const order = marks.map((_, i) => i).sort(() => rand() - 0.5);
  const dots = marks.map(([score, marquee], i) => {
    const cell = order[i];
    return {
      fx: ((cell % cols) + 0.15 + rand() * 0.7) / cols,
      fy: (Math.floor(cell / cols) + 0.15 + rand() * 0.7) / rows,
      r: 1.1 + (score / 100) * 3.4,
      alpha: marquee ? 0.85 : 0.16 + (score / 100) * 0.34,
      seen: 1, // eases toward 0.08 while the mark sits behind text
      color: marquee ? AMBER : INK,
      phase: rand() * Math.PI * 2,
      x: 0, y: 0, vx: 0, vy: 0,
    };
  });

  let w = 0, h = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of dots) { d.x = d.fx * w; d.y = d.fy * h; d.vx = d.vy = 0; }
  }

  // Text and controls the field should not speckle: marks behind them fade
  // almost out, so a dot never reads as punctuation in a headline.
  let quiet = [];
  const measure = () => {
    quiet = [...document.querySelectorAll('[data-quiet], .nav a, h2, .headblock p, .hk-list, .more, .rules, .how__head p, .mail__facts, .footer p')].map((el) => el.getBoundingClientRect()).filter((b) => b.bottom > 0 && b.top < innerHeight)
      .map((b) => ({ l: b.left - 10, t: b.top - 10, r: b.right + 10, b: b.bottom + 10 }));
  };
  const behind = (d) => quiet.some((q) => d.x > q.l && d.x < q.r && d.y > q.t && d.y < q.b);

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.seen += ((behind(d) ? 0.08 : 1) - d.seen) * (still ? 1 : 0.12);
      ctx.globalAlpha = d.alpha * d.seen;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Strongest in the hero, fading to a trace further down the page.
  const fade = () => { canvas.style.opacity = String(Math.max(0.3, 1 - scrollY / (innerHeight * 1.4))); };

  resize(); fade(); measure();
  for (const d of dots) d.seen = behind(d) ? 0.08 : 1; // start settled, no fade on load
  addEventListener('scroll', () => { fade(); measure(); if (still) draw(); }, { passive: true });
  addEventListener('resize', () => { measure(); for (const d of dots) d.seen = behind(d) ? 0.08 : 1; });
  document.fonts?.ready.then(measure);

  if (still) {
    draw();
    addEventListener('resize', () => { resize(); draw(); });
  } else {
    const pointer = { x: -1e4, y: -1e4, active: false };
    const at = (x, y) => { pointer.x = x; pointer.y = y; pointer.active = true; };
    addEventListener('pointermove', (e) => at(e.clientX, e.clientY), { passive: true });
    addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) at(t.clientX, t.clientY); }, { passive: true });
    const away = () => { pointer.active = false; pointer.x = pointer.y = -1e4; };
    document.addEventListener('pointerleave', away);
    addEventListener('touchend', away, { passive: true });
    addEventListener('blur', away);
    addEventListener('resize', resize);

    let frame = 0, last = 0;
    function step(t) {
      frame = requestAnimationFrame(step);
      if (t - last < 1000 / 60 - 2) return; // cap at 60fps on fast displays
      last = t;
      for (const d of dots) {
        // Home drifts a few pixels on a slow loop.
        const hx = d.fx * w + Math.sin(t * 0.00021 + d.phase) * 7;
        const hy = d.fy * h + Math.cos(t * 0.00017 + d.phase) * 7;
        d.vx += (hx - d.x) * 0.012;
        d.vy += (hy - d.y) * 0.012;
        if (pointer.active) {
          const dx = d.x - pointer.x, dy = d.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < RADIUS && dist > 0.01) {
            const push = (1 - dist / RADIUS) ** 2 * 2.4;
            d.vx += (dx / dist) * push;
            d.vy += (dy / dist) * push;
          }
        }
        d.vx *= 0.86; d.vy *= 0.86;
        d.x += d.vx; d.y += d.vy;
      }
      draw();
    }
    const run = () => { if (!frame) { last = 0; frame = requestAnimationFrame(step); } };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
    run();
  }
}
