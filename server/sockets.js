const asObject = (data) => (data && typeof data === 'object' ? data : {});
const reply = (ack, payload) => {
  if (typeof ack === 'function') ack(payload);
};

/**
 * Socket protocol (client -> server):
 *   host:create   { origin }                -> ack { ok, code, hostToken, qr }
 *   host:resume   { code, hostToken, origin } -> ack { ok, code, hostToken, qr }  (reopens the room after a restart)
 *   player:join   { code, name, token? }    -> ack { ok, code, token, name }
 *   player:leave
 *   lobby:start   { gameId | 'random' }     -> ack { ok, gameId } | { error }
 *   lobby:return
 *   game:input    { type, ... }              (the phone player only, game-specific)
 *
 * A controller or the keyboard at the TV (host only):
 *   pad:join      { name, token? }           -> ack { ok, token, name }
 *   pad:leave
 *   pad:input     { input }                  (only while the seat was taken with pad:join)
 *   pad:rename    { name }                   -> ack { ok, name } | { error }
 *   profile:set   { avatar?, colour? }       -> ack { ok, profile } | { error }  (the phone, or the TV)
 *   host:kick                                -> ack { ok } | { error }  (the TV frees the seat)
 *
 * Server -> client:
 *   room:state    Room#publicState()
 *   host:qr       { qr }                     (TV only: join address changed in Settings)
 *   game:view     { gameId, view }           (the TV and the phone each get their own view)
 *   player:kicked { reason, removed? }       (this phone lost the seat; `removed`: the TV took it away)
 *   player:ping   ack()                      (are you still there? see player:join)
 */
/** How long a phone gets to answer "still there?" before its seat counts as free. */
export const PING_MS = 2500;

