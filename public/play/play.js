// Phone controller: join a room, pick a game, then hand the screen to the
// current game's player renderer. Rejoins automatically after the phone
// sleeps or the page is refreshed. The end of each run (score, best, play
// again) is drawn here, the same for every game.
(function () {
  const STORE_KEY = 'ark.player';
  const COOKIE = 'ark_player'; // a backup of the seat (see loadSession)
  const socket = io();
  const $ = (id) => document.getElementById(id);
  Ark.watchVersion(socket);

  // Arriving from a "switch to the secure page" link (see api.secureUrl):
  // take the seat over with the token it carries, and the preferences.
  (function adoptSecureLink() {
    const q = new URLSearchParams(location.search);
    const token = q.get('token');
    if (!token) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ code: (q.get('room') || '').toUpperCase(), token: token, name: q.get('name') || '' }));
      q.getAll('pref').forEach(function (p) {
        const at = p.indexOf(':');
        const key = p.slice(0, at);
        if (at > 0 && /^ark\.[a-z.]+$/.test(key) && key !== STORE_KEY) localStorage.setItem(key, p.slice(at + 1));
      });
    } catch (e) { /* private mode */ }
    if (history.replaceState) history.replaceState(null, '', location.pathname + '?room=' + encodeURIComponent(q.get('room') || ''));
  })();

  let session = loadSession(); // { code, token, name } once joined
  let me = null; // { name, code }
  let state = null;
  let current = null; // { gameId, renderer }
  let lastView = null; // newest { gameId, view }, kept so it can be applied once a renderer mounts
  let wakeLock = null;

  // The seat is kept in localStorage, with a cookie as a backup: some phone
  // browsers (in-app QR viewers, private tabs) lose one but not the other on a reload.
  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s) return s;
    } catch (e) { /* private mode */ }
    const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    try { return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch (e) { return null; }
  }
  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* private mode */ }
    document.cookie = COOKIE + '=' + (s ? encodeURIComponent(JSON.stringify(s)) + '; max-age=86400' : '; max-age=0') + '; path=/; SameSite=Lax';
  }

  // ---- join ------------------------------------------------------------

  const urlCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  $('code').value = urlCode || (session && session.code) || '';
  $('name').value = (session && session.name) || '';
  if (urlCode) setTimeout(function () { $('name').focus(); }, 50);

  const REJOIN_TRIES = 15; // ~30 s: after a server update the TV reopens the same room
  let rejoinTimer = null;

  function join(code, name, token, silent, attempt) {
    attempt = attempt || 0;
    clearTimeout(rejoinTimer);
    $('join-btn').disabled = true;
    socket.emit('player:join', { code: code, name: name, token: token }, function (res) {
      $('join-btn').disabled = false;
      // Rejoining after a restart: the room comes back once the TV reconnects, so keep trying a while.
      if (silent && res && /No room/.test(res.error || '') && attempt < REJOIN_TRIES) {
        $('me-conn').textContent = 'Waiting for the TV…';
        rejoinTimer = setTimeout(function () { join(code, name, token, true, attempt + 1); }, 2000);
        return;
      }
      if (!res || !res.ok) {
        if (!silent) $('join-error').textContent = (res && res.error) || 'Could not join.';
        if (silent) saveSession({ code: '', token: null, name: session ? session.name : '' });
        showJoin();
        return;
      }
      saveSession({ code: res.code, token: res.token, name: res.name });
      me = { name: res.name, code: res.code };
      $('me-conn').textContent = '';
      $('join-error').textContent = '';
      showController();
      // The room snapshot arrives just before this callback, so apply it now.
      if (state) applyState();
    });
  }

  $('join-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const code = $('code').value.trim().toUpperCase();
    const name = $('name').value.trim();
    if (!code || !name) return;
    // Reuse our token only when rejoining the same room.
    const token = session && session.code === code ? session.token : null;
    join(code, name, token, false);
    requestWakeLock();
  });

  socket.on('connect', function () {
    $('me-conn').textContent = '';
    // Auto-rejoin when we have a seat in this room (refresh, phone woke up, Wi-Fi blip).
    if (session && session.token && session.code && (!urlCode || urlCode === session.code)) {
      join(session.code, session.name, session.token, true);
    }
  });

  // "Still there?" from the server, when someone joins under our name (see player:join).
  socket.on('player:ping', function (ack) { if (typeof ack === 'function') ack(true); });

  // Leaving or reloading the page: say so now, so the TV doesn't wait to notice.
  window.addEventListener('pagehide', function () { socket.disconnect(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) socket.connect(); }); // back from the high scores

  socket.on('disconnect', function () {
    $('me-conn').textContent = 'Reconnecting…';
  });

  socket.on('player:kicked', function (msg) {
    // Removed by the TV: forget the seat, so we don't rejoin by ourselves.
    if (msg.removed) saveSession({ code: '', token: null, name: session ? session.name : '' });
    me = null;
    $('join-error').textContent = msg.reason;
    showJoin();
  });

  // ---- screens ---------------------------------------------------------

  function showJoin() {
    unmountGame();
    if (picker) picker.close();
    $('controller').classList.add('hidden');
    $('join-screen').classList.remove('hidden');
    syncZoom();
  }

  function showController() {
    $('join-screen').classList.add('hidden');
    $('controller').classList.remove('hidden');
    $('me-name').textContent = me.name;
    $('me-tag').textContent = me.code;
  }

  $('menu-btn').addEventListener('click', function () { $('menu').classList.toggle('hidden'); });
  $('lobby-btn').addEventListener('click', function () {
    socket.emit('lobby:return');
    $('menu').classList.add('hidden');
  });
  // Does this phone buzz? Games vibrate on bites, bricks and mistakes; some phones can't, or won't.
  $('buzz-btn').addEventListener('click', function () {
    const ok = navigator.vibrate ? navigator.vibrate([120, 60, 120]) : null;
    const msg = $('buzz-msg');
    msg.classList.remove('hidden');
    msg.textContent = ok === null
      ? "This browser can't vibrate (iPhones don't let web pages buzz, and Firefox doesn't either)."
      : ok
        ? 'Felt a buzz? Then games can vibrate. Nothing? Check that vibration / haptics is on in the phone\'s settings, and that it isn\'t in battery-saver or silent mode.'
        : 'The phone refused to vibrate: try again after tapping the screen, and check battery saver and vibration settings.';
  });
  $('leave-btn').addEventListener('click', function () {
    socket.emit('player:leave', null, function () {
      saveSession({ code: '', token: null, name: me ? me.name : '' });
      me = null;
      $('menu').classList.add('hidden');
      showJoin();
    });
  });

  // ---- lobby -----------------------------------------------------------

  function renderLobby() {
    $('lobby-status').innerHTML = 'Hi <strong>' + Ark.escapeHtml(me.name) + '</strong>! Pick a game and beat your best.' +
      ' <span class="muted">Tap your avatar to change it.</span>';
    $('me-link').href = '/me/?name=' + encodeURIComponent(me.name);
    $('ach-link').href = Ark.achievementsUrl(me.name);
    $('col-link').href = '/collection/?name=' + encodeURIComponent(me.name);
    $('cal-link').href = '/calendar/?name=' + encodeURIComponent(me.name);
    $('ach-link').textContent = '⭐ Achievements' + (state.achievements ? ' · ' + state.achievements.got + ' / ' + state.achievements.total : '');
    $('phone-games').innerHTML =
      '<button data-game="random" class="random"><strong>🎲 Random game</strong><span>Can\'t decide? Let the hub pick.</span></button>' +
      (state.daily ? (function (d) {
        return '<button data-game="daily" class="random daily' + (d.done ? ' done' : '') + '"><strong>' + d.name + '</strong><span>' + d.tagline + '</span></button>';
      })(Ark.dailyCard(state.daily)) : '') +
      state.games.map(function (g, i) {
        const heading = i === 0 || state.games[i - 1].category !== g.category
          ? '<h3 class="game-group">' + (Ark.GROUPS[g.category] || Ark.escapeHtml(g.category)) + '</h3>'
          : '';
        const best = Ark.bestLine(g);
        return (
          heading +
          '<button data-game="' + Ark.escapeHtml(g.id) + '">' +
          '<strong>' + Ark.escapeHtml(g.name) + '</strong>' +
          '<span>' + Ark.escapeHtml(g.tagline) + '</span>' +
          (best ? '<em class="best">' + best + '</em>' : '') +
          '</button>'
        );
      }).join('');
  }

  $('phone-games').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-game]');
    if (!btn || btn.disabled) return;
    socket.emit('lobby:start', { gameId: btn.getAttribute('data-game') }, function (res) {
      if (res && res.error) alert(res.error);
    });
  });

  // ---- game ------------------------------------------------------------

  const api = {
    send: function (input) { socket.emit('game:input', input); },
    vibrate: function (pattern) { if (navigator.vibrate) navigator.vibrate(pattern); },
    get game() { return currentGame(); },
    /**
     * This page over https (same seat, same address), for things phones only
     * allow on secure pages (the motion sensor). prefs: { 'ark.key': value }
     * to carry over (each address keeps its own). null when already secure.
     */
    secureUrl: function (prefs) {
      if (location.protocol === 'https:' || !session || !session.token) return null;
      const q = new URLSearchParams({ room: session.code, name: session.name, token: session.token });
      Object.keys(prefs || {}).forEach(function (k) { q.append('pref', k + ':' + prefs[k]); });
      return 'https://' + location.host + '/play/?' + q.toString();
    },
  };

  function currentGame() {
    return state && (state.games || []).find(function (g) { return g.id === state.gameId; });
  }

  function unmountGame() {
    if (current && current.renderer && current.renderer.unmount) current.renderer.unmount();
    current = null;
    $('phone-stage').innerHTML = '';
    showRunOver(null);
  }

  function mountGame(gameId) {
    unmountGame();
    const mounting = { gameId: gameId, renderer: null };
    current = mounting;
    Ark.loadRenderer('player', gameId).then(function (renderer) {
      if (current !== mounting) return;
      mounting.renderer = renderer;
      renderer.mount($('phone-stage'), api);
      if (lastView && lastView.gameId === gameId && !Ark.setup.isHub(lastView.view)) {
        renderer.update(lastView.view);
        showRunOver(lastView.view);
      }
      syncZoom();
    }).catch(function (err) {
      $('phone-stage').textContent = err.message;
    });
  }

  socket.on('room:state', function (s) {
    state = s;
    if (me) applyState();
  });

  // Your avatar and colour: shown in the header, and the phone's accent colour follows it.
  let picker = null;
  function renderMe() {
    const p = state && state.player;
    const profile = p && me && p.name === me.name ? p.profile : null;
    if (!profile) return;
    $('me-avatar').innerHTML = Ark.avatarHtml(profile);
    document.body.style.setProperty('--me', profile.colour);
    if (picker) picker.update(profile);
  }
  function openPicker() {
    const p = state && state.player;
    $('menu').classList.add('hidden');
    if (!p || picker) return;
    picker = Ark.profilePicker({
      profile: p.profile,
      onPick: function (fields) {
        socket.emit('profile:set', fields, function (res) {
          if (res && res.error) alert(res.error);
        });
      },
      onClose: function () { picker = null; },
    });
  }
  $('me-avatar').addEventListener('click', openPicker);
  $('profile-btn').addEventListener('click', openPicker);

  function applyState() {
    const s = state;
    renderMe();
    const playing = s.phase === 'playing';
    $('phone-lobby').classList.toggle('hidden', playing);
    $('lobby-btn').disabled = !playing;
    showHubSetup(playing && lastView && Ark.setup.isHub(lastView.view) && lastView.gameId === s.gameId ? lastView.view : null);
    if (playing) {
      if (!current || current.gameId !== s.gameId) mountGame(s.gameId);
    } else {
      unmountGame();
      renderLobby();
    }
    syncStage();
  }

  /** The game's own screen shows while playing, unless the setup or end screen is up. */
  function syncStage() {
    const playing = Boolean(state && state.phase === 'playing');
    const covered = !$('hub-setup').classList.contains('hidden') || !$('run-over').classList.contains('hidden');
    $('phone-stage').classList.toggle('hidden', !playing || covered);
    syncZoom();
  }

  // Pinch zoom stays on for the join form, the lobby, setup and end screens (low vision),
  // and is switched off only while a game's own screen is up, where a stray pinch would wreck it.
  const viewport = document.querySelector('meta[name="viewport"]');
  const zoomable = viewport.getAttribute('content');
  function syncZoom() {
    const locked = !$('controller').classList.contains('hidden') && !$('phone-stage').classList.contains('hidden');
    const content = locked ? zoomable + ', maximum-scale=1, user-scalable=no' : zoomable;
    if (viewport.getAttribute('content') !== content) viewport.setAttribute('content', content); // views come many times a second
  }

  socket.on('game:view', function (msg) {
    lastView = msg;
    const v = msg.view;
    showHubSetup(Ark.setup.isHub(v) ? v : null);
    if (Ark.setup.isHub(v)) return; // the game hasn't started: the hub shows its setup screen
    if (current && current.renderer && current.gameId === msg.gameId) {
      current.renderer.update(v);
      showRunOver(v);
    }
  });

  // The setup screen for games that have one (see withSetup on the server).
  let hubSetupKey = '';
  function showHubSetup(v) {
    $('hub-setup').classList.toggle('hidden', !v);
    if (v) showRunOver(null);
    syncStage();
    if (!v) {
      hubSetupKey = '';
      return;
    }
    const key = JSON.stringify(v.hubSetup.settings);
    if (key === hubSetupKey) return;
    hubSetupKey = key;
    const game = currentGame();
    const parts = Ark.setup.hubParts(v);
    $('hub-setup').innerHTML =
      '<div class="hub-title">' + Ark.escapeHtml(game ? game.name : '') + '</div>' +
      Ark.setup.html(parts.view, parts.rows) +
      '<button class="primary hub-go">Start</button>';
  }
  Ark.setup.bind($('hub-setup'), api);
  $('hub-setup').addEventListener('click', function (e) {
    if (e.target.closest('.hub-go')) api.send({ type: 'go' });
  });

  // The end of a run: the game's screen makes way for the score and what's next.
  let runOverKey = '';
  function showRunOver(v) {
    const g = currentGame();
    const show = Boolean(v && g && v.phase === 'over' && state && state.phase === 'playing');
    $('run-over').classList.toggle('hidden', !show);
    syncStage();
    if (!show) {
      runOverKey = '';
      return;
    }
    const r = current && current.renderer;
    const extra = r && r.overHtml ? r.overHtml(v) : '';
    const html =
      '<div class="ro-game">' + Ark.escapeHtml(g.name) + (v.variant ? ' · ' + Ark.escapeHtml(v.variant) : '') + '</div>' +
      '<div class="ro-score">' + Ark.formatScore(v.score, g.score.unit) + '</div>' +
      '<div class="ro-record">' + Ark.recordHtml(v, g.score.unit) + '</div>' +
      Ark.unlockedHtml(v.record) +
      (extra ? '<div class="ro-extra">' + extra + '</div>' : '') +
      (v.daily
        ? '<div class="ro-extra">📅 That was today\'s challenge. A new one comes at midnight (UTC).</div><button class="primary rematch" data-ro="lobby">Pick another game</button>'
        : '<button class="primary rematch" data-ro="rematch">Play again</button>' +
          '<div class="ro-row">' + (v.hubSetup ? '<button class="ghost" data-ro="setup">⚙ Change settings</button>' : '') +
          '<button class="ghost" data-ro="lobby">Pick another game</button></div>');
    if (html === runOverKey) return;
    runOverKey = html;
    $('run-over').innerHTML = html;
    if ((v.record && v.record.newBest && v.record.score !== null) || (v.record && v.record.unlocked && v.record.unlocked.length)) api.vibrate([60, 40, 60, 40, 120]);
  }
  $('run-over').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-ro]');
    if (!btn) return;
    const what = btn.getAttribute('data-ro');
    if (what === 'lobby') socket.emit('lobby:return');
    else api.send({ type: what });
  });

  // ---- keep the screen awake while playing -----------------------------

  function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* not allowed (e.g. plain http on iOS); fine */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && me) requestWakeLock();
  });
  document.addEventListener('pointerdown', requestWakeLock, { once: true });
})();
