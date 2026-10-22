// High scores and recent runs, from /api/stats (see server/stats.js).
(function () {
  const esc = Ark.escapeHtml;
  const $ = function (id) { return document.getElementById(id); };

  // Phones arrive from /play/, the TV from /host/: send each back where it came from.
  if (/\/play\//.test(document.referrer)) $('back').href = '/play/';

  function ago(at) {
    const s = Math.round((Date.now() - at) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(at).toLocaleDateString();
  }

  const MEDALS = ['🥇', '🥈', '🥉'];

  /** One game's (and variant's) top 10. */
  function board(g) {
    return '<section class="panel"><h2>' + esc(g.gameName) + (g.variant ? ' <span class="tag">' + esc(g.variant) + '</span>' : '') +
      ' <span class="muted count">' + g.runs + ' run' + (g.runs === 1 ? '' : 's') + (g.better === 'lower' ? ' · lower is better' : '') + '</span></h2>' +
      '<table><tbody>' + g.top.map(function (r, i) {
        return '<tr><td class="rank' + (i === 0 ? ' gold' : '') + '">' + (MEDALS[i] || i + 1) + '</td><td>' + esc(r.name) + '</td>' +
          '<td class="num"><strong>' + Ark.formatScore(r.score, g.unit) + '</strong></td><td class="num when">' + ago(r.at) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  function players(list) {
    return '<section class="panel"><h2>Players</h2><table><thead><tr><th>Player</th><th class="num">Runs</th><th class="num">Games</th><th class="num">Last played</th></tr></thead><tbody>' +
      list.map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td class="num">' + p.runs + '</td><td class="num">' + p.games + '</td><td class="num when">' + ago(p.last) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  function recent(runs, games) {
    const unit = {};
    games.forEach(function (g) { unit[g.game] = g.unit; });
    return '<section class="panel wide"><h2>Latest runs</h2><table><tbody>' + runs.map(function (r) {
      return '<tr><td>' + esc(r.player) + '</td><td>' + esc(r.gameName) + (r.variant ? ' <span class="tag">' + esc(r.variant) + '</span>' : '') + '</td>' +
        '<td class="num">' + Ark.formatScore(r.score, r.unit || unit[r.game]) + '</td><td class="num when">' + ago(r.at) + '</td></tr>';
    }).join('') + '</tbody></table></section>';
  }

  fetch('/api/stats', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.total) {
      $('content').innerHTML = '<p class="empty">No scores yet. Play a game and your best will show up here.</p>';
      return;
    }
    $('content').innerHTML = '<div class="grid">' + d.games.map(board).join('') + players(d.players) + recent(d.recent, d.games) + '</div>';
  }).catch(function () {
    $('content').innerHTML = '<p class="empty">Couldn\'t load the scores. Is the hub running?</p>';
  });
})();
