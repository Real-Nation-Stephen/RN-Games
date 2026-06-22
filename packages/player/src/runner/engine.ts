import type { RunnerItemVariant } from "@rngames/shared";
import type { RunnerConfig, RunnerGameState, RunnerWorldItem } from "./types";
import { runnerAuthorHeight, scaleRunnerSize, scaleRunnerY, scaledGroundY } from "./coords";

const BANNER_H = 132;
const GRAVITY = 2400;
const CHAR_X_RATIO = 0.18;
const INVINCIBLE_SEC = 1.2;
const DEATH_FALL_MAX_SEC = 3;
const GLOW_SEC = 0.45;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function shuffleKinds(kinds: ("positive" | "negative")[]) {
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
}

function pickRandomVariant(list: RunnerItemVariant[]): RunnerItemVariant | null {
  const usable = list.filter((v) => v.url);
  if (!usable.length) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}

export class RunnerEngine {
  state: RunnerGameState = "idle";
  designW = 1080;
  designH = 1920;
  readonly bannerH = BANNER_H;

  score = 0;
  health = 3;
  timeLeft = 0;
  elapsedSec = 0;
  distance = 0;
  scrollOffset = 0;
  countdownValue = 3;
  countdownAcc = 0;

  sessionBestPoints = 0;
  sessionBestTime = 0;
  sessionBestDistance = 0;
  attemptsUsed = 0;
  maxAttempts = 1;

  items: RunnerWorldItem[] = [];
  charY = 0;
  charVy = 0;
  onGround = true;
  animFrame = 0;
  animAcc = 0;
  jumpAnimFrame = 0;
  jumpAnimAcc = 0;
  deathAnimAcc = 0;

  damageFlash = 0;
  pickupGlow = 0;
  invincible = 0;

  private cfg: RunnerConfig;
  private spawnAcc = 0;
  private nextSpawnMs = 1200;
  private nextId = 1;
  private spawnPlan: ("positive" | "negative")[] = [];
  private spawnPlanIndex = 0;

  constructor(cfg: RunnerConfig, designW: number, designH: number) {
    this.cfg = cfg;
    this.designW = designW;
    this.designH = designH;
    this.maxAttempts = this.computeMaxAttempts();
    this.resetAttemptState();
  }

  get charX() {
    return this.designW * CHAR_X_RATIO;
  }

  get groundY() {
    return scaledGroundY(this.cfg, this.designH);
  }

  private authorH() {
    return runnerAuthorHeight(this.cfg);
  }

  private computeMaxAttempts() {
    const gp = this.cfg.gameplay;
    if (gp.respawnMode === "endOnZero") return 1;
    return 1 + Math.max(0, gp.maxRespawns);
  }

  leaderboardScore() {
    const m = this.cfg.gameplay.leaderboardMetric;
    if (m === "time") return Math.floor(this.sessionBestTime);
    if (m === "distance") return Math.floor(this.sessionBestDistance);
    return this.sessionBestPoints;
  }

  private updateSessionBest() {
    this.sessionBestPoints = Math.max(this.sessionBestPoints, this.score);
    this.sessionBestTime = Math.max(this.sessionBestTime, this.elapsedSec);
    this.sessionBestDistance = Math.max(this.sessionBestDistance, this.distance);
  }

