import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect } from 'socket.io-client';
import { Profiles, AVATARS, COLOURS, defaultProfile } from '../server/profiles.js';
import { createApp } from '../server/app.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ark1p-profiles-'));

test('a name has the same default profile every time, whatever its case', () => {
  const a = defaultProfile('Ana');
  assert.deepEqual(a, defaultProfile(' ana '));
  assert.ok(AVATARS.includes(a.avatar));
  assert.ok(COLOURS.includes(a.colour));
  assert.deepEqual(new Profiles(null).get('Ana'), a);
});

test('only avatars and colours from the lists can be picked, and picks are kept', () => {
  const dir = tmp();
  const p = new Profiles(dir);
  assert.equal(p.set('Ana', { avatar: '💩', colour: 'red' }), null);
  assert.equal(p.set('', { avatar: AVATARS[0] }), null);
  const colourOnly = p.set('Ana', { colour: COLOURS[3] });
  assert.equal(colourOnly.colour, COLOURS[3]);
  assert.equal(colourOnly.avatar, defaultProfile('Ana').avatar, 'the avatar stays as it was');
  p.set('ANA', { avatar: AVATARS[5] });
  assert.deepEqual(new Profiles(dir).get('ana'), { avatar: AVATARS[5], colour: COLOURS[3] }, 'kept in profiles.json');
  assert.deepEqual(Object.keys(p.forNames(['Ana', 'Bo'])), ['ana', 'bo']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a saved pick that is no longer on the list falls back to the default', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ ana: { avatar: 'gone', colour: COLOURS[1] } }));
  assert.deepEqual(new Profiles(dir).get('Ana'), { avatar: defaultProfile('Ana').avatar, colour: COLOURS[1] });
  fs.rmSync(dir, { recursive: true, force: true });
});

let server;
let url;
let dataDir;
const sockets = [];
before(async () => {
  dataDir = tmp();
  server = createApp({ port: 0, publicUrl: 'http://tv.local:3000', dataDir, https: false });
  url = `http://127.0.0.1:${(await server.listen()).port}`;
});
after(async () => {
  for (const s of sockets) s.close();
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
const client = () => {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
};
const call = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));

test('the phone and the TV can both change the seated player\'s profile; it shows in the room and the scores', async () => {
  const tv = client();
  const { code } = await call(tv, 'host:create', {});
  const phone = client();
  assert.match((await call(phone, 'profile:set', { avatar: AVATARS[0] })).error, /Join first/);
  await call(phone, 'player:join', { code, name: 'Ana' });
  const fromPhone = await call(phone, 'profile:set', { avatar: AVATARS[2] });
  assert.equal(fromPhone.profile.avatar, AVATARS[2]);
  const state = new Promise((resolve) => tv.once('room:state', resolve));
  const fromTv = await call(tv, 'profile:set', { colour: COLOURS[4] });
  assert.deepEqual(fromTv.profile, { avatar: AVATARS[2], colour: COLOURS[4] });
  assert.deepEqual((await state).player.profile, { avatar: AVATARS[2], colour: COLOURS[4] });
  assert.match((await call(tv, 'profile:set', { avatar: 'nope' })).error, /from the list/);
  // Someone who isn't in the room can't change it.
  const stranger = client();
  assert.match((await call(stranger, 'profile:set', { avatar: AVATARS[1] })).error, /Join first/);
  const choices = await (await fetch(url + '/api/profile-choices')).json();
  assert.deepEqual(choices, { avatars: AVATARS, colours: COLOURS });
  const ach = await (await fetch(url + '/api/achievements?name=ana')).json();
  assert.deepEqual(ach.profile, { avatar: AVATARS[2], colour: COLOURS[4] });
});
