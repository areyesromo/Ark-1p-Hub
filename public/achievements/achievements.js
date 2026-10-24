// A player's achievements (?name=), from /api/achievements; without a name, pick a player.
(function () {
  const esc = Ark.escapeHtml;
  const $ = function (id) { return document.getElementById(id); };
  if (/\/play\//.test(document.referrer)) $('back').href = '/play/';
  const name = new URLSearchParams(location.search).get('name') || '';
  if (name) {
    $('to-col').href = '/collection/?name=' + encodeURIComponent(name);
    $('to-cal').href = '/calendar/?name=' + encodeURIComponent(name);
  }

  function card(a) {
    const when = a.at ? new Date(a.at).toLocaleDateString() : '';
    return '<div class="ach' + (a.at ? ' got' : '') + '"><span class="icon">' + esc(a.icon) + '</span><span class="what"><strong>' + esc(a.name) + '</strong>' +
      '<span class="desc">' + esc(a.desc) + '</span>' + (when ? '<span class="when">Unlocked ' + esc(when) + '</span>' : '') + '</span></div>';
  }

  function group(title, list, wide) {
    const got = list.filter(function (a) { return a.at; }).length;
    return '<section class="panel group' + (wide ? ' wide' : '') + '"><h2>' + esc(title) + ' <span class="muted">' + got + ' / ' + list.length + '</span></h2><div class="list">' + list.map(card).join('') + '</div></section>';
  }

  function showPlayer(d) {
    const groups = [];
    const byGame = {};
    d.list.forEach(function (a) {
      const key = a.game || '';
      if (!byGame[key]) {
        byGame[key] = [];
        groups.push({ key: key, title: a.game ? a.gameName : '🏠 The whole hub' });
      }
      byGame[key].push(a);
    });
    const pct = d.total ? Math.round((d.got / d.total) * 100) : 0;
    $('content').innerHTML =
      '<div class="who">' + Ark.avatarHtml(d.profile, 'big') + '<span class="name">' + esc(d.name) + '</span><span class="count">⭐ ' + d.got + ' / ' + d.total + '</span>' +
      '<span class="bar"><i style="width:' + pct + '%"></i></span></div>' +
      '<div class="grid">' + groups.map(function (g) { return group(g.title, byGame[g.key], !g.key); }).join('') + '</div>';
  }

  function pickPlayer() {
    fetch('/api/stats', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.players.length) {
        $('content').innerHTML = '<p class="empty">Nobody has played yet. Finish a run of any game for your first achievement.</p>';
        return;
      }
      $('content').innerHTML = '<p class="muted">Whose achievements?</p><div class="players">' + d.players.map(function (p) {
        return '<a class="btn" href="' + Ark.achievementsUrl(p.name) + '">' + Ark.avatarHtml((d.profiles || {})[p.name.trim().toLowerCase()], 'small') + ' ' + esc(p.name) + ' <span class="muted">⭐ ' + (p.achievements || 0) + '</span></a>';
      }).join('') + '</div>';
    });
  }

  if (!name) return pickPlayer();
  fetch('/api/achievements?name=' + encodeURIComponent(name), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(showPlayer).catch(function () {
    $('content').innerHTML = '<p class="empty">Couldn\'t load the achievements. Is the hub running?</p>';
  });
})();