  private roundProgress() {
    const g = this.cfg.gameplay;
    if (!g.timerEnabled) return Math.min(1, this.elapsedSec / 120);
    const total = g.durationSec;
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, this.elapsedSec / total));
  }

  private scrollSpeed() {
    const g = this.cfg.gameplay;
    return lerp(g.scrollSpeedStart, g.scrollSpeedEnd, this.roundProgress());
  }

  private spawnIntervalMs() {
    const g = this.cfg.gameplay;
    return lerp(g.spawnIntervalStartMs, g.spawnIntervalEndMs, this.roundProgress());
  }

  private targetPositiveRatio(progress = this.roundProgress()) {
    const g = this.cfg.gameplay;
    return lerp(g.positivePercentStart, g.positivePercentEnd, progress) / 100;
  }

  private scheduleNextSpawn() {
    this.nextSpawnMs = this.spawnIntervalMs();
  }

  private buildSpawnPlan() {
    const g = this.cfg.gameplay;
    const avgMs = (g.spawnIntervalStartMs + g.spawnIntervalEndMs) / 2;
    const duration = g.timerEnabled ? g.durationSec : 120;
    const n = Math.max(10, Math.round((duration * 1000) / avgMs));
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
    if (this.spawnPlanIndex < this.spawnPlan.length) {
      return this.spawnPlan[this.spawnPlanIndex++];
    }
    return Math.random() < this.targetPositiveRatio() ? "positive" : "negative";
  }

  reset(cfg?: RunnerConfig, designW?: number, designH?: number) {
    if (cfg) this.cfg = cfg;
    if (designW) this.designW = designW;
    if (designH) this.designH = designH;
    this.state = "idle";
    this.attemptsUsed = 0;
    this.sessionBestPoints = 0;
    this.sessionBestTime = 0;
    this.sessionBestDistance = 0;
    this.maxAttempts = this.computeMaxAttempts();
    this.resetAttemptState();
  }

  private resetAttemptState() {
    const g = this.cfg.gameplay;
    this.score = 0;
    this.health = g.maxHealth;
    this.timeLeft = g.timerEnabled ? g.durationSec : 0;
    this.elapsedSec = 0;
    this.distance = 0;
    this.scrollOffset = 0;
    this.countdownValue = 3;
    this.countdownAcc = 0;
    this.spawnAcc = 0;
    this.items = [];
    this.charY = this.groundY;
    this.charVy = 0;
    this.onGround = true;
    this.animFrame = 0;
    this.animAcc = 0;
    this.jumpAnimFrame = 0;
    this.jumpAnimAcc = 0;
    this.deathAnimAcc = 0;
    this.damageFlash = 0;
    this.pickupGlow = 0;
    this.invincible = 0;
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

  jump() {
    if (this.state !== "playing" || !this.onGround) return;
    const h = scaleRunnerSize(this.cfg.character.jumpHeight, this.designH, this.authorH());
    this.charVy = -Math.sqrt(2 * GRAVITY * h);
    this.onGround = false;
    this.jumpAnimFrame = 0;
    this.jumpAnimAcc = 0;
  }

  update(dt: number) {
    if (this.state === "countdown") {
      this.countdownAcc += dt;
      if (this.countdownAcc >= 1) {
        this.countdownAcc = 0;
        this.countdownValue -= 1;
        if (this.countdownValue <= 0) {
          this.state = "playing";
          this.buildSpawnPlan();
          this.spawnItem();
          this.scheduleNextSpawn();
        }
      }
      return;
    }

    if (this.state === "dying") {
      this.deathAnimAcc += dt;
      const speed = this.scrollSpeed();
      this.scrollOffset += speed * dt;
      this.distance += speed * dt;
      this.charVy += GRAVITY * dt;
      this.charY += this.charVy * dt;
      const charH = scaleRunnerSize(this.cfg.character.height, this.designH, this.authorH());
      const fellOff = this.charY > this.designH + charH;
      if (fellOff || this.deathAnimAcc >= DEATH_FALL_MAX_SEC) {
        if (this.attemptsUsed + 1 < this.maxAttempts) {
          this.attemptsUsed += 1;
          this.resetAttemptState();
          this.state = "countdown";
          this.countdownValue = 3;
          this.countdownAcc = 0;
        } else {
          this.updateSessionBest();
          this.damageFlash = 0;
          this.pickupGlow = 0;
          this.state = "ended";
        }
      }
      return;
    }

    if (this.state !== "playing") return;

    this.elapsedSec += dt;
    if (this.cfg.gameplay.timerEnabled) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.updateSessionBest();
        this.damageFlash = 0;
        this.pickupGlow = 0;
        this.state = "ended";
        this.items = [];
        return;
      }
    }

    const speed = this.scrollSpeed();
    this.scrollOffset += speed * dt;
    this.distance += speed * dt;

    this.spawnAcc += dt * 1000;
    while (this.spawnAcc >= this.nextSpawnMs) {
      this.spawnAcc -= this.nextSpawnMs;
      this.spawnItem();
      this.scheduleNextSpawn();
    }

    if (!this.onGround) {
      this.charVy += GRAVITY * dt;
      this.charY += this.charVy * dt;
      if (this.charY >= this.groundY) {
        this.charY = this.groundY;
        this.charVy = 0;
        this.onGround = true;
        this.jumpAnimFrame = 0;
        this.jumpAnimAcc = 0;
      } else {
        this.jumpAnimAcc += dt;
        if (this.jumpAnimAcc >= 0.06) {
          this.jumpAnimAcc = 0;
          this.jumpAnimFrame += 1;
        }
      }
    } else {
      this.animAcc += dt;
      if (this.animAcc >= 0.08) {
        this.animAcc = 0;
        this.animFrame += 1;
      }
    }

    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt);
    if (this.pickupGlow > 0) this.pickupGlow = Math.max(0, this.pickupGlow - dt);
    if (this.invincible > 0) this.invincible = Math.max(0, this.invincible - dt);

    const cx = this.charX;
    const cw = scaleRunnerSize(this.cfg.character.width, this.designH, this.authorH());
    const ch = scaleRunnerSize(this.cfg.character.height, this.designH, this.authorH());
    const charLeft = cx - cw / 2;
    const charRight = cx + cw / 2;
    const charTop = this.charY - ch;
    const charBottom = this.charY;

    const nextItems: RunnerWorldItem[] = [];
    for (const item of this.items) {
      const screenX = item.worldX - this.scrollOffset;
      if (screenX + item.width < -80) continue;
      if (screenX > this.designW + 80) {
        nextItems.push(item);
        continue;
      }
      if (this.invincible <= 0 && this.hitTest(item, charLeft, charRight, charTop, charBottom)) {
        if (item.kind === "negative") this.applyObstacleHit(item);
        else this.applyPickup(item);
        continue;
      }
      nextItems.push(item);
    }
    this.items = nextItems;
  }

  private hitTest(
    item: RunnerWorldItem,
    charLeft: number,
    charRight: number,
    charTop: number,
    charBottom: number,
  ) {
    const ix = item.worldX - this.scrollOffset;
    const left = ix - item.width / 2;
    const right = ix + item.width / 2;
    const top = item.y - item.height;
    const bottom = item.y;
    return charRight > left && charLeft < right && charBottom > top && charTop < bottom;
  }

  private applyPickup(item: RunnerWorldItem) {
    const fx = item.effects;
    if (fx.addPoints) this.score = Math.max(0, this.score + fx.pointsAmount);
    if (fx.addHealth) this.health = Math.min(this.cfg.gameplay.maxHealth, this.health + fx.healthAmount);
    if (fx.addTime && this.cfg.gameplay.timerEnabled) {
      this.timeLeft += fx.timeAmount;
    }
    this.pickupGlow = GLOW_SEC;
  }

  private applyObstacleHit(item: RunnerWorldItem) {
    const fx = item.effects;
    if (fx.removePoints) this.score = Math.max(0, this.score - fx.pointsAmount);
    if (fx.removeTime && this.cfg.gameplay.timerEnabled) {
      this.timeLeft = Math.max(0, this.timeLeft - fx.timeAmount);
    }
    const dmg = fx.removeHealth ? fx.healthAmount : 1;
    this.health = Math.max(0, this.health - dmg);
    if (this.cfg.feedback.damageFlashEnabled !== false) {
      this.damageFlash = 0.35;
    }
    this.invincible = INVINCIBLE_SEC;
    if (this.health <= 0) {
      this.onHealthDepleted();
    }
  }

  private onHealthDepleted() {
    this.updateSessionBest();
    this.state = "dying";
    this.deathAnimAcc = 0;
    this.charVy = 180;
    this.onGround = false;
    this.items = [];
  }

  private spawnItem() {
    const kind = this.pickSpawnKind();
    const list = kind === "positive" ? this.cfg.items.positive : this.cfg.items.negative;
    const variant = pickRandomVariant(list);
    if (!variant) return;
    const authorH = this.authorH();
    const worldX = this.scrollOffset + this.designW + 120 + Math.random() * 80;
    const y = variant.y > 0 ? scaleRunnerY(variant.y, this.designH, authorH) : this.groundY;
    const width = scaleRunnerSize(variant.width, this.designH, authorH);
    const height = scaleRunnerSize(variant.height, this.designH, authorH);
    this.items.push({
      id: this.nextId++,
      kind,
      variantId: variant.id,
      worldX,
      y,
      width,
      height,
      effects: variant.effects,
    });
  }
}
