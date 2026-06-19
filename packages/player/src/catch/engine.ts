import { CATCH_DESIGN_H, CATCH_DESIGN_W } from "@rngames/shared";
import type { CatchConfig, CatchGameState, FallingItem } from "./types";

const BANNER_H = 132;
const CATCHER_BOTTOM_PAD = 120;
const SPAWN_EDGE_PAD = 20;
const POSITIVE_RATIO_START = 0.5;
const POSITIVE_RATIO_END = 0.1;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function randBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function shuffleKinds(kinds: ("positive" | "negative")[]) {
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
}

export class CatchEngine {
  readonly designW = CATCH_DESIGN_W;
  readonly designH = CATCH_DESIGN_H;
  readonly bannerH = BANNER_H;

  state: CatchGameState = "idle";
  score = 0;
  timeLeft = 0;
  countdownValue = 3;
  catcherX = CATCH_DESIGN_W / 2;
  items: FallingItem[] = [];
  private spawnAcc = 0;
  private nextSpawnMs = 700;
  private countdownAcc = 0;
  private nextId = 1;
  private cfg: CatchConfig;
  private spawnPlan: ("positive" | "negative")[] = [];
  private spawnPlanIndex = 0;

  constructor(cfg: CatchConfig) {
    this.cfg = cfg;
    this.timeLeft = cfg.gameplay.durationSec;
    this.catcherX = CATCH_DESIGN_W / 2;
    this.scheduleNextSpawn();
  }

  get catcherY() {
    return CATCH_DESIGN_H - CATCHER_BOTTOM_PAD - this.cfg.gameplay.catcherHeight / 2;
  }

  private scheduleNextSpawn() {
    const g = this.cfg.gameplay;
    this.nextSpawnMs = randBetween(g.spawnIntervalMinMs, g.spawnIntervalMaxMs);
  }

  private roundProgress() {
    const total = this.cfg.gameplay.durationSec;
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, 1 - this.timeLeft / total));
  }

  private targetPositiveRatio(progress = this.roundProgress()) {
    return lerp(POSITIVE_RATIO_START, POSITIVE_RATIO_END, progress);
  }

  private buildSpawnPlan() {
    const g = this.cfg.gameplay;
    if (g.positiveOnly) {
      this.spawnPlan = [];
      this.spawnPlanIndex = 0;
      return;
    }

    const avgMs = (g.spawnIntervalMinMs + g.spawnIntervalMaxMs) / 2;
    const n = Math.max(12, Math.round((g.durationSec * 1000) / avgMs));
    const kinds: ("positive" | "negative")[] = [];
    let expectedPos = 0;

    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      const posRatio = this.targetPositiveRatio(t);
      expectedPos += posRatio;
      kinds.push(Math.random() < posRatio ? "positive" : "negative");
    }

    const targetPos = Math.round(expectedPos);
    let posCount = kinds.filter((k) => k === "positive").length;

    for (let i = 0; i < kinds.length && posCount < targetPos; i++) {
      if (kinds[i] === "negative") {
        kinds[i] = "positive";
        posCount++;
      }
    }
    for (let i = kinds.length - 1; i >= 0 && posCount > targetPos; i--) {
      if (kinds[i] === "positive") {
        kinds[i] = "negative";
        posCount--;
      }
    }

    shuffleKinds(kinds);
    this.spawnPlan = kinds;
    this.spawnPlanIndex = 0;
  }

  private pickSpawnKind(): "positive" | "negative" {
    if (this.cfg.gameplay.positiveOnly) return "positive";
    if (this.spawnPlanIndex < this.spawnPlan.length) {
      return this.spawnPlan[this.spawnPlanIndex++];
    }
    return Math.random() < this.targetPositiveRatio() ? "positive" : "negative";
  }

  private currentFallSpeed() {
    const g = this.cfg.gameplay;
    return lerp(g.fallSpeedStart, g.fallSpeedEnd, this.roundProgress());
  }

  reset(cfg?: CatchConfig) {
    if (cfg) this.cfg = cfg;
    this.state = "idle";
    this.score = 0;
    this.timeLeft = this.cfg.gameplay.durationSec;
    this.countdownValue = 3;
    this.countdownAcc = 0;
    this.spawnAcc = 0;
    this.items = [];
    this.catcherX = CATCH_DESIGN_W / 2;
    this.spawnPlan = [];
    this.spawnPlanIndex = 0;
    this.scheduleNextSpawn();
  }

  beginFromTouch() {
    if (this.state !== "idle") return;
    this.state = "countdown";
    this.countdownValue = 3;
    this.countdownAcc = 0;
  }

  setCatcherX(x: number) {
    const half = this.cfg.gameplay.catcherWidth / 2;
    const pad = 12;
    this.catcherX = Math.min(this.designW - half - pad, Math.max(half + pad, x));
  }

  update(dt: number) {
    if (this.state === "countdown") {
      this.countdownAcc += dt;
      if (this.countdownAcc >= 1) {
        this.countdownAcc = 0;
        this.countdownValue -= 1;
        if (this.countdownValue <= 0) {
          this.state = "playing";
          this.spawnAcc = 0;
          this.buildSpawnPlan();
          this.spawnItem();
          this.scheduleNextSpawn();
        }
      }
      return;
    }

    if (this.state !== "playing") return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.state = "ended";
      this.items = [];
      return;
    }

    const g = this.cfg.gameplay;
    const fall = this.currentFallSpeed() * dt;

    this.spawnAcc += dt * 1000;
    while (this.spawnAcc >= this.nextSpawnMs) {
      this.spawnAcc -= this.nextSpawnMs;
      this.spawnItem();
      this.scheduleNextSpawn();
    }

    const next: FallingItem[] = [];
    for (const item of this.items) {
      item.y += fall;
      item.rotation += item.rotSpeed * dt;
      if (item.y - item.size / 2 > this.designH + 40) continue;
      if (this.hitTest(item)) {
        if (item.kind === "positive") this.score += 1;
        else if (!g.positiveOnly) this.score = Math.max(0, this.score - 1);
        continue;
      }
      next.push(item);
    }
    this.items = next;
  }

  private spawnItem() {
    const g = this.cfg.gameplay;
    const size = g.itemSize;
    const kind = this.pickSpawnKind();
    const half = size / 2;
    const pad = half + SPAWN_EDGE_PAD;
    const minX = pad;
    const maxX = this.designW - pad;
    if (maxX <= minX) return;
    this.items.push({
      id: this.nextId++,
      x: minX + Math.random() * (maxX - minX),
      y: this.bannerH + half,
      kind,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 4,
      size,
    });
  }

  private hitTest(item: FallingItem): boolean {
    const g = this.cfg.gameplay;
    const cx = this.catcherX;
    const cy = this.catcherY;
    const hw = g.catcherWidth / 2;
    const hh = g.catcherHeight / 2;
    const closestX = Math.max(cx - hw, Math.min(item.x, cx + hw));
    const closestY = Math.max(cy - hh, Math.min(item.y, cy + hh));
    const dx = item.x - closestX;
    const dy = item.y - closestY;
    const r = item.size * 0.42;
    return dx * dx + dy * dy <= r * r;
  }
}
