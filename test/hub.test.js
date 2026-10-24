import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { Room } from '../server/rooms.js';
import { Stats } from '../server/stats.js';
import { listGames, getGame, CATEGORIES, MUSIC_MOODS } from '../server/games/index.js';

let server;
let url;
let dataDir;
const sockets = [];

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark1p-hub-'));
  server = createApp({ port: 0, publicUrl: 'http://tv.local:3000', dataDir, https: false });
  const addr = await server.listen();
  url = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  for (const s of sockets) s.close();
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function client() {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

const call = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));

/** Resolve with the next `event` payload that satisfies `pred`. */
function next(socket, event, pred = () => true) {
  return new Promise((resolve) => {
    const handler = (msg) => {
      if (pred(msg)) {
        socket.off(event, handler);
        resolve(msg);
      }
    };
    socket.on(event, handler);
  });
}

test('every game is well formed', () => {
  const ids = new Set();
  for (const g of listGames()) {
    assert.ok(!ids.has(g.id), `${g.id} listed once`);
    ids.add(g.id);
    assert.ok(CATEGORIES.includes(g.category), `${g.id} category`);
    assert.ok(MUSIC_MOODS.includes(g.music), `${g.id} music`);
    assert.ok(['higher', 'lower'].includes(g.score.better), `${g.id} score.better`);
    assert.ok(['pts', 'ms', 'time', 'tries', 'moves', 'm'].includes(g.score.unit), `${g.id} score.unit`);
    assert.ok(fs.existsSync(`public/games/${g.id}/host.js`), `${g.id} TV renderer`);
    assert.ok(fs.existsSync(`public/games/${g.id}/player.js`), `${g.id} phone renderer`);
    assert.equal(typeof getGame(g.id).create, 'function');
  }
});

test('host creates a room with a QR join link', async () => {
  const host = client();
  const res = await call(host, 'host:create', { origin: 'http://localhost:3000' });
  assert.ok(res.ok);
  assert.match(res.code, /^[A-Z]{4}$/);
  assert.match(res.qr, /^data:image\/png;base64,/);
  assert.equal(server.rooms.get(res.code).publicState().joinUrl, `http://tv.local:3000/play/?room=${res.code}`);
});

test('a phone joins, plays a run, and its score is recorded as a best', async () => {
  const host = client();
  const { code } = await call(host, 'host:create', {});
  const phone = client();
  const ready = next(host, 'room:state', (s) => s.readyToPlay);
  const j = await call(phone, 'player:join', { code: code.toLowerCase(), name: '  Ana ' });
  assert.equal(j.name, 'Ana');
  await ready;

  // A second phone can't take the seat while Ana is here.
  const other = client();
  assert.match((await call(other, 'player:join', { code, name: 'Ben' })).error, /Ana is playing/);

  const tvView = next(host, 'game:view', (m) => m.gameId === 'reaction');
  const phoneView = next(phone, 'game:view', (m) => m.gameId === 'reaction');
  assert.deepEqual(await call(phone, 'lobby:start', { gameId: 'reaction' }), { ok: true, gameId: 'reaction' });
  assert.equal((await tvView).view.best, null);
  assert.equal((await phoneView).view.phase, 'ready');

  // Play it on the server's clock: drive the game directly, then let the room push the end.
  const room = server.rooms.get(code);
  room.game.times = [200, 200, 200, 200];
  room.game.phase = 'go';
  room.game.goAt = Date.now() - 300;
  const over = next(phone, 'game:view', (m) => m.view.phase === 'over');
  const lobbyBest = next(host, 'room:state', (s) => s.games.find((g) => g.id === 'reaction').best);
  phone.emit('game:input', { type: 'tap' });
  const end = (await over).view;
  assert.ok(end.score >= 220 && end.score < 400);
  assert.equal(end.record.newBest, true);
  assert.equal(end.record.rank, 1);
  assert.equal(end.best, end.score);
  assert.equal((await lobbyBest).games.find((g) => g.id === 'reaction').best.score, end.score);

  const lb = await (await fetch(url + '/api/stats')).json();
  assert.equal(lb.total, 1);
  assert.equal(lb.games[0].top[0].name, 'Ana');
  // Her first run also unlocked achievements, listed for her by name.
  assert.ok(end.record.unlocked.some((a) => a.id === 'first-run'));
  const ach = await (await fetch(url + '/api/achievements?name=ana')).json();
  assert.equal(ach.list.find((a) => a.id === 'first-run').at > 0, true);
  assert.equal(ach.got, end.record.unlocked.length);
  assert.ok(ach.list.every((a) => a.check === undefined));

  // Back to the lobby, then leave: the seat is free for someone else.
  const lobby = next(host, 'room:state', (s) => s.phase === 'lobby');
  await call(phone, 'lobby:return');
  await lobby;
  await call(phone, 'player:leave');
  assert.ok((await call(other, 'player:join', { code, name: 'Ben' })).ok);
});

