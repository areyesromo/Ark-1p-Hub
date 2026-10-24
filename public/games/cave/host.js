(function () {
  Ark.loadCss('/games/cave/style.css');
  const MAX_EXTRAPOLATE_MS = 80; // views come ~30 times a second; move things on between them
  const LIFT_BUTTONS = ['A', 'B', 'X', 'Y', 'UP', 'RT', 'LT', 'RB', 'LB'];
  const LIFT = -90; // matches the server's PHYS, for drawing between views
  const GRAVITY = 80;

  let root = null;
  let arena = null;
  let canvas = null;
  let overlay = null;
  let score = null;
  let raf = null;
  let view = null;
  let viewAt = 0;
  let overlayKey = '';
  let held = false;
  const smoke = []; // { x, y, age } puffs behind the copter, drawn only

  function resize() {
    const f = view.field;
    const box = arena.getBoundingClientRect();
    const scale = Math.min(box.width / f.w, box.height / f.h);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(f.w * scale);
    const h = Math.floor(f.h * scale);
    if (canvas.width !== Math.floor(w * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
  }

  // The colours here are the scene itself: dark rock, a green-lit cave, a red copter.
  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (!view) return;
    resize();
    const f = view.field;
    const g = canvas.getContext('2d');
    const k = canvas.width / f.w;
    g.setTransform(k, 0, 0, k, 0, 0);
    const play = view.phase === 'play';
    const dt = play ? Math.min(performance.now() - viewAt, MAX_EXTRAPOLATE_MS) / 1000 : 0;
    const shift = view.speed * dt;

    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, f.w, f.h);
    // Faint far wall, drifting slowly.
    g.fillStyle = 'rgba(74, 222, 128, 0.03)';
    const far = ((view.distance + shift) * 0.3) % 30;
    for (let x = -far - 30; x < f.w + 30; x += 30) {
      g.beginPath();
      g.arc(x + 15, f.h / 2, 12, 0, Math.PI * 2);
      g.fill();
    }

    // The rock: one shape for the ceiling and one for the floor, along the columns.
    const cols = view.cols;
    const w = view.col;
    g.fillStyle = '#3f2d1f';
    g.strokeStyle = '#4ade80';
    g.lineWidth = 0.5;
    [[1, 0], [2, f.h]].forEach(function (side) {
      // Through the middle of each column, so the walls look smooth rather than stepped.
      g.beginPath();
      g.moveTo(cols[0][0] - shift, side[1]);
      cols.forEach(function (c) { g.lineTo(c[0] + w / 2 - shift, c[side[0]]); });
      g.lineTo(cols[cols.length - 1][0] + w - shift, side[1]);
      g.closePath();
      g.fill();
      g.beginPath();
      cols.forEach(function (c, i) { (i ? g.lineTo : g.moveTo).call(g, c[0] + w / 2 - shift, c[side[0]]); });
      g.stroke();
    });
    view.rocks.forEach(function (r) {
      g.fillStyle = '#57534e';
      g.fillRect(r.x - shift, r.y0, view.rockW, r.y1 - r.y0);
      g.strokeStyle = '#a8a29e';
      g.strokeRect(r.x - shift, r.y0, view.rockW, r.y1 - r.y0);
    });

    const c = view.copter;
    let y = view.phase === 'ready' ? c.y + Math.sin(now / 300) * 1 : c.y + (c.vy + ((view.holding ? LIFT : GRAVITY) * dt) / 2) * dt;
    y = Math.max(0, Math.min(f.h, y));
    if (play && Math.random() < 0.5) smoke.push({ x: c.x - 3, y: y + 0.5, age: 0 });
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.age += 1 / 60;
      s.x -= (view.speed || 20) / 60;
      if (s.age > 0.6) smoke.splice(i, 1);
      else {
        g.fillStyle = 'rgba(203, 213, 225,' + (0.35 * (1 - s.age / 0.6)) + ')';
        g.beginPath();
        g.arc(s.x, s.y, 0.6 + s.age * 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    const tilt = view.phase === 'ready' ? 0 : Math.max(-0.35, Math.min(0.35, c.vy / 120));
    g.save();
    g.translate(c.x, y);
    g.rotate(tilt);
    g.fillStyle = '#ef4444'; // body
    g.beginPath();
    g.ellipse(0, 0, c.r * 1.3, c.r * 0.9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-c.r * 3, -0.35, c.r * 2, 0.7); // tail
    g.fillStyle = '#93c5fd'; // window
    g.beginPath();
    g.ellipse(c.r * 0.55, -0.3, c.r * 0.55, c.r * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e5e7eb'; // rotor, spinning
    const spin = Math.abs(Math.sin(now / 40));
    g.fillRect(-c.r * 1.8 * spin, -c.r - 0.5, c.r * 3.6 * spin, 0.35);
    g.fillRect(-0.15, -c.r - 0.5, 0.3, 0.6);
    g.restore();
  }

  function render(v) {
    score.textContent = v.score + ' m';
    let html = '';
    if (v.phase === 'ready') html = '<div class="big">Get ready</div><div class="sub">' + (v.player && v.player.local ? 'Hold A, ↑ or Space' : 'Hold your phone\'s button') + ' to climb, let go to drop</div>';
    else if (v.phase === 'paused') html = '<div class="big">⏸</div><div class="sub">Paused</div>';
    if (html !== overlayKey) {
      overlayKey = html;
      overlay.innerHTML = html;
    }
  }

  Ark.register('host', 'cave', {
    sounds: function (prev, v) {
      if (v.crashed && !prev.crashed) return ['crash'];
      if (Math.floor(v.score / 100) > Math.floor(prev.score / 100)) return ['point'];
      return [];
    },
    padHint: 'Hold A, ↑ or any face button: climb · Start / P: pause',
    pad: function (btn) {
      return btn === 'START' ? { type: 'pause' } : null;
    },
    // Climbing is held, so it's read every frame: on while any lift button is down.
    padPoll: function (pad) {
      const on = LIFT_BUTTONS.some(function (b) { return pad.held.indexOf(b) !== -1; }) || pad.stick.y < -0.6;
      if (on === held) return null;
      held = on;
      return { type: 'hold', on: on };
    },
    mount: function (el) {
      root = document.createElement('div');
      root.className = 'cave-host';
      root.innerHTML = '<div class="cave-arena"><canvas></canvas><div class="cave-score"></div><div class="cave-overlay"></div></div>';
      el.appendChild(root);
      arena = root.querySelector('.cave-arena');
      canvas = root.querySelector('canvas');
      overlay = root.querySelector('.cave-overlay');
      score = root.querySelector('.cave-score');
      raf = requestAnimationFrame(draw);
    },
    update: function (v) {
      if (v.phase === 'ready') held = false; // a new run starts with nothing held
      view = v;
      viewAt = performance.now();
      render(v);
    },
    unmount: function () {
      cancelAnimationFrame(raf);
      root = arena = canvas = overlay = score = view = null;
      overlayKey = '';
      held = false;
      smoke.length = 0;
    },
  });
})();
