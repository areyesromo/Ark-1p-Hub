// TV screen: creates (or resumes) a room, shows the QR code and the lobby,
// and hands the stage to the current game's host renderer. The hub itself
// draws the end of every run (score, best, rematch).
(function () {
  const STORE_KEY = 'ark.host';
  const socket = io();
  const $ = (id) => document.getElementById(id);
  Ark.watchVersion(socket, function (v) {
    $('version').textContent = 'v' + v.version + (v.commit && v.commit !== 'dev' ? ' · ' + v.commit.slice(0, 7) : '');
  });

  // Nobody uses a mouse on a TV: hide the pointer until it moves.
  let cursorTimer = null;
  window.addEventListener('mousemove', function () {
    document.body.classList.add('cursor-on');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () { document.body.classList.remove('cursor-on'); }, 3000);
  });

  let state = null;
  let current = null; // { gameId, renderer } mounted on the stage
  let pendingView = null;
  let lastView = null; // newest view of the current game (controllers map buttons against it)
  let roomCode = null;
  let kickArmed = null; // the seat's ✕ tapped once: a timer (see kick below)
  let lastPolled = ''; // last analog input sent (see padPoll below)
  let lobbyDrawn = false; // the lobby's first layout appears as it is, later changes animate

  // ---- room lifecycle --------------------------------------------------

  function saved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }
  function save(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  function onRoom(res) {
    save({ code: res.code, hostToken: res.hostToken });
    roomCode = res.code;
    restorePad(res.code);
    $('room-code').textContent = res.code;
    $('join-code').textContent = res.code;
    $('room-note-code').textContent = res.code;
    if (res.qr) $('qr').src = res.qr;
  }

  function createRoom() {
    socket.emit('host:create', { origin: location.origin }, onRoom);
  }

  socket.on('connect', function () {
    $('conn').textContent = 'Connected';
    $('conn').className = 'conn ok';
    const prev = saved();
    if (!prev) return createRoom();
    // Survive TV refreshes and server hiccups by reclaiming the same room.
    socket.emit('host:resume', { code: prev.code, hostToken: prev.hostToken, origin: location.origin }, function (res) {
      if (res && res.ok) onRoom(res);
      else createRoom();
    });
  });

  // The join address was changed in Settings: show the new QR code.
  socket.on('host:qr', function (msg) {
    if (msg && msg.qr) $('qr').src = msg.qr;
  });

  socket.on('disconnect', function () {
    $('conn').textContent = 'Reconnecting…';
    $('conn').className = 'conn';
  });

  // ---- lobby -----------------------------------------------------------

  function deviceOf(p) {
    if (!p.local) return '📱 Phone';
    return padSeat && padSeat.idx === ArkPads.KEYBOARD ? '⌨️ Keyboard' : '🎮 Controller';
  }

  function renderSeat() {
    const el = $('seat');
    const p = state.player;
    if (!p) {
      el.className = 'seat empty';
      el.innerHTML = '<span class="label">Player</span><span class="who">Who\'s playing?</span>' +
        '<span class="status">Scan the code with your phone, or press A on a controller (Enter on a keyboard)</span>';
      return;
    }
    el.className = 'seat filled' + (p.connected ? '' : ' away');
    el.style.setProperty('--seat', p.profile ? p.profile.colour : '');
    el.innerHTML =
      '<button class="kick' + (kickArmed ? ' armed' : '') + '" data-kick title="Free the seat">' + (kickArmed ? 'Remove?' : '✕') + '</button>' +
      '<span class="label">Player</span>' +
      '<span class="who"><button class="seat-avatar" data-profile title="Change avatar and colour">' + Ark.avatarHtml(p.profile) + '</button><span class="nm">' + Ark.escapeHtml(p.name) + '</span></span>' +
      '<span class="status">' + deviceOf(p) + ' · ' + (p.connected ? 'Ready' : 'Reconnecting…') + '</span>' +
      (state.achievements ? '<a class="ach-link" href="' + Ark.achievementsUrl(p.name) + '">⭐ ' + state.achievements.got + ' / ' + state.achievements.total + ' achievements</a>' : '');
  }

  // The first lobby card picks a game at random (the server chooses, see Room#pickRandomGame).
  const RANDOM = { id: 'random', name: '🎲 Random game', tagline: "Can't decide? Let the hub pick one for you." };
  function lobbyCards() {
    return [RANDOM].concat(state.daily ? [Ark.dailyCard(state.daily)] : [], state.games);
  }

  function renderLobby() {
    $('join-url').textContent = state.joinUrl ? state.joinUrl.replace(/\?.*$/, '') : '';
    $('join-warn').classList.toggle('hidden', !state.joinGuess);
    // Someone in the seat: the QR code steps aside and the game list gets the room.
    Ark.lobbyLayout($('lobby'), 'seated', Boolean(state.player), document.querySelector('.join'),
      [document.querySelector('.seat-col'), document.querySelector('.games')], lobbyDrawn);
    lobbyDrawn = true;
    renderSeat();

    $('games-hint').textContent = state.readyToPlay
      ? 'Choose on your phone, or here with a controller or the keyboard (arrows + Enter).'
      : 'Games unlock once someone is playing.';
    renderPadHint();

    const padFocus = Boolean(padSeat);
    const cards = lobbyCards();
    if (focus >= cards.length) focus = 0;
    $('game-list').innerHTML = cards.map(function (g, i) {
      const heading = g.category && cards[i - 1].category !== g.category
        ? '<h3 class="game-group">' + (Ark.GROUPS[g.category] || Ark.escapeHtml(g.category)) + '</h3>'
        : '';
      const best = g.score ? Ark.bestLine(g) : '';
      return (
        heading +
        '<button class="game-card' + (g.id === 'random' ? ' random' : '') + (g.id === 'daily' ? ' random daily' + (g.done ? ' done' : '') : '') + (padFocus && i === focus ? ' pad-focus' : '') + '" data-game="' + Ark.escapeHtml(g.id) + '"' + (state.readyToPlay ? '' : ' disabled') + '>' +
        '<strong>' + Ark.escapeHtml(g.name) + '</strong>' +
        '<span>' + (g.id === 'daily' ? g.tagline : Ark.escapeHtml(g.tagline)) + '</span>' +
        (best ? '<em class="best">' + best + '</em>' : '') +
        '</button>'
      );
    }).join('');
    // Keep the controller's pick in view now that the list scrolls.
    const focused = padFocus && $('game-list').querySelector('.pad-focus');
    if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
  }

  $('game-list').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-game]');
    if (!btn || btn.disabled) return;
    socket.emit('lobby:start', { gameId: btn.getAttribute('data-game') }, function (res) {
      if (res && res.error) flashPad('⚠️ ' + res.error);
    });
  });

  $('to-lobby').addEventListener('click', function () { socket.emit('lobby:return'); });

  // Freeing the seat: tap ✕, then "Remove?" within a few seconds.
  $('seat').addEventListener('click', function (e) {
    if (!e.target.closest('[data-kick]')) return;
    if (kickArmed) {
      clearTimeout(kickArmed);
      kickArmed = null;
      socket.emit('host:kick');
      return;
    }
    kickArmed = setTimeout(function () { kickArmed = null; if (state) renderLobby(); }, 4000);
    renderLobby();
  });

  // The player's avatar and colour, picked here (a click, or X / Q on a controller or the keyboard).
  let picker = null;
  function openPicker() {
    if (!state || !state.player || picker) return;
    picker = Ark.profilePicker({
      profile: state.player.profile,
      title: state.player.name + '\'s avatar and colour',
      onPick: function (fields) {
        socket.emit('profile:set', fields, function (res) {
          if (res && res.error) flashPad('⚠️ ' + res.error);
        });
      },
      onClose: function () { picker = null; },
    });
  }
  $('seat').addEventListener('click', function (e) {
    if (e.target.closest('[data-profile]')) openPicker();
  });

  // In the desktop app (window.arkDesktop, see desktop/preload.cjs) ⛶ switches the app's window
  // between full screen and windowed, and Quit closes it: tap it, then "Quit?" again within 3 s
  // (a quick double-click doesn't count as both taps).
  const desktop = window.arkDesktop;
  $('fullscreen').addEventListener('click', function () {
    if (desktop) return desktop.toggleFullScreen();
    const root = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
  });
  if (desktop) {
    let armed = null;
    let armedAt = 0;
    $('quit').classList.remove('hidden');
    $('quit').addEventListener('click', function () {
      if (armed) {
        if (Date.now() - armedAt >= 400) desktop.quit();
        return;
      }
      armedAt = Date.now();
      $('quit').textContent = 'Quit?';
      $('quit').classList.add('armed');
      armed = setTimeout(function () {
        armed = null;
        $('quit').textContent = 'Quit';
        $('quit').classList.remove('armed');
      }, 3000);
    });
  }

  function currentGame() {
    return state && (state.games || []).find(function (g) { return g.id === state.gameId; });
  }

  /** During a game: the best to beat, in the top bar. */
  function renderBestChip() {
    const g = currentGame();
    const v = lastView;
    const show = Boolean(state && state.phase === 'playing' && g && v && !Ark.setup.isHub(v));
    $('best-chip').classList.toggle('hidden', !show);
    if (!show) return;
    const html = '<strong>' + Ark.escapeHtml(g.name) + '</strong>' + (v.variant ? ' <span class="muted">' + Ark.escapeHtml(v.variant) + '</span>' : '') +
      ' · 🏅 Best ' + (v.best === null || v.best === undefined ? '<span class="muted">–</span>' : Ark.formatScore(v.best, g.score.unit));
    if ($('best-chip').innerHTML !== html) $('best-chip').innerHTML = html;
  }

  /** The end of a run: the score, how it compares, and what's next. */
  function renderRunOver() {
    const v = lastView;
    const g = currentGame();
    const show = Boolean(state && state.phase === 'playing' && g && v && v.phase === 'over');
    $('run-over').classList.toggle('hidden', !show);
    if (!show) return;
    const local = state.player && state.player.local;
    const next = v.daily
      ? '📅 That was today\'s challenge: a new one at midnight (UTC) · ' + (local ? '<strong>A</strong> lobby' : 'pick another game on your phone')
      : local
        ? '<strong>A</strong> play again' + (v.hubSetup ? ' · <strong>Y</strong> change settings' : '') + ' · <strong>Back</strong> lobby'
        : 'Play again or pick another game on your phone';
    const r = current && current.renderer;
    const extra = r && r.overHtml ? r.overHtml(v) : '';
    const html =
      '<div class="ro-score"><span class="muted">Score</span> ' + Ark.formatScore(v.score, g.score.unit) + '</div>' +
      '<div class="ro-record">' + Ark.recordHtml(v, g.score.unit) + '</div>' +
      Ark.unlockedHtml(v.record) +
      (extra ? '<div class="ro-extra muted">' + extra + '</div>' : '') +
      '<div class="ro-next muted">' + next + '</div>';
    if ($('run-over').innerHTML !== html) $('run-over').innerHTML = html;
  }

  // ---- sound -------------------------------------------------------------
  // Effects come from two places: a few rules every game shares (countdowns,
  // the end of a run) and the renderer's own optional sounds(prev, view)
  // hook, which returns effect names.

  function renderSoundButton() {
    const btn = $('sound');
    const off = ArkSound.isMuted();
    const locked = !off && !ArkSound.unlocked();
    btn.textContent = off ? '🔇' : locked ? '🔈 Tap for sound' : '🔊';
    btn.classList.toggle('attention', locked);
    btn.title = off ? 'Sound is off' : 'Sound is on';
  }
  $('sound').addEventListener('click', function () {
    // The click that switches audio on (see sound.js) isn't also a mute toggle.
    if (performance.now() - ArkSound.unlockAttemptAt() < 1000) return;
    ArkSound.setMuted(!ArkSound.isMuted());
  });
  ArkSound.onChange(renderSoundButton);
  renderSoundButton();

  // ---- music -------------------------------------------------------------
  // The lobby has its own laid-back tune; each game asks for a mood (see
  // MUSIC_MOODS in server/games/index.js). Setup and end screens get the
  // lobby tune; the 🎵 button turns music on and off.

  function renderMusicButton() {
    const on = ArkMusic.isEnabled();
    $('music').classList.toggle('off', !on);
    $('music').title = on ? 'Music is on' : 'Music is off';
  }
  $('music').addEventListener('click', function () {
    ArkMusic.setEnabled(!ArkMusic.isEnabled());
  });
  ArkMusic.onChange(renderMusicButton);
  renderMusicButton();

  function updateMusic() {
    let mood = 'lobby';
    if (state && state.phase === 'playing' && lastView && lastView.phase !== 'setup' && lastView.phase !== 'over') {
      const game = currentGame();
      if (game && game.music) mood = game.music;
    }
    ArkMusic.setMood(mood);
  }

  function playGameSounds(prev, v) {
    const names = [];
    if (prev) {
      if (v.countdown > 0 && v.countdown !== prev.countdown) names.push('tick');
      if (prev.countdown > 0 && !(v.countdown > 0) && v.phase !== 'over') names.push('go');
      if (v.phase === 'over' && prev.phase !== 'over') names.push((v.record && v.record.newBest && v.record.score !== null) || (v.record && v.record.unlocked && v.record.unlocked.length) ? 'fanfare' : 'end');
    } else if (v.countdown > 0) {
      names.push('tick');
    }
    const r = current && current.renderer;
    if (prev && r && r.sounds) {
      try { (r.sounds(prev, v) || []).forEach(function (n) { names.push(n); }); } catch (e) { /* a sound bug never breaks the game */ }
    }
    names.forEach(ArkSound.play);
  }

  // ---- game stage ------------------------------------------------------

  function unmountGame() {
    if (current && current.renderer && current.renderer.unmount) current.renderer.unmount();
    current = null;
    pendingView = null;
    lastView = null;
    lastPolled = '';
    hubPad.row = 0;
    $('stage').innerHTML = '';
    showHubSetup(null);
    renderRunOver();
    renderBestChip();
  }

  function mountGame(gameId) {
    unmountGame();
    const stage = $('stage');
    stage.innerHTML = '<div class="loading">Loading…</div>';
    const mounting = { gameId: gameId, renderer: null };
    current = mounting;
    Ark.loadRenderer('host', gameId).then(function (renderer) {
      if (current !== mounting) return; // switched games while loading
      stage.innerHTML = '';
      mounting.renderer = renderer;
      renderer.mount(stage, { player: state.player, game: currentGame() });
      if (pendingView) renderer.update(pendingView);
      pendingView = null;
      renderPadFooter();
    }).catch(function (err) {
      stage.innerHTML = '<div class="loading">' + Ark.escapeHtml(err.message) + '</div>';
    });
  }

  socket.on('room:state', function (s) {
    if (state) {
      if (s.player && !state.player) ArkSound.play('join');
      else if (!s.player && state.player) ArkSound.play('leave');
      if (s.phase === 'playing' && state.phase !== 'playing') ArkSound.play('start');
    }
    state = s;
    reconcilePad();
    // The picker follows the seat: closed when the player leaves or a game starts.
    if (picker) {
      if (!s.player || s.phase === 'playing') picker.close();
      else picker.update(s.player.profile);
    }
    const playing = s.phase === 'playing';
    $('lobby').classList.toggle('hidden', playing);
    $('stage').classList.toggle('hidden', !playing);
    $('to-lobby').classList.toggle('hidden', !playing);

    if (playing) {
      if (!current || current.gameId !== s.gameId) mountGame(s.gameId);
    } else {
      unmountGame();
      renderLobby();
    }
    renderPadFooter();
    updateMusic();
    showHubSetup(Ark.setup.isHub(lastView) ? lastView : null);
  });

  socket.on('game:view', function (msg) {
    if (!current || current.gameId !== msg.gameId) return;
    const setup = Ark.setup.isHub(msg.view);
    if (!setup) playGameSounds(Ark.setup.isHub(lastView) ? null : lastView, msg.view);
    const wasSetup = Ark.setup.isHub(lastView);
    lastView = msg.view;
    updateMusic();
    showHubSetup(setup ? msg.view : null);
    renderBestChip();
    renderRunOver();
    if (setup !== wasSetup) renderPadFooter();
    if (setup) return; // the game hasn't started: the hub shows its setup screen
    if (current.renderer) current.renderer.update(msg.view);
    else pendingView = msg.view;
  });

  // ---- the hub's setup screen ------------------------------------------
  // For games wrapped with withSetup on the server: pick settings on the
  // phone or with a controller, then start.

  const hubPad = { row: 0 };
  let hubSetupKey = '';

  function showHubSetup(v) {
    const playing = Boolean(state && state.phase === 'playing');
    $('hub-setup').classList.toggle('hidden', !v || !playing);
    $('stage').classList.toggle('hidden', Boolean(v) || !playing);
    if (!v) {
      hubSetupKey = '';
      return;
    }
    const parts = Ark.setup.hubParts(v);
    const local = Boolean(state.player && state.player.local);
    const focusKey = local ? parts.rows[hubPad.row % parts.rows.length].key : null;
    const key = JSON.stringify([v.hubSetup.settings, focusKey]);
    if (key === hubSetupKey) return;
    hubSetupKey = key;
    const game = currentGame();
    $('hub-setup').innerHTML =
      '<div class="hub-title">' + Ark.escapeHtml(game ? game.name : '') + '</div>' +
      '<p class="muted">' + (local
        ? '↑↓ picks a row, ←→ changes it, <strong>A</strong> (or Enter) starts.'
        : 'Pick the settings on your phone, then press <strong>Start</strong>.') + '</p>' +
      Ark.setup.html(parts.view, parts.rows, focusKey);
    // A tall setup scrolls: keep the controller's row in view.
    const row = $('hub-setup').querySelector('.row.focus');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  // ---- controllers and the keyboard --------------------------------------
  // Read on this page (see gamepads.js). Their player is the "local" seat on
  // the server; this page sends the input with pad:input.

  const PAD_KEY = 'ark.pad';
  let padSeat = null; // { idx, token, name? } while a controller (or the keyboard) holds the seat
  let connectedPads = [];
  let focus = 0; // the game card the controller has selected in the lobby
  let padMessage = '';
  let padMessageTimer = null;

  // Self-update (desktop app): a banner in the lobby. Tap it, or press RT on a controller (U on the keyboard).
  let update = { state: 'idle' };
  const UPDATE_TEXT = {
    available: function (u) { return '⬆ Version ' + u.version + ' is out · <strong>Update</strong>'; },
    downloading: function (u) { return 'Downloading version ' + u.version + '… ' + u.percent + ' %'; },
    ready: function (u) {
      return 'Version ' + u.version + ' is downloaded · <strong>' + (u.relaunch === false ? 'Install and close' : 'Restart now') + '</strong>';
    },
    error: function () { return 'Couldn\'t update · <strong>Download page</strong>'; },
  };
  function updateActionable() {
    return update.state === 'available' || update.state === 'ready' || update.state === 'error';
  }
  function renderUpdate() {
    const show = Boolean(UPDATE_TEXT[update.state]);
    $('update').classList.toggle('hidden', !show);
    if (!show) return;
    $('update').innerHTML = UPDATE_TEXT[update.state](update) +
      (updateActionable() && connectedPads.length ? ' <span class="pad-key">RT</span>' : '');
    $('update').disabled = !updateActionable();
    $('update').classList.toggle('busy', update.state === 'downloading');
  }
  if (desktop) {
    desktop.onUpdate(function (u) {
      update = u || { state: 'idle' };
      renderUpdate();
    });
    $('update').addEventListener('click', function () {
      if (updateActionable()) desktop.update();
    });
  }

  const padName = function (idx) { return idx === ArkPads.KEYBOARD ? 'Keyboard' : 'Controller ' + (idx + 1); };

  function savePad() {
    // Until the room is known (a refresh is still resuming), there's nothing to save yet;
    // saving now would wipe the seat restorePad() is about to take back.
    if (!roomCode) return;
    try { localStorage.setItem(PAD_KEY, JSON.stringify({ code: roomCode, seat: padSeat })); } catch (e) { /* private mode */ }
  }

  // After a TV refresh, take the seat back (only within the same room).
  function restorePad(code) {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(PAD_KEY)); } catch (e) { /* ignore */ }
    padSeat = null;
    if (!stored || stored.code !== code || !stored.seat) return savePad();
    const seat = stored.seat;
    socket.emit('pad:join', { name: seat.name || padName(seat.idx), token: seat.token }, function (res) {
      if (!res || !res.ok) return savePad();
      padSeat = { idx: seat.idx, token: res.token, name: seat.name };
      savePad();
      if (state && state.phase !== 'playing') renderLobby();
    });
  }

  // Drop the seat if the server no longer has it (left, or a phone took it over).
  function reconcilePad() {
    if (padSeat && !(state.player && state.player.local)) {
      padSeat = null;
      savePad();
    }
  }

  function flashPad(msg) {
    padMessage = msg;
    clearTimeout(padMessageTimer);
    padMessageTimer = setTimeout(function () { padMessage = ''; renderPadHint(); }, 3000);
    renderPadHint();
  }

  function renderPadHint() {
    let text;
    if (padMessage) text = padMessage;
    else if (padSeat) text = '🎮 D-pad / arrows pick a game · A / Enter play · Y / E change name · X / Q avatar · B / Backspace leave';
    else if (state && state.player) text = '';
    else if (connectedPads.length) text = '🎮 Press A (or Enter) to play here without a phone.';
    else text = '🎮 Got a controller? Connect it to this screen and press A. Or use the keyboard: arrows + Enter.';
    $('pad-hint').textContent = text;
    renderUpdate(); // its RT tag shows while a controller is connected
  }

  function renderPadFooter() {
    const el = $('pad-footer');
    const r = current && current.renderer;
    const setup = Ark.setup.isHub(lastView);
    const show = Boolean(state && state.phase === 'playing' && padSeat && (setup || (r && r.padHint)));
    el.classList.toggle('hidden', !show);
    if (show) el.textContent = '🎮 ' + (setup ? '↑↓ pick a row · ←→ change it · A start' : r.padHint) + ' · Back / Esc: lobby';
  }

  // Ready-made names, after the high-score table's (so scores count for the right person).
  const PAD_NAMES = ['Ace', 'Blaze', 'Comet', 'Dash', 'Echo', 'Flash', 'Ghost', 'Hero', 'Jet', 'Nova', 'Pixel', 'Rocket', 'Turbo', 'Zap'];

  /** Controllers can't type: Y cycles the name through known names, then ready-made ones. */
  function renamePad() {
    const names = [];
    [padName(padSeat.idx)].concat(state.knownNames || [], PAD_NAMES).forEach(function (n) {
      if (!names.some(function (m) { return m.toLowerCase() === n.toLowerCase(); })) names.push(n);
    });
    const now = state.player ? state.player.name.toLowerCase() : '';
    const at = names.findIndex(function (n) { return n.toLowerCase() === now; });
    const name = names[(at + 1) % names.length];
    socket.emit('pad:rename', { name: name }, function (res) {
      if (!res || !res.ok) return flashPad('🎮 ' + ((res && res.error) || "Couldn't rename."));
      padSeat.name = res.name;
      savePad();
      flashPad('🎮 Playing as ' + res.name + ' · press Y (or E) again for another name');
    });
  }

  function joinPad(idx) {
    socket.emit('pad:join', { name: padName(idx) }, function (res) {
      if (!res || !res.ok) return flashPad('🎮 ' + ((res && res.error) || "Couldn't join."));
      padSeat = { idx: idx, token: res.token };
      savePad();
      ArkPads.rumble(idx, 150);
      if (state && state.phase !== 'playing') renderLobby(); // show the controller's focus right away
    });
  }

  ArkPads.onChange(function (list) {
    connectedPads = list;
    // A controller unplugged in the lobby gives up the seat; mid-game it keeps it.
    if (padSeat && state && state.phase !== 'playing' && list.indexOf(padSeat.idx) === -1) {
      socket.emit('pad:leave');
      padSeat = null;
      savePad();
    }
    if (state && state.phase !== 'playing') renderLobby();
  });

  // Real-time games read held buttons / sticks every frame via the renderer's
  // padPoll(); we only send when the resulting input changes.
  ArkPads.onFrame(function () {
    const r = current && current.renderer;
    if (!padSeat || !state || state.phase !== 'playing' || !r || !r.padPoll || !lastView || Ark.setup.isHub(lastView) || lastView.phase === 'over') return;
    const input = r.padPoll({ held: ArkPads.held(padSeat.idx), stick: ArkPads.stick(padSeat.idx) }, lastView);
    const key = input ? JSON.stringify(input) : '';
    if (!input || key === lastPolled) return;
    lastPolled = key;
    socket.emit('pad:input', { input: input });
  });

  const send = function (input) { socket.emit('pad:input', { input: input }); };

  // Typing on the TV's keyboard, for games with a typing(key, view) hook (letters in Word Guess,
  // digits in Sudoku): only while the keyboard holds the seat and the game is on.
  ArkPads.setTyping(function (key) {
    const r = current && current.renderer;
    if (!r || !r.typing || !padSeat || padSeat.idx !== ArkPads.KEYBOARD || !state || state.phase !== 'playing') return false;
    if (!lastView || Ark.setup.isHub(lastView) || lastView.phase === 'over') return false;
    const input = r.typing(key, lastView);
    if (input) send(input);
    return Boolean(input);
  });

  ArkPads.onPress(function (idx, btn) {
    if (!state) return;
    const mine = padSeat && padSeat.idx === idx;

    if (state.phase === 'playing') {
      if (!mine) return;
      if (btn === 'BACK') return socket.emit('lobby:return');
      if (Ark.setup.isHub(lastView)) {
        const parts = Ark.setup.hubParts(lastView);
        const input = Ark.setup.pad(btn, parts.view, parts.rows, hubPad);
        if (input) send(input);
        showHubSetup(lastView);
        return;
      }
      if (lastView && lastView.phase === 'over') {
        if (lastView.daily && (btn === 'A' || btn === 'START')) socket.emit('lobby:return'); // one go a day
        else if (btn === 'A' || btn === 'START') send({ type: 'rematch' });
        else if (btn === 'Y' && lastView.hubSetup) send({ type: 'setup' });
        else if (btn === 'B') socket.emit('lobby:return');
        return;
      }
      const r = current && current.renderer;
      if (!r || !r.pad || !lastView) return;
      const input = r.pad(btn, lastView);
      if (input) {
        send(input);
        ArkPads.rumble(idx, 40);
      }
      return;
    }

    // Lobby. RT (any controller, or U on the keyboard) presses the update banner.
    if (btn === 'RT' && desktop && updateActionable()) return desktop.update();
    if (!padSeat) {
      if (btn === 'A' || btn === 'START') {
        if (state.player && state.player.connected) flashPad('📱 ' + state.player.name + ' is playing on a phone.');
        else joinPad(idx);
      }
      return;
    }
    if (!mine) return;
    if (picker) return picker.press(btn);
    if (btn === 'X') return openPicker();
    const cards = lobbyCards();
    const n = cards.length;
    if (btn === 'Y') return renamePad();
    if (btn === 'B') {
      socket.emit('pad:leave');
      padSeat = null;
      savePad();
    } else if (btn === 'LEFT') {
      focus = (focus + n - 1) % n;
    } else if (btn === 'RIGHT') {
      focus = (focus + 1) % n;
    } else if (btn === 'UP' || btn === 'DOWN') {
      // Up and down go to the card above or below on screen, not the next in the list.
      focus = Ark.stepVertical($('game-list').querySelectorAll('.game-card'), focus, btn === 'UP' ? -1 : 1);
    } else if (btn === 'A' || btn === 'START') {
      socket.emit('lobby:start', { gameId: cards[focus].id }, function (res) {
        if (res && res.error) flashPad('⚠️ ' + res.error);
      });
      return;
    } else {
      return;
    }
    renderLobby();
  });
})();
