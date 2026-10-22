(function () {
  Ark.loadCss('/games/flappy/style.css');
  const MAX_EXTRAPOLATE_MS = 80; // views come ~30 times a second; move things on between them
  const FLAP_BUTTONS = ['A', 'B', 'X', 'Y', 'UP', 'RT', 'LT', 'RB', 'LB'];

  let root = null;
  let arena = null;
  let canvas = null;
  let overlay = null;
  let score = null;
  let raf = null;
  let view = null;
  let viewAt = 0;
  let overlayKey = '';

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

  // The colours here are the scene itself: sky, green pipes, a yellow bird.
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

    const sky = g.createLinearGradient(0, 0, 0, f.h);
    sky.addColorStop(0, '#0e1a3a');
    sky.addColorStop(1, '#1e3a5f');
    g.fillStyle = sky;
    g.fillRect(0, 0, f.w, f.h);

    // Far-off hills drifting slowly, for a sense of speed.
    g.fillStyle = 'rgba(56, 189, 248, 0.08)';
    const hills = ((view.distance + shift) * 0.25) % 40;
    for (let x = -hills - 40; x < f.w + 40; x += 40) {
      g.beginPath();
      g.arc(x + 20, f.h + 4, 22, Math.PI, 0);
      g.fill();
    }

    view.pipes.forEach(function (p) {
      const x = p.x - shift;
      const top = p.gapY - p.gap / 2;
      const bottom = p.gapY + p.gap / 2;
      g.fillStyle = '#16a34a';
      g.fillRect(x, 0, view.pipeW, top);
      g.fillRect(x, bottom, view.pipeW, f.h - bottom);
      g.fillStyle = '#22c55e';
      g.fillRect(x - 0.8, top - 2.5, view.pipeW + 1.6, 2.5);
      g.fillRect(x - 0.8, bottom, view.pipeW + 1.6, 2.5);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x + 1, 0, 1.2, top - 2.5);
      g.fillRect(x + 1, bottom + 2.5, 1.2, f.h - bottom);
    });

    const b = view.bird;
    // Bob gently while waiting for the first flap.
    let y = view.phase === 'ready' ? b.y + Math.sin(now / 250) * 1.2 : b.y + (b.vy + (view.gravity * dt) / 2) * dt;
    y = Math.max(b.r, Math.min(f.h - b.r, y));
    const tilt = view.phase === 'ready' ? 0 : Math.max(-0.5, Math.min(1.2, b.vy / 60));
    g.save();
    g.translate(b.x, y);
    g.rotate(tilt);
    g.fillStyle = '#facc15';
    g.beginPath();
    g.ellipse(0, 0, b.r * 1.2, b.r, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fde68a'; // wing
    g.beginPath();
    g.ellipse(-0.6, 0.4 + (play && b.vy < 0 ? -0.6 : 0.3), b.r * 0.6, b.r * 0.35, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(b.r * 0.55, -b.r * 0.35, 0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#05070f';
    g.beginPath();
    g.arc(b.r * 0.7, -b.r * 0.35, 0.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fb923c'; // beak
    g.beginPath();
    g.moveTo(b.r * 1.1, -0.2);
    g.lineTo(b.r * 1.1 + 1.4, 0.3);
    g.lineTo(b.r * 1.1, 0.8);
    g.fill();
    g.restore();
  }

  function render(v) {
    score.textContent = v.score;
    let html = '';
    if (v.phase === 'ready') html = '<div class="big">Get ready</div><div class="sub">' + (v.player && v.player.local ? 'A, ↑ or Space' : 'Tap your phone') + ' to flap</div>';
    else if (v.phase === 'paused') html = '<div class="big">⏸</div><div class="sub">Paused</div>';
    if (html !== overlayKey) {
      overlayKey = html;
      overlay.innerHTML = html;
    }
  }

  Ark.register('host', 'flappy', {
    sounds: function (prev, v) {
      const out = [];
      if (v.score > prev.score) out.push('point');
      if (v.crashed && !prev.crashed) out.push('crash');
      if (v.phase === 'play' && v.bird.vy < 0 && prev.bird.vy >= 0) out.push('whoosh');
      return out;
    },
    padHint: 'A, ↑ or any face button: flap · Start / P: pause',
    pad: function (btn) {
      if (btn === 'START') return { type: 'pause' };
      return FLAP_BUTTONS.indexOf(btn) !== -1 ? { type: 'flap' } : null;
    },
    mount: function (el) {
      root = document.createElement('div');
      root.className = 'flappy-host';
      root.innerHTML = '<div class="flappy-arena"><canvas></canvas><div class="flappy-score"></div><div class="flappy-overlay"></div></div>';
      el.appendChild(root);
      arena = root.querySelector('.flappy-arena');
      canvas = root.querySelector('canvas');
      overlay = root.querySelector('.flappy-overlay');
      score = root.querySelector('.flappy-score');
      raf = requestAnimationFrame(draw);
    },
    update: function (v) {
      view = v;
      viewAt = performance.now();
      render(v);
    },
    unmount: function () {
      cancelAnimationFrame(raf);
      root = arena = canvas = overlay = score = view = null;
      overlayKey = '';
    },
  });
})();
