// terrain.js — the alpine valley: height field, runway, mountains, lake, clouds,
// and the camera projection that turns world points into screen points.
// World units are metres. +x is east, +z is north, +y is up.
// The runway (RWY 27) sits on a flat strip at x in [-18, 18], z in [2100, 2700].

export const RUNWAY = {
  x0: -300, x1: 300,
  z0: 2382, z1: 2418,
  headingDeg: 270, // landing heading: west, down the strip
};

export const WORLD = {
  waterLevel: -1.5, // only the eastern basin dips below this; the flat runway apron stays grass
  valleyFloor: 0,
};

// Deterministic pseudo-random from integer coordinates (no Math.random in terrain).
export function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const u = smooth(fx);
  const v = smooth(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Rolling hills + a mountain ridge to the west and north, a lake to the east.
export function terrainHeight(x, z) {
  // Flatten the runway strip (east-west) and its eastern approach.
  const onStrip = x > -380 && x < 900 && z > 2322 && z < 2478;
  let h = 0;
  h += valueNoise(x * 0.004, z * 0.004) * 26;
  h += valueNoise(x * 0.013 + 40, z * 0.013) * 9;
  h += valueNoise(x * 0.05, z * 0.05) * 1.6;
  // Western ridge rises steeply (capped so far-west peaks stay in the skybox range).
  const west = Math.min(1.6, Math.max(0, (-x - 260) / 420));
  h += west * west * 260 * (0.6 + 0.4 * valueNoise(x * 0.01, z * 0.008));
  // Northern peaks, far beyond the valley floor so the ring course stays flyable.
  const north = Math.min(1.5, Math.max(0, (z - 4200) / 800));
  h += north * north * 260 * (0.6 + 0.4 * valueNoise(x * 0.008, z * 0.01));
  // Eastern basin dips into the lake.
  const east = Math.min(1.5, Math.max(0, (x - 320) / 500));
  h -= east * east * 60;
  if (onStrip) {
    // Blend smoothly to flat ground (y = 0) across the strip and its approach.
    const dx = Math.max(0, Math.max(-380 - x, x - 900)) / 80;
    const dz = Math.max(0, Math.max(2322 - z, z - 2478)) / 60;
    const d = Math.min(1, Math.max(dx, dz));
    h *= d * d;
  }
  return Math.max(h, -6);
}

// Fixed mountain peaks; h is the height above the terrain at that spot
// (drawPeaks adds the terrain height as the base).
export const PEAKS = [
  { x: -900, z: 3400, h: 420, w: 700 },
  { x: -1400, z: 2400, h: 380, w: 620 },
  { x: -700, z: 4200, h: 480, w: 800 },
  { x: 300, z: 4600, h: 340, w: 560 },
  { x: -1800, z: 3800, h: 440, w: 760 },
  { x: 900, z: 3600, h: 300, w: 520 },
  { x: -2400, z: 1800, h: 360, w: 600 },
];

// Clouds: billboards drifting slowly across the sky.
export const CLOUDS = [];
for (let i = 0; i < 26; i++) {
  const cx = -1600 + hash2(i, 7) * 3400;
  const cz = 300 + hash2(i, 13) * 4200;
  const cy = 260 + hash2(i, 21) * 220;
  CLOUDS.push({ x: cx, z: cz, y: cy, s: 60 + hash2(i, 29) * 110, drift: 2 + hash2(i, 31) * 4 });
}

// Colour of a ground cell from its height, as [r, g, b]
// (grass, rock, snow, sand, water). The renderer fogs it by distance.
export function groundColor(h, x, z) {
  if (h < WORLD.waterLevel) return [63, 127, 184];
  if (h < 4) return [201, 176, 120];
  if (h > 220) return [232, 238, 242];
  if (h > 120) return [141, 133, 120];
  const n = hash2(Math.floor(x / 24), Math.floor(z / 24));
  const g = 118 + Math.floor(n * 26);
  const r = 74 + Math.floor(n * 18);
  return [r, g, 58];
}

// Mix an [r,g,b] colour toward the horizon haze by a 0..1 fog factor.
export function fogMix(rgb, fog) {
  const haze = [188, 216, 236];
  return `rgb(${Math.round(rgb[0] + (haze[0] - rgb[0]) * fog)},` +
    `${Math.round(rgb[1] + (haze[1] - rgb[1]) * fog)},` +
    `${Math.round(rgb[2] + (haze[2] - rgb[2]) * fog)})`;
}

// --- Camera projection -----------------------------------------------------
// project(cam, p, view) -> {x, y, s} screen coords and scale, or null if behind.
// cam: {x, y, z, heading (rad), pitch (rad)}; view: {w, h, focal, horizonY}.
export function project(cam, px, py, pz, view) {
  const dx = px - cam.x;
  const dy = py - cam.y;
  const dz = pz - cam.z;
  const sh = Math.sin(cam.heading);
  const ch = Math.cos(cam.heading);
  const fwd = dx * sh + dz * ch; // distance ahead of the camera
  const right = dx * ch - dz * sh; // distance to the camera's right
  if (fwd < 2) return null;
  const f = view.focal;
  const sx = view.w / 2 + (right * f) / fwd;
  const sy = view.horizonY - ((dy + Math.tan(cam.pitch) * fwd) * f) / fwd;
  return { x: sx, y: sy, s: f / fwd, fwd };
}

export function headingToCompass(deg) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return names[i];
}

export function fmtAlt(m) {
  return Math.round(m * 3.28084).toLocaleString('en-US');
}

export function fmtSpeed(kts) {
  return String(Math.round(kts));
}
