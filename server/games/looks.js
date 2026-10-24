// Looks a player unlocks by playing: a different snake, bird, tower, ship... They
// change how a game looks, never how it plays, so they don't split the scores.
// Each look's unlock is the achievement that opens it (see server/achievements.js);
// the first look of each game is open from the start.

import { settingOf } from './options.js';

export const LOOKS = {
  snake: {
    classic: { name: 'Classic' },
    rainbow: { name: '🌈 Rainbow', unlock: 'snake-10' },
    neon: { name: '💜 Neon', unlock: 'snake-25' },
    gold: { name: '👑 Gold', unlock: 'snake-50' },
  },
  flappy: {
    bird: { name: '🐤 Bird' },
    bat: { name: '🦇 Bat', unlock: 'flappy-10' },
    penguin: { name: '🐧 Penguin', unlock: 'flappy-25' },
    dragon: { name: '🐉 Dragon', unlock: 'flappy-50' },
  },
  breaker: {
    classic: { name: 'Classic' },
    fire: { name: '🔥 Fireball', unlock: 'breaker-level2' },
    crystal: { name: '💎 Crystal', unlock: 'breaker-level4' },
    rainbow: { name: '🌈 Rainbow', unlock: 'breaker-1000' },
  },
  runner: {
    runner: { name: '🏃 Runner' },
    robot: { name: '🤖 Robot', unlock: 'runner-100' },
    dino: { name: '🦖 Dino', unlock: 'runner-500' },
    ninja: { name: '🥷 Ninja', unlock: 'runner-1000' },
  },
  asteroids: {
    classic: { name: 'Classic' },
    rocket: { name: '🚀 Rocket', unlock: 'asteroids-wave3' },
    saucer: { name: '🛸 Saucer', unlock: 'asteroids-wave6' },
    gold: { name: '✨ Gold', unlock: 'asteroids-10k' },
  },
  invaders: {
    classic: { name: '👾 Classic' },
    ocean: { name: '🐙 Ocean', unlock: 'invaders-wave2' },
    spooky: { name: '👻 Spooky', unlock: 'invaders-saucer' },
    candy: { name: '🍭 Candy', unlock: 'invaders-5k' },
  },
  stack: {
    classic: { name: 'Classic' },
    candy: { name: '🍬 Candy', unlock: 'stack-10' },
    glass: { name: '🧊 Glass', unlock: 'stack-25' },
    gold: { name: '👑 Gold', unlock: 'stack-perfect5' },
  },
};

/** The look a game was started with, or its first one. */
export function lookOf(ctx, game) {
  const list = LOOKS[game];
  const first = Object.keys(list)[0];
  const look = settingOf(ctx, 'look', first);
  return Object.prototype.hasOwnProperty.call(list, look) ? look : first;
}
