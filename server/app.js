import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { registerSocketHandlers } from './sockets.js';
import { resolveJoin, detectLanAddress } from './network.js';
import { loadOrCreateCert } from './tls.js';
import { Settings } from './settings.js';
import { adminRouter } from './admin.js';
import { Stats } from './stats.js';
import { Profiles, AVATARS, COLOURS } from './profiles.js';
import { ACHIEVEMENTS, describe } from './achievements.js';
import { collectionFor, countOpen } from './collection.js';
import { monthDays, shiftMonth, weekOffset, streaks } from './calendar.js';
import { challengeFor, dayOf } from './daily.js';
import { listGames } from './games/index.js';

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const VERSION = {
  version: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version,
  commit: process.env.ARK_COMMIT || 'dev',
  built: process.env.ARK_BUILT || 'dev',
};

export function createApp({
  port = 3000,
  publicUrl = process.env.PUBLIC_URL,
  dataDir = process.env.DATA_DIR || path.join(ROOT_DIR, 'data'),
  adminPassword = process.env.ADMIN_PASSWORD,
  https = process.env.HTTPS !== 'off',
} = {}) {
  const app = express();
  const httpServer = http.createServer(app);
  const listener = https ? dualProtocol(httpServer, loadOrCreateCert(dataDir, certNames(publicUrl))) : httpServer;
  const io = new Server(httpServer, {
    // Phones on flaky Wi-Fi: keep the default reconnection, but notice dead sockets quickly.
    pingInterval: 10000,
    pingTimeout: 8000,
  });
  const settings = new Settings(dataDir, { envPassword: adminPassword });
  const stats = new Stats(dataDir);
  const profiles = new Profiles(dataDir);
  const rooms = new RoomManager(io, { stats, profiles });

  /** (Re)compute a room's join link + QR from the current settings. */
  async function refreshJoin(room) {
    const join = resolveJoin({ publicUrl, savedUrl: settings.joinUrl, hostOrigin: room.hostOrigin, port });
    room.joinGuess = join.guess;
    const joinUrl = `${join.base}/play/?room=${room.code}`;
    if (joinUrl === room.joinUrl) return;
    room.joinUrl = joinUrl;
    try {
      room.qr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 480 });
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  }

  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size, playing: rooms.playing }));
  app.get('/version', (_req, res) => res.json(VERSION));
  // The tables, with each player's avatar and colour (nameKey -> profile).
  app.get('/api/stats', (_req, res) => {
    const board = stats.leaderboard();
    res.json({ ...board, profiles: profiles.forNames(board.players.map((p) => p.name)) });
  });
  // What a profile can be: the avatars and colours to pick from.
  app.get('/api/profile-choices', (_req, res) => res.json({ avatars: AVATARS, colours: COLOURS }));
  // Every achievement, and which ones a player has (?name=).
  app.get('/api/achievements', (req, res) => {
    const name = String(req.query.name || '').slice(0, 32);
    const have = name ? stats.achievementsOf(name) : {};
    const games = Object.fromEntries(listGames().map((g) => [g.id, g.name]));
    const list = ACHIEVEMENTS.map((a) => ({ ...describe(a, have[a.id] || null), gameName: a.game ? games[a.game] : null }));
    res.json({ name, profile: name ? profiles.get(name) : null, got: list.filter((a) => a.at).length, total: list.length, list });
  });
  // What a player has unlocked in each game, and what's still locked (?name=).
  app.get('/api/collection', (req, res) => {
    const name = String(req.query.name || '').slice(0, 32);
    const groups = collectionFor({ have: name ? stats.achievementsOf(name) : {}, bestOf: (game, variant, better) => (name ? stats.bestFor(game, variant, name, better) : null) });
    res.json({ name, profile: name ? profiles.get(name) : null, ...countOpen(groups), groups });
  });
  // A month of the daily challenge for a player (?name=&month=YYYY-MM): each day's game, whether they
  // took part, and their streaks.
  app.get('/api/calendar', (req, res) => {
    const name = String(req.query.name || '').slice(0, 32);
    const today = dayOf(Date.now());
    const thisMonth = today.slice(0, 7);
    let month = monthDays(String(req.query.month || '')) ? String(req.query.month) : thisMonth;
    if (month > thisMonth) month = thisMonth; // nothing to show beyond the current month
    const games = Object.fromEntries(listGames().map((g) => [g.id, g]));
    const played = name ? stats.dailyDaysOf(name) : new Map();
    const days = monthDays(month).map((day) => {
      const p = played.get(day);
      const game = p ? games[p.game] : day >= today ? games[challengeFor(day).game] : null; // a missed day's game isn't known any more
      let status = day > today ? 'future' : day === today ? 'today' : 'missed';
      if (p) status = p.score === null ? 'started' : 'done';
      return { day, today: day === today, status, game: game ? game.id : null, gameName: game ? game.name : null, unit: game ? game.score.unit : null, score: p ? p.score : null };
    });
    const oldest = shiftMonth(thisMonth, -12);
    res.json({
      name,
      profile: name ? profiles.get(name) : null,
      today,
      month,
      offset: weekOffset(month),
      prev: month > oldest ? shiftMonth(month, -1) : null,
      next: month < thisMonth ? shiftMonth(month, 1) : null,
      ...streaks(played.keys(), today),
      total: played.size,
      days,
    });
  });
  app.use(
    '/api/admin',
    adminRouter({
      settings,
      stats,
      publicUrl,
      detectedJoin: () => resolveJoin({ port }),
      // New join address: refresh every open room so TVs show the new QR right away.
      onJoinUrlChange: async () => {
        for (const room of rooms.rooms.values()) {
          await refreshJoin(room);
          room.broadcastState();
          io.to(room.hostChannel).emit('host:qr', { qr: room.qr });
        }
      },
    }),
  );
  // no-cache: browsers check for a newer copy each time (a quick 304 when unchanged), so an
  // update's new art and code show straight away instead of an old cached copy.
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

  registerSocketHandlers(io, rooms, { refreshJoin });

  const sweeper = setInterval(() => rooms.sweep(), 60 * 1000);
  sweeper.unref();

  return {
    app,
    httpServer,
    io,
    rooms,
    https,
    // Fails (e.g. EADDRINUSE: the port is taken) instead of hanging.
    listen: () =>
      new Promise((resolve, reject) => {
        const failed = (err) => reject(err);
        listener.once('error', failed);
        listener.listen(port, () => {
          listener.off('error', failed);
          resolve(listener.address());
        });
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper);
        for (const room of rooms.rooms.values()) room.dispose();
        if (listener !== httpServer) listener.close();
        io.close(() => resolve());
      }),
  };
}

