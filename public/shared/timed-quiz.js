// Screens for the against-the-clock games (Quick Maths, Colour Trap, see
// server/games/timed-quiz.js): the question big on the TV with the four
// choices under it, four big buttons on the phone, and the clock.
//
//   ArkQuiz.host(el, { prompt(v) -> html, choice(v, i) -> html, badges: ['A', 'B', 'X', 'Y'] })
//   ArkQuiz.player(el, api, { prompt(v) -> html, choice(v, i) -> html })
// Each returns { update(v) }.
(function () {
  function clock(ms) {
    return Math.ceil(ms / 1000) + ' s';
  }

  function flash(el, last, seen) {
    if (!last || last.n === seen.n) return;
    seen.n = last.n;
    el.classList.remove('right', 'wrong');
    void el.offsetWidth; // restart the flash
    el.classList.add(last.ok ? 'right' : 'wrong');
  }

  function host(el, opts) {
    el.innerHTML = '<div class="tq-host"><div class="tq-top"><span class="tq-clock"></span><span class="tq-score"></span></div>' +
      '<div class="tq-prompt"></div><div class="tq-choices"></div><div class="tq-bar"><i></i></div></div>';
    const root = el.firstChild;
    const seen = { n: null };
    let key = '';
    return {
      update: function (v) {
        root.querySelector('.tq-clock').textContent = '⏱ ' + clock(v.timeLeft);
        root.querySelector('.tq-clock').classList.toggle('low', v.phase === 'play' && v.timeLeft < 10000);
        root.querySelector('.tq-bar i').style.width = (100 * v.timeLeft) / (v.seconds * 1000) + '%';
        root.querySelector('.tq-score').innerHTML = '✔ <strong>' + v.right + '</strong>' + (v.wrong ? ' · ✘ ' + v.wrong : '') + (v.streak > 2 ? ' · 🔥 ' + v.streak : '');
        flash(root, v.last, seen);
        const k = JSON.stringify([v.phase, v.question]);
        if (k === key) return;
        key = k;
        const q = v.question;
        if (v.phase === 'ready') root.querySelector('.tq-prompt').innerHTML = '<span class="tq-ready">Get ready…</span>';
        else if (q) root.querySelector('.tq-prompt').innerHTML = opts.prompt(v);
        root.querySelector('.tq-choices').innerHTML = q ? q.options.map(function (_, i) {
          return '<div class="tq-choice">' + (opts.badges ? '<b class="badge b' + opts.badges[i] + '">' + opts.badges[i] + '</b>' : '') + opts.choice(v, i) + '</div>';
        }).join('') : '';
      },
    };
  }

  function player(el, api, opts) {
    el.innerHTML = '<div class="tq-phone"><div class="tq-top"><span class="tq-clock"></span><span class="tq-score"></span></div>' +
      '<div class="tq-prompt"></div><div class="tq-choices"></div></div>';
    const root = el.firstChild;
    const seen = { n: null };
    let key = '';
    root.querySelector('.tq-choices').addEventListener('pointerdown', function (e) {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      e.preventDefault();
      api.send({ type: 'answer', choice: Number(b.getAttribute('data-i')) });
      api.vibrate(8);
    });
    return {
      update: function (v) {
        root.querySelector('.tq-clock').textContent = '⏱ ' + clock(v.timeLeft);
        root.querySelector('.tq-score').innerHTML = '✔ <strong>' + v.right + '</strong>' + (v.best === null || v.best === undefined ? '' : ' · best ' + v.best);
        if (v.last && v.last.n !== seen.n && !v.last.ok) api.vibrate([50, 30, 50]);
        flash(root, v.last, seen);
        const k = JSON.stringify([v.phase, v.question]);
        if (k === key) return;
        key = k;
        const q = v.question;
        root.querySelector('.tq-prompt').innerHTML = v.phase === 'ready' ? '<span class="tq-ready">Get ready…</span>' : q ? opts.prompt(v) : '';
        root.querySelector('.tq-choices').innerHTML = q ? q.options.map(function (_, i) {
          return '<button type="button" data-i="' + i + '">' + opts.choice(v, i) + '</button>';
        }).join('') : '';
      },
    };
  }

  window.ArkQuiz = { host: host, player: player };
})();