export function registerSocketHandlers(io, rooms, { refreshJoin }) {
  /** Does this seated phone still answer? */
  function answers(player) {
    const s = player && player.socketId && io.sockets.sockets.get(player.socketId);
    if (!s) return Promise.resolve(false);
    return new Promise((resolve) => s.timeout(PING_MS).emit('player:ping', (err) => resolve(!err)));
  }

  io.on('connection', (socket) => {
    // What this socket is bound to. A socket is in at most one room at a time.
    let room = null;
    let role = null;

    function detach() {
      if (!room) return;
      socket.leave(room.allChannel);
      if (role === 'host') {
        socket.leave(room.hostChannel);
        room.hostSockets.delete(socket.id);
        room.syncLocalPlayer();
      } else if (role === 'player') {
        socket.leave(room.playerChannel);
        const p = room.player;
        if (p && p.socketId === socket.id) {
          p.connected = false;
          p.socketId = null;
        }
      }
      room.touch();
      room.broadcastState();
      room = null;
      role = null;
    }

    /** Another socket took this one's seat (or the TV removed it): stop acting for that player. */
    socket.data.unseat = (msg) => {
      if (role !== 'player' || !room) return;
      socket.leave(room.playerChannel);
      socket.leave(room.allChannel);
      room = null;
      role = null;
      socket.emit('player:kicked', msg);
    };

    function bindHost(target) {
      detach();
      room = target;
      role = 'host';
      socket.join(room.allChannel);
      socket.join(room.hostChannel);
      room.hostSockets.add(socket.id);
      room.syncLocalPlayer();
      room.touch();
      room.broadcastState();
      room.sendSnapshot(socket, 'host');
    }

    function bindPlayer(target) {
      detach();
      room = target;
      role = 'player';
      const p = room.player;
      // If the same player was connected on another socket (old tab), that tab loses the seat.
      if (p.socketId && p.socketId !== socket.id) {
        const old = io.sockets.sockets.get(p.socketId);
        if (old && old.data.unseat) old.data.unseat({ reason: 'You joined from another tab or device.' });
      }
      p.socketId = socket.id;
      p.connected = true;
      socket.join(room.allChannel);
      socket.join(room.playerChannel);
      room.touch();
      room.broadcastState();
      room.sendSnapshot(socket, 'player');
    }

    socket.on('host:create', async (data, ack) => {
      const { origin } = asObject(data);
      const target = rooms.create();
      target.hostOrigin = typeof origin === 'string' ? origin : null;
      await refreshJoin(target);
      bindHost(target);
      reply(ack, { ok: true, code: target.code, hostToken: target.hostToken, qr: target.qr });
    });

    socket.on('host:resume', async (data, ack) => {
      const { code, hostToken, origin } = asObject(data);
      let target = rooms.get(code);
      if (target && target.hostToken !== hostToken) return reply(ack, { error: 'Room not found.' });
      if (!target) {
        // The server restarted (an update, a power cut): open the same room again,
        // so the phone (or controller) that knew it rejoins by itself.
        target = rooms.create({ code, hostToken });
        if (target.hostToken !== hostToken) {
          rooms.rooms.delete(target.code);
          target.dispose();
          return reply(ack, { error: 'Room not found.' });
        }
        target.hostOrigin = typeof origin === 'string' ? origin : null;
        await refreshJoin(target);
      }
      bindHost(target);
      reply(ack, { ok: true, code: target.code, hostToken: target.hostToken, qr: target.qr });
    });

    socket.on('player:join', async (data, ack) => {
      const { code, name, token } = asObject(data);
      const target = rooms.get(code);
      if (!target) return reply(ack, { error: 'No room with that code.' });
      let seat = target.seatPlayer(name, token);
      // Someone joins under the name of a phone that looks connected. A reloaded page
      // doesn't always close its connection, so the server may not know it's gone yet:
      // ask that phone. No answer means it's gone, and this is the same person back.
      if (seat.clash && !(await answers(target.player))) {
        const p = target.player;
        const old = p && p.socketId && io.sockets.sockets.get(p.socketId);
        if (old) old.disconnect(true);
        if (p) {
          p.connected = false;
          p.socketId = null;
        }
        seat = target.seatPlayer(name, token);
      }
      if (seat.error) return reply(ack, { error: seat.error });
      bindPlayer(target);
      reply(ack, { ok: true, code: target.code, token: seat.player.token, name: seat.player.name });
    });

    socket.on('player:leave', (_data, ack) => {
      if (role !== 'player') return reply(ack, { ok: true });
      const target = room;
      const mine = target.player && target.player.socketId === socket.id;
      detach();
      if (mine) target.removePlayer();
      reply(ack, { ok: true });
    });

    socket.on('lobby:start', (data, ack) => {
      if (!room) return reply(ack, { error: 'Not in a room.' });
      reply(ack, room.startGame(asObject(data).gameId));
    });

    socket.on('lobby:return', (_data, ack) => {
      if (room && room.game) room.stopGame();
      reply(ack, { ok: true });
    });

    socket.on('game:input', (data) => {
      if (role === 'player' && room && room.player && room.player.socketId === socket.id) room.handleInput(data);
    });

    socket.on('pad:join', (data, ack) => {
      if (role !== 'host') return reply(ack, { error: 'Only the TV can add controller players.' });
      const { name, token } = asObject(data);
      const seat = room.seatPlayer(name, token, { local: true });
      if (seat.error) return reply(ack, { error: seat.error });
      room.touch();
      room.broadcastState();
      reply(ack, { ok: true, token: seat.player.token, name: seat.player.name });
    });

    socket.on('pad:leave', (_data, ack) => {
      if (role === 'host' && room.player && room.player.local) room.removePlayer();
      reply(ack, { ok: true });
    });

    socket.on('pad:input', (data) => {
      if (role === 'host' && room.player && room.player.local) room.handleInput(asObject(data).input);
    });

    // The player's avatar and colour: from their phone, or from the TV (for whoever is seated).
    socket.on('profile:set', (data, ack) => {
      const seated = room && room.player && (role === 'host' || (role === 'player' && room.player.socketId === socket.id));
      if (!seated) return reply(ack, { error: 'Join first.' });
      const { avatar, colour } = asObject(data);
      reply(ack, room.setProfile({ avatar, colour }));
    });

    socket.on('pad:rename', (data, ack) => {
      if (role !== 'host') return reply(ack, { error: 'Only the TV can rename controller players.' });
      reply(ack, room.renameLocal(asObject(data).name));
    });

    socket.on('host:kick', (_data, ack) => {
      if (role !== 'host') return reply(ack, { error: 'Only the TV can remove the player.' });
      const p = room.player;
      if (!p) return reply(ack, { error: 'Nobody is playing.' });
      const phone = p.socketId && io.sockets.sockets.get(p.socketId);
      if (phone && phone.data.unseat) phone.data.unseat({ reason: 'The TV removed you from the room.', removed: true });
      room.touch();
      room.removePlayer();
      reply(ack, { ok: true });
    });

    socket.on('disconnect', detach);
  });
}
