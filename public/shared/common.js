// Small helpers shared by the TV page, the phone page and the game renderers.
// Kept to plain ES2017 so it runs on older smart-TV browsers.
(function () {
  const renderers = { host: {}, player: {} };
  const loading = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Game renderers register themselves from /games/<id>/<kind>.js:
   *
   *   Ark.register('player', 'snake', {
   *     mount(el, api) { ... },   // build the DOM once (api.game: the lobby entry, with score.unit)
   *     update(view) { ... },     // called with every new view from the server
   *     unmount() { ... },        // optional cleanup
   *   });
   *
   * TV renderers can also have: sounds(prev, view) -> effect names,
   * padHint (text), pad(button, view) -> input or null, and
   * padPoll({ held, stick }, view) -> input, read every frame, and
   * typing(key, view) -> input or null, for keys typed on the TV's keyboard.
   *
   * The hub draws the end of a run itself (score, best, rematch), so a
   * renderer only has to hide its controls when view.phase is 'over'. Both
   * kinds can add a line to it with overHtml(view) (e.g. "Biggest tile 512").
   */
  function register(kind, gameId, renderer) {
    renderers[kind][gameId] = renderer;
  }

  /** Load a game's renderer script on demand. Resolves to the renderer. */
  function loadRenderer(kind, gameId) {
    if (renderers[kind][gameId]) return Promise.resolve(renderers[kind][gameId]);
    const key = kind + ':' + gameId;
    if (!loading[key]) {
      loading[key] = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = '/games/' + encodeURIComponent(gameId) + '/' + kind + '.js';
        s.onload = function () {
          if (renderers[kind][gameId]) resolve(renderers[kind][gameId]);
          else reject(new Error('Renderer did not register: ' + key));
        };
        s.onerror = function () {
          delete loading[key];
          reject(new Error('Could not load ' + s.src));
        };
        document.head.appendChild(s);
      });
    }
    return loading[key];
  }

  /** Load a helper script once (e.g. drawing code shared by a game's TV and phone renderers). */
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () {
          delete scripts[src];
          reject(new Error('Could not load ' + src));
        };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  /** Add a game's stylesheet once. */
  function loadCss(href) {
    if (document.querySelector('link[data-ark-css="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-ark-css', href);
    document.head.appendChild(link);
  }

  // ---- scores ----

  /** A duration in ms as m:ss.s (or s.s under a minute). */
  function clock(ms) {
    const tenths = Math.floor(Math.max(0, ms) / 100);
    const s = Math.floor(tenths / 10);
    const m = Math.floor(s / 60);
    const rest = (s % 60) + '.' + (tenths % 10);
    return m ? m + ':' + (s % 60 < 10 ? '0' : '') + rest : rest + ' s';
  }

  /** A score as the game counts it: unit is 'pts', 'ms', 'time' or 'tries' (see server/games/index.js). */
  function formatScore(score, unit) {
    if (score === null || score === undefined) return '–';
    if (unit === 'ms') return Math.round(score) + ' ms';
    if (unit === 'time') return clock(score);
    if (unit === 'tries') return score + (score === 1 ? ' try' : ' tries');
    return Math.round(score).toLocaleString('en-US');
  }

  /**
   * How a finished run went, from the view's record ({ score, best, newBest, rank }
   * added by the room): e.g. "🎉 New best!" or "Best 1,200 · #3 on this hub".
   */
  function recordHtml(view, unit) {
    const r = view && view.record;
    if (!r) return '';
    if (r.zero) return 'No points this time. Have another go!';
    if (r.score === null) return '<span class="muted">This run doesn\'t count for the scores.</span>' + (view.best !== null && view.best !== undefined ? ' · Best <strong>' + formatScore(view.best, unit) + '</strong>' : '');
    const rank = r.rank === 1 ? '🥇 The best on this hub!' : '#' + r.rank + ' on this hub';
    if (r.newBest) return '<span class="new-best">🎉 New best!</span>' + (r.best !== null ? ' <span class="muted">(was ' + formatScore(r.best, unit) + ')</span>' : '') + ' · ' + rank;
    return 'Your best <strong>' + formatScore(r.best, unit) + '</strong> · ' + rank;
  }

  // ---- setup screens (match settings picked before a game starts) ----
  // A game's views carry `settings` ({ key: value }) and `options`
  // ({ key: [values] }, see server/games/options.js). rows describes how to
  // show them: [{ key, title, fmt(value) -> label }].

  /** Each option's values: numbers smallest first, words in the order the game lists them. */
  function setupChoices(v, key) {
    const list = v.options[key].slice();
    return list.every(function (x) { return typeof x === 'number'; }) ? list.sort(function (a, b) { return a - b; }) : list;
  }

  /** The settings as rows of buttons (phones tap them: data-key / data-value). focusKey outlines one row (TV). */
  function setupHtml(v, rows, focusKey) {
    return '<div class="ark-setup">' + rows.map(function (row) {
      return '<div class="row' + (row.key === focusKey ? ' focus' : '') + '"><div class="title">' + row.title + '</div><div class="seg">' +
        setupChoices(v, row.key).map(function (value) {
          const on = v.settings[row.key] === value;
          return '<button type="button" class="opt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-key="' + row.key + '" data-value="' + escapeHtml(value) + '">' +
            row.fmt(value) + '</button>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  /**
   * A controller on the setup screen: ↑↓ picks a row (state.row, kept by the
   * caller), ←→ changes it, A / Start begins. Returns the input to send, or
   * null (render again if state.row changed).
   */
  function setupPad(btn, v, rows, state) {
    if (btn === 'A' || btn === 'START') return { type: 'go' };
    if (btn === 'UP' || btn === 'DOWN') {
      state.row = ((state.row || 0) + (btn === 'UP' ? -1 : 1) + rows.length) % rows.length;
      return null;
    }
    if (btn === 'LEFT' || btn === 'RIGHT') {
      const key = rows[state.row || 0].key;
      const list = setupChoices(v, key);
      // Wraps round, so the far end of a long list is one press away.
      const i = (list.indexOf(v.settings[key]) + (btn === 'LEFT' ? -1 : 1) + list.length) % list.length;
      return { type: 'setting', key: key, value: list[i] };
    }
    return null;
  }

  /** The hub's own setup screen, for games wrapped with withSetup (their views carry hubSetup). */
  function isHubSetup(v) {
    return Boolean(v && v.hubSetup && v.phase === 'setup');
  }

  /** hubSetup's rows ({ key, title, labels }) as setupHtml rows, plus a view-like object for it. */
  function hubSetupParts(v) {
    const h = v.hubSetup;
    return {
      rows: h.rows.map(function (r) { return { key: r.key, title: escapeHtml(r.title), fmt: function (value) { return escapeHtml(r.labels[value] || String(value)); } }; }),
      view: { settings: h.settings, options: h.options },
    };
  }

  /** Phones: send a setting when one of setupHtml's buttons inside `el` is tapped. */
  function bindSetup(el, api) {
    el.addEventListener('click', function (e) {
      const btn = e.target.closest && e.target.closest('.ark-setup .opt');
      if (!btn) return;
      // Numbers go as numbers; word choices ('fast', 'hard') as they are.
      const raw = btn.getAttribute('data-value');
      api.send({ type: 'setting', key: btn.getAttribute('data-key'), value: raw !== '' && !isNaN(raw) ? Number(raw) : raw });
      if (api.vibrate) api.vibrate(8);
    });
  }

  /**
   * Reload the page when the server comes back as a newer version (after an
   * update), so screens never run stale code. onVersion(v) gets /version's answer.
   */
  function watchVersion(socket, onVersion) {
    let loaded = null;
    const stamp = function (v) { return v.version + '|' + v.commit + '|' + v.built; };
    function check() {
      fetch('/version', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
        if (onVersion) onVersion(v);
        if (loaded === null) loaded = stamp(v);
        else if (stamp(v) !== loaded) location.reload();
      }).catch(function () { /* server still starting; the next connect checks again */ });
    }
    check();
    socket.on('connect', check);
  }

  const GROUPS = {
    arcade: '🕹️ Arcade <span>Real time: quick hands</span>',
    puzzle: '🧩 Puzzle <span>Think it through, at your own pace</span>',
    brain: '🧠 Brain <span>Memory and reflexes</span>',
  };

  /** The line under a lobby card: your best in that game. */
  function bestLine(g) {
    const parts = [];
    if (g.best && g.best.score !== null) parts.push('🏅 ' + formatScore(g.best.score, g.score.unit) + (g.best.variant ? ' <span class="muted">· ' + escapeHtml(g.best.variant) + '</span>' : ''));
    if (g.achievements && g.achievements.got) parts.push('<span class="ach-count">⭐ ' + g.achievements.got + '/' + g.achievements.total + '</span>');
    return parts.join(' ');
  }

  /** The achievements a run just unlocked (record.unlocked, see server/achievements.js), for the end screen. */
  function unlockedHtml(record) {
    const list = (record && record.unlocked) || [];
    if (!list.length) return '';
    return '<div class="ark-unlocked">' + list.map(function (a, i) {
      return '<div class="ach" style="--i:' + i + '"><span class="icon">' + escapeHtml(a.icon) + '</span><span class="what"><strong>' + escapeHtml(a.name) + '</strong>' +
        '<span class="desc">' + escapeHtml(a.desc) + '</span></span><span class="tag">Achievement unlocked</span></div>';
    }).join('') + '</div>';
  }

  /** Where a player's achievements are listed. */
  function achievementsUrl(name) {
    return '/achievements/?name=' + encodeURIComponent(name || '');
  }

  // ---- the TV lobby's layout change (QR code panel on / off) ----

  const switching = new WeakMap(); // lobby -> the layout it's on its way to, while the panel fades out
  const reducedMotion = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /**
   * Turn the lobby's `cls` layout on or off, animated: going on, `leaving`
   * (the QR panel) fades out to the left, then the `moving` blocks (the
   * players, the game list) glide from where they were to their new place:
   * a block that grows unfolds from its old size, a smaller one slides
   * across. Going off, the blocks glide back and the panel fades in.
   * No animation while the lobby is hidden, the first time, or for players
   * who ask their device for less motion.
   */
  function lobbyLayout(lobby, cls, on, leaving, moving, animate) {
    const busy = switching.has(lobby);
    if (busy) switching.set(lobby, on);
    if (busy || lobby.classList.contains(cls) === on) return;
    if (!animate || reducedMotion() || !lobby.getClientRects().length || !leaving.animate) {
      lobby.classList.toggle(cls, on);
      return;
    }
    const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    function glide(target) {
      const before = moving.map(function (el) { return el.getBoundingClientRect(); });
      lobby.classList.toggle(cls, target);
      moving.forEach(function (el, i) {
        const a = before[i];
        const b = el.getBoundingClientRect();
        const from = { transform: 'translate(' + (a.left - b.left) + 'px, ' + (a.top - b.top) + 'px)' };
        const to = { transform: 'none' };
        if (a.width < b.width - 1 || a.height < b.height - 1) {
          // Growing: show only its old size at first, then open it up (no stretched text).
          const r = getComputedStyle(el).borderTopLeftRadius || '0px';
          from.clipPath = 'inset(0 ' + Math.max(0, b.width - a.width) + 'px ' + Math.max(0, b.height - a.height) + 'px 0 round ' + r + ')';
          to.clipPath = 'inset(0 0 0 0 round ' + r + ')';
        }
        el.animate([from, to], { duration: 520, easing: ease });
      });
      if (!target) leaving.animate([{ opacity: 0, transform: 'translateX(-3rem)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120, easing: 'ease-out', fill: 'backwards' });
    }
    if (!on) return glide(false);
    switching.set(lobby, true);
    leaving.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-3rem) scale(0.96)' }], { duration: 260, easing: 'ease-in' }).onfinish = function () {
      const target = switching.get(lobby);
      switching.delete(lobby);
      if (target) glide(true);
    };
  }

  window.Ark = {
    lobbyLayout: lobbyLayout,
    watchVersion: watchVersion,
    escapeHtml: escapeHtml,
    register: register,
    loadRenderer: loadRenderer,
    loadCss: loadCss,
    loadScript: loadScript,
    clock: clock,
    formatScore: formatScore,
    recordHtml: recordHtml,
    bestLine: bestLine,
    unlockedHtml: unlockedHtml,
    achievementsUrl: achievementsUrl,
    GROUPS: GROUPS,
    setup: { html: setupHtml, pad: setupPad, bind: bindSetup, choices: setupChoices, isHub: isHubSetup, hubParts: hubSetupParts },
  };
})();
