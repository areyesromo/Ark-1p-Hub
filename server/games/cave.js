// Helicopter Cave. Hold to rise, let go to fall, and fly as far as you can
// down a winding cave without touching its walls. The cave gets narrower and
// faster as you go, and rocks start sticking out of the floor and ceiling.
// Score: metres flown.

export const FIELD = { w: 100, h: 60 };
export const COPTER = { x: 24, r: 1.8 };
export const PHYS = { gravity: 80, lift: -90, maxRise: -40, maxFall: 45 }; // units per second (squared)
export const CAVE = { col: 2, gap: 40, minGap: 20, narrowEvery: 50, slope: 0.45, bend: 0.06, margin: 3, speed: 28, maxSpeed: 46 };
export const ROCKS = { from: 120, every: 70, w: 4, h: 9 }; // the first comes 120 units after the opening screen, then one every 70
export const TIMING = { tickMs: 1000 / 60, sendEvery: 2 };
export const UNITS_PER_METRE = 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Cave {
  constructor(ctx, rng = Math.random) {
    this.ctx = ctx;
    this.rng = rng;
    this.timer = null;
  }

  start() {
    this.copter = { y: FIELD.h / 2, vy: 0 };
    this.holding = false;
    this.distance = 0;
    this.ticks = 0;
    this.crashed = false;
    this.mid = FIELD.h / 2; // the cave's middle as it's dug
    this.target = this.mid; // where the middle is heading
    this.slope = 0; // how steeply it's going there, per unit along
    this.cols = []; // { x, top, bottom }: the ceiling's lowest point and the floor's highest, per column
    this.rocks = []; // { x, y0, y1 }
    this.nextRock = FIELD.w + ROCKS.from;
    this.dug = 0; // how far along the cave has been made
    while (this.cols.length * CAVE.col < FIELD.w + CAVE.col * 2) this.dig(true);
    // Waits for the first hold, hovering.
    this.phase = 'ready';
    if (this.timer) this.ctx.clearTimeout(this.timer);
    this.timer = null;
    this.ctx.update();
  }

  get speed() {
    return Math.min(CAVE.maxSpeed, CAVE.speed + this.distance / 60);
  }

  get gap() {
    return Math.max(CAVE.minGap, CAVE.gap - this.dug / CAVE.narrowEvery);
  }

  /** One more column of cave on the right. The opening stretch is straight, so the start is fair. */
  dig(straight = false) {
    const gap = this.gap;
    const lo = CAVE.margin + gap / 2;
    const hi = FIELD.h - CAVE.margin - gap / 2;
    // The middle winds towards a new height each time it gets near, easing in and out of the
    // bends and never steeper than the copter can climb or drop at full speed.
    if (!straight && Math.abs(this.target - this.mid) < 0.5) this.target = lo + this.rng() * (hi - lo);
    const want = clamp((this.target - this.mid) / 8, -CAVE.slope, CAVE.slope);
    this.slope += clamp(want - this.slope, -CAVE.bend, CAVE.bend);
    this.mid = clamp(this.mid + this.slope * CAVE.col, lo, hi);
    this.target = clamp(this.target, lo, hi);
    const last = this.cols[this.cols.length - 1];
    const x = last ? last.x + CAVE.col : 0;
    const col = { x, top: this.mid - gap / 2, bottom: this.mid + gap / 2 };
    this.cols.push(col);
    this.dug += CAVE.col;
    if (this.dug >= this.nextRock) {
      this.nextRock += ROCKS.every;
      // A rock off the ceiling or the floor, never more than half the gap.
      const h = Math.min(ROCKS.h, gap / 2);
      this.rocks.push(this.rng() < 0.5 ? { x, y0: col.top, y1: col.top + h } : { x, y0: col.bottom - h, y1: col.bottom });
    }
  }

  loop() {
    if (this.timer) this.ctx.clearTimeout(this.timer);
    this.lastTick = this.ctx.now();
    this.timer = this.ctx.setTimeout(() => {
      this.timer = null;
      this.tick();
    }, TIMING.tickMs);
  }

  tick() {
    const dt = Math.min(0.1, (this.ctx.now() - this.lastTick) / 1000);
    // Small fixed steps, so a late tick can't carry the copter through a wall.
    const steps = Math.max(1, Math.ceil(dt / (TIMING.tickMs / 1000)));
    for (let i = 0; i < steps && this.phase === 'play'; i++) this.step(dt / steps);
    if (this.phase !== 'play') return this.ctx.update();
    this.ticks++;
    if (this.ticks % TIMING.sendEvery === 0) this.ctx.update();
    this.loop();
  }

  step(dt) {
    const c = this.copter;
    c.vy = clamp(c.vy + (this.holding ? PHYS.lift : PHYS.gravity) * dt, PHYS.maxRise, PHYS.maxFall);
    c.y += c.vy * dt;
    const dx = this.speed * dt;
    this.distance += dx;
    for (const col of this.cols) col.x -= dx;
    for (const r of this.rocks) r.x -= dx;
    this.cols = this.cols.filter((col) => col.x + CAVE.col > -2);
    this.rocks = this.rocks.filter((r) => r.x + ROCKS.w > -2);
    while (this.cols[this.cols.length - 1].x < FIELD.w + CAVE.col) this.dig();
    if (this.hits()) this.crash();
  }

  /** The copter (a circle) against the walls next to it and any rock. */
  hits() {
    const { x, r } = COPTER;
    const y = this.copter.y;
    const touches = (x0, y0, x1, y1) => (x - clamp(x, x0, x1)) ** 2 + (y - clamp(y, y0, y1)) ** 2 < r ** 2;
    for (const col of this.cols) {
      if (col.x > x + r || col.x + CAVE.col < x - r) continue;
      if (touches(col.x, -10, col.x + CAVE.col, col.top) || touches(col.x, col.bottom, col.x + CAVE.col, FIELD.h + 10)) return true;
    }
    return this.rocks.some((rk) => touches(rk.x, rk.y0, rk.x + ROCKS.w, rk.y1));
  }

  crash() {
    this.crashed = true;
    this.phase = 'over';
    if (this.timer) this.ctx.clearTimeout(this.timer);
    this.timer = null;
  }

  hold(on) {
    this.holding = on;
    if (on && this.phase === 'ready') {
      this.phase = 'play';
      this.loop();
      this.ctx.update();
    }
  }

  togglePause() {
    if (this.phase === 'play') {
      if (this.timer) this.ctx.clearTimeout(this.timer);
      this.timer = null;
      this.phase = 'paused';
      this.ctx.update();
    } else if (this.phase === 'paused') {
      // Carries on level, so a held button let go while paused doesn't drop you into the floor.
      this.phase = 'play';
      this.copter.vy = 0;
      this.ctx.update();
      this.loop();
    }
  }

  onInput(input) {
    if (input.type === 'rematch' && this.phase === 'over') return this.start();
    if (input.type === 'pause') return this.togglePause();
    if (input.type === 'hold' && typeof input.on === 'boolean') this.hold(input.on);
  }

  get metres() {
    return Math.floor(this.distance / UNITS_PER_METRE);
  }

  hostView() {
    return {
      phase: this.phase,
      player: this.ctx.player,
      field: FIELD,
      copter: { x: COPTER.x, y: this.copter.y, vy: this.copter.vy, r: COPTER.r },
      // The walls as [x, top, bottom], rounded: they're sent 30 times a second.
      cols: this.cols.map((c) => [Math.round(c.x * 100) / 100, Math.round(c.top * 100) / 100, Math.round(c.bottom * 100) / 100]),
      col: CAVE.col,
      rocks: this.rocks.map((r) => ({ x: r.x, y0: r.y0, y1: r.y1 })),
      rockW: ROCKS.w,
      speed: this.phase === 'play' ? this.speed : 0,
      distance: this.distance,
      holding: this.holding,
      crashed: this.crashed,
      score: this.metres,
    };
  }

  playerView() {
    return { phase: this.phase, score: this.metres, holding: this.holding };
  }
}

export default {
  id: 'cave',
  name: 'Helicopter Cave',
  tagline: 'Hold to climb, let go to drop. Fly down the winding cave as far as you can.',
  category: 'arcade',
  score: { better: 'higher', unit: 'm' },
  create: (ctx) => new Cave(ctx, ctx.rng),
};
