import type { PinboardPlacement, PinboardSubmission } from "./types";

export interface PinZone {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacementOptions {
  type: "photo" | "note";
  existing: PinboardSubmission[];
  zone: PinZone;
  /** base overlap fraction allowed (0–1 of smaller dimension) */
  baseOverlapRatio?: number;
}

function itemSize(type: "photo" | "note") {
  const w = type === "photo" ? 168 + Math.random() * 48 : 150 + Math.random() * 56;
  const h = type === "photo" ? w * 1.05 : w * 0.92;
  return { w: Math.round(w), h: Math.round(h) };
}

function rotRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Axis-aligned bounds approximating a rotated rectangle */
function bounds(x: number, y: number, w: number, h: number, rotDeg: number, zone: PinZone) {
  const cx = zone.left + (x / 100) * zone.width;
  const cy = zone.top + (y / 100) * zone.height;
  const rad = rotRad(rotDeg);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const hw = (w / 2) * cos + (h / 2) * sin;
  const hh = (w / 2) * sin + (h / 2) * cos;
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh, w, h };
}

function overlapRatio(a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) {
  const overlapW = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapH = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const overlapArea = overlapW * overlapH;
  if (overlapArea <= 0) return 0;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return overlapArea / minArea;
}

function existingBounds(existing: PinboardSubmission[], zone: PinZone) {
  return existing
    .filter((s) => s.status === "approved" && s.placement)
    .map((s) => {
      const p = s.placement!;
      const h = s.type === "photo" ? p.w * 1.05 : p.w * 0.92;
      return bounds(p.x, p.y, p.w, h, p.rot, zone);
    });
}

/**
 * Pick a position that spreads across the pin zone with slight random tilt.
 * Overlap tolerance increases as the board fills.
 */
export function computePlacement(opts: PlacementOptions): PinboardPlacement {
  const { type, existing, zone } = opts;
  const approved = existing.filter((s) => s.status === "approved" && s.placement);
  const density = Math.min(1, approved.length / 28);
  let maxOverlap = (opts.baseOverlapRatio ?? 0.12) + density * 0.35;

  const placed = existingBounds(existing, zone);
  const { w, h } = itemSize(type);
  const maxZ = placed.length ? Math.max(...approved.map((s) => s.placement?.z ?? 0)) : 0;

  for (let attempt = 0; attempt < 120; attempt++) {
    if (attempt > 60) maxOverlap += 0.04;
    if (attempt > 90) maxOverlap += 0.08;

    const x = 8 + Math.random() * 84;
    const y = 10 + Math.random() * 80;
    const rot = Math.round((Math.random() * 20 - 10) * 10) / 10;
    const candidate = bounds(x, y, w, h, rot, zone);

    const inside =
      candidate.left >= zone.left &&
      candidate.top >= zone.top &&
      candidate.right <= zone.left + zone.width &&
      candidate.bottom <= zone.top + zone.height;
    if (!inside) continue;

    let ok = true;
    for (const other of placed) {
      if (overlapRatio(candidate, other) > maxOverlap) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return { x, y, rot, z: maxZ + 1, w };
    }
  }

  return {
    x: 10 + Math.random() * 80,
    y: 12 + Math.random() * 76,
    rot: Math.round((Math.random() * 20 - 10) * 10) / 10,
    z: maxZ + 1,
    w,
  };
}
