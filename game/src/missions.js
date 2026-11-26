// missions.js — the three sorties: Ring Run, Runway Landing, Free Flight.
// Rings, fuel pickups, scoring, timers and mission text live here.
import { RUNWAY } from './terrain.js';
import { DEG } from './flight.js';

export const MISSIONS = {
  rings: {
    id: 'rings',
    name: 'RING RUN',
    tagline: 'Thread all 8 rings, then land on RWY 27. Green rings refuel.',
    briefing: 'Take off north, follow the glowing rings through the valley, ' +
      'then turn back and put her down on runway 27. Watch the fuel gauge — ' +
      'green rings top the tanks up.',
  },
  landing: {
    id: 'landing',
    name: 'RUNWAY LANDING',
    tagline: 'A clean circuit and a gentle touchdown on RWY 27.',
    briefing: 'You start on final approach. Keep the speed under 140 kt, ' +
      'hold the glidepath, flare gently and touch down on the numbers. ' +
      'A smooth landing scores; a hard one bends the airframe.',
  },
  free: {
    id: 'free',
    name: 'FREE FLIGHT',
    tagline: 'The valley is yours. No timer, no score — just fly.',
    briefing: 'Explore the alpine valley at your own pace. Fuel still burns, ' +
      'the ground is still hard, and the lake is still cold.',
  },
};

// Ring course: a valley slalom heading north, then a turn back south.
function ringCourse() {
  const pts = [
    { x: 0, y: 150, z: 1750 },
    { x: 90, y: 190, z: 2150 },
    { x: -60, y: 230, z: 2550 },
    { x: 140, y: 190, z: 2950 },
    { x: -120, y: 260, z: 3350 },
    { x: 60, y: 220, z: 3750 },
    { x: -40, y: 180, z: 4150 },
    { x: 0, y: 150, z: 4550 },
  ];
  return pts.map((pt, i) => ({
    ...pt, r: 26, index: i, passed: false, fuel: i === 2 || i === 5,
  }));
}

export function createMission(id) {
  const def = MISSIONS[id] || MISSIONS.rings;
  const mission = {
    id: def.id,
    name: def.name,
    tagline: def.tagline,
    briefing: def.briefing,
    rings: id === 'rings' ? ringCourse() : [],
    nextRing: 0,
    score: 0,
    time: 0,
    running: false,
    done: false,
    ringsDone: false,
    landingScored: false,
    startTime: 0,
  };
  return mission;
}

export function startPosition(id) {
  if (id === 'landing') {
    // On final approach, 900 m out, lined up with the runway, heading west.
    return {
      x: 950, y: 95, z: 2400,
      heading: -90 * DEG, pitch: -0.05, roll: 0,
      speed: 120, throttle: 0.35, fuel: 82, onGround: false,
    };
  }
  if (id === 'rings') {
    // Holding short on the runway, facing east for takeoff.
    return {
      x: -200, y: 0.4, z: 2400,
      heading: 90 * DEG, pitch: 0, roll: 0,
      speed: 0, throttle: 0, fuel: 100, onGround: true,
    };
  }
  // Free flight: airborne over the lake, heading north.
  return {
    x: 420, y: 260, z: 900,
    heading: 0, pitch: 0, roll: 0,
    speed: 130, throttle: 0.7, fuel: 100, onGround: false,
  };
}

// Update mission state each frame. Returns events for the game to announce.
export function updateMission(mission, plane, dt, events) {
  if (!mission.running) return;
  mission.time += dt;

  // Ring passing: within the ring's radius in 3D, roughly in its plane.
  if (mission.rings.length && mission.nextRing < mission.rings.length) {
    const ring = mission.rings[mission.nextRing];
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < ring.r - 4) {
      ring.passed = true;
      mission.nextRing++;
      const base = 100;
      const timeBonus = Math.max(0, 40 - Math.floor(mission.time / 10));
      mission.score += base + timeBonus;
      if (ring.fuel) {
        plane.fuel = Math.min(100, plane.fuel + 30);
        events.push('fuel-ring');
      } else {
        events.push('ring');
      }
      if (mission.nextRing >= mission.rings.length) {
        mission.ringsDone = true;
        mission.score += 250;
        events.push('rings-done');
      }
    }
  }
}

// Score a landing: called once when the plane touches down on the runway.
export function scoreLanding(mission, plane) {
  if (mission.landingScored) return 0;
  mission.landingScored = true;
  let pts = 0;
  const vsFpm = Math.abs(plane.vs) * 196.85;
  if (vsFpm < 150) pts += 300;
  else if (vsFpm < 300) pts += 200;
  else pts += 100;
  if (plane.speed < 120) pts += 100;
  const centre = Math.abs(plane.z - 2400) < 8 ? 100 : 50;
  pts += centre;
  if (mission.id === 'rings' && mission.ringsDone) pts += 200; // course + landing
  if (mission.id === 'landing') pts += 150;
  mission.score += pts;
  if (mission.id !== 'free' && (mission.ringsDone || mission.id === 'landing')) {
    mission.done = true;
  }
  return pts;
}

export function missionObjective(mission) {
  if (mission.id === 'free') return 'FREE FLIGHT — explore the valley';
  if (mission.id === 'landing') {
    return mission.done ? 'LANDED — mission complete!' : 'LAND ON RWY 27 — keep it smooth';
  }
  if (mission.ringsDone) {
    return mission.done ? 'COURSE COMPLETE — landed!' : 'ALL RINGS! Now land on RWY 27';
  }
  return `RING ${mission.nextRing + 1} / ${mission.rings.length} — follow the glow`;
}

export function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