/** Names for the https certificate: this machine and the join address, if set. */
function certNames(publicUrl) {
  const names = ['localhost', '127.0.0.1'];
  const lan = detectLanAddress();
  if (lan) names.push(lan);
  try {
    if (publicUrl) names.push(new URL(publicUrl).hostname);
  } catch {
    // not a URL: skip it
  }
  return [...new Set(names)];
}

/**
 * http and https on one port: a TLS handshake starts with byte 0x16, plain
 * http with a letter. Either way the connection ends up at the same http
 * server (and so the same Socket.IO server and rooms); https connections
 * are decrypted on the way.
 */
function dualProtocol(httpServer, { key, cert }) {
  const secure = tls.createServer({ key, cert });
  secure.on('secureConnection', (socket) => httpServer.emit('connection', socket));
  secure.on('tlsClientError', () => {}); // e.g. a phone that hasn't accepted the certificate yet
  const open = new Set();
  const server = net.createServer((socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
    socket.on('error', () => {});
    socket.once('data', (first) => {
      socket.pause();
      socket.unshift(first);
      (first[0] === 0x16 ? secure : httpServer).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });
  // Closing drops open connections too (idle keep-alives would hold it open).
  const close = server.close.bind(server);
  server.close = (cb) => {
    close(cb);
    for (const socket of open) socket.destroy();
  };
  return server;
}