test('a phone that reconnects with its token gets its seat back', async () => {
  const host = client();
  const { code } = await call(host, 'host:create', {});
  const a = client();
  const j = await call(a, 'player:join', { code, name: 'Cat' });
  a.close();
  await next(host, 'room:state', (s) => s.player && !s.player.connected);
  // While Cat is away, anyone could take the seat; Cat's own token takes it back first.
  const b = client();
  const again = await call(b, 'player:join', { code, name: 'Cat', token: j.token });
  assert.ok(again.ok);
  assert.equal(again.token, j.token);
});

test('a controller at the TV plays without a phone, and the TV can free the seat', async () => {
  const host = client();
  const { code } = await call(host, 'host:create', {});
  const pad = await call(host, 'pad:join', { name: 'Controller 1' });
  assert.ok(pad.ok);
  assert.equal((await call(host, 'pad:rename', { name: 'Ace' })).name, 'Ace');
  const phone = client();
  assert.match((await call(phone, 'player:join', { code, name: 'Dee' })).error, /Ace is playing/);

  const view = next(host, 'game:view', (m) => m.gameId === 'maths');
  assert.ok((await call(host, 'lobby:start', { gameId: 'maths' })).ok);
  assert.equal((await view).view.phase, 'ready');
  host.emit('pad:input', { input: { type: 'answer', choice: 0 } }); // ignored before the countdown ends: no crash

  assert.ok((await call(host, 'host:kick')).ok);
  assert.equal(server.rooms.get(code).player, null);
  assert.equal(server.rooms.get(code).game, null);
  assert.ok((await call(phone, 'player:join', { code, name: 'Dee' })).ok);
});

test('a game with a setup screen waits for go; random picks a real game', async () => {
  const host = client();
  const { code } = await call(host, 'host:create', {});
  const phone = client();
  await call(phone, 'player:join', { code, name: 'Eve' });
  const setup = next(phone, 'game:view', (m) => m.gameId === 'snake' && m.view.phase === 'setup');
  await call(phone, 'lobby:start', { gameId: 'snake' });
  assert.deepEqual((await setup).view.hubSetup.settings, { speed: 'normal', walls: 'solid', look: 'classic' });
  const picked = next(phone, 'game:view', (m) => m.view.hubSetup && m.view.hubSetup.settings.walls === 'wrap');
  phone.emit('game:input', { type: 'setting', key: 'walls', value: 'wrap' });
  await picked;
  const counting = next(phone, 'game:view', (m) => m.view.phase === 'countdown');
  phone.emit('game:input', { type: 'go' });
  await counting;
  const res = await call(phone, 'lobby:start', { gameId: 'random' });
  assert.ok(res.ok && getGame(res.gameId) && res.gameId !== 'snake');
});

test('a run that scores nothing, or doesn\'t count, is not recorded', () => {
  const io = { to: () => ({ emit() {} }) };
  const stats = new Stats(null);
  const room = new Room('ABCD', io, { stats });
  room.hostSockets.add('tv');
  room.seatPlayer('Fay', null, { local: true });
  room.startGame('simon');
  room.recordResult({ phase: 'over', score: 0 });
  assert.equal(room.result.score, null);
  assert.equal(room.result.zero, true);
  assert.deepEqual(room.result.unlocked, [], 'nothing to unlock for a run that scored nothing');
  room.startGame('minesweeper');
  room.recordResult({ phase: 'over', score: null, variant: 'Easy' });
  assert.equal(room.result.score, null);
  // Lower is better: a time is a time, however short.
  room.startGame('reaction');
  room.recordResult({ phase: 'over', score: 180 });
  assert.equal(room.result.newBest, true);
  assert.equal(stats.runs.length, 1);
  room.dispose();
});
