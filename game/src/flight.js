// flight.js — the flight model: throttle, pitch, roll, lift, drag, stall,
// ground contact, fuel burn and hull damage. Pure numbers, no drawing.
import { terrainHeight, RUNWAY } from './terrain.js';

export const DEG = Math.PI / 180;

export function createPlane() {
  return {
    // Position in metres (x east, y up, z north) and attitude.
    x: 0, y: 120, z: 1500,
    heading: 0, // radians, 0 = north (+z)
    pitch: 0, // radians, + = nose up
    roll: 0, // radians, + = bank right
    speed: 95, // knots
    throttle: 0.65, // 0..1
    vs: 0, // vertical speed, m/s
    fuel: 100, // percent
    hull: 100, // percent
    onGround: false,
    crashed: false,
    landed: false,
    gearDown: true,
    flaps: 0,
  };
}

// One physics step. input: {pitchUp, pitchDown, rollLeft, rollRight, throttleUp,
// throttleDown, brakes}. dt in seconds. Returns events: ['stall', 'touchdown', ...].
export function stepFlight(p, input, dt, events) {
  if (p.crashed || p.landed) return;

  // --- Throttle ------------------------------------------------------------
  if (input.throttleUp) p.throttle = Math.min(1, p.throttle + dt * 0.55);
  if (input.throttleDown) p.throttle = Math.max(0, p.throttle - dt * 0.55);

  // --- Attitude ------------------------------------------------------------
  const rollRate = 1.5; // rad/s at full deflection
  const pitchRate = 0.55;
  let rollTarget = 0;
  if (input.rollLeft) rollTarget -= 1;
  if (input.rollRight) rollTarget += 1;
  // Roll eases toward the commanded bank; hands off, wings level themselves.
  const rollCmd = rollTarget * 0.85;
  p.roll += (rollCmd - p.roll) * Math.min(1, dt * (rollTarget !== 0 ? 2.6 : 1.4));
  p.roll = Math.max(-1.15, Math.min(1.15, p.roll));

  let pitchCmd = 0;
  if (input.pitchUp) pitchCmd += 1;
  if (input.pitchDown) pitchCmd -= 1;
  const targetPitch = pitchCmd * 0.22;
  p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 2.2);
  p.pitch = Math.max(-0.35, Math.min(0.42, p.pitch));

  // --- Turn coordination ---------------------------------------------------
  // Bank turns the nose; steep banks bleed speed.
  const turnRate = -Math.sin(p.roll) * 0.55 * Math.min(1, p.speed / 90);
  p.heading += turnRate * dt;

  // --- Speed: thrust vs drag ----------------------------------------------
  const targetSpeed = 42 + p.throttle * 128; // knots at level flight
  const drag = p.onGround && input.brakes ? 26 : 0;
  const accel = (targetSpeed - p.speed) * 0.16 - drag * (p.onGround ? 1 : 0.15);
  p.speed += accel * dt;
  if (p.speed < 0) p.speed = 0;

  // --- Lift and climb ------------------------------------------------------
  const stallSpeed = 62; // knots; below this the wing quits
  const stalled = p.speed < stallSpeed && !p.onGround;
  if (stalled && !p._stallWarned) { events.push('stall'); p._stallWarned = true; }
  if (!stalled) p._stallWarned = false;

  let climb;
  const airborneClimb = () => Math.sin(p.pitch) * p.speed * 0.514 * 1.9
    + (p.throttle - 0.55) * 2.2
    - Math.abs(Math.sin(p.roll)) * 3.2;
  if (p.onGround) {
    // Rolling on the ground: lift off once fast enough with nose up.
    climb = 0;
    if (p.speed > 78 && p.pitch > 0.05) {
      p.onGround = false;
      events.push('takeoff');
      climb = airborneClimb(); // lift in this very step, so the ground
      // contact check below does not read the takeoff as a landing
    }
  } else if (stalled) {
    climb = -9 - (stallSpeed - p.speed) * 0.25; // sink, nose drops
    p.pitch += (-0.12 - p.pitch) * Math.min(1, dt * 1.2);
  } else {
    climb = airborneClimb();
  }
  p.vs += (climb - p.vs) * Math.min(1, dt * 1.6);
  p.y += p.vs * dt;

  // --- Move forward --------------------------------------------------------
  const ms = p.speed * 0.514444;
  p.x += Math.sin(p.heading) * Math.cos(p.pitch) * ms * dt;
  p.z += Math.cos(p.heading) * Math.cos(p.pitch) * ms * dt;

  // --- Fuel ----------------------------------------------------------------
  const burn = (0.16 + p.throttle * 0.5) * dt; // percent per second
  p.fuel = Math.max(0, p.fuel - burn);
  if (p.fuel <= 0 && p.throttle > 0) {
    p.throttle = 0;
    events.push('fuel-empty');
  }

  // --- Ground contact ------------------------------------------------------
  const ground = terrainHeight(p.x, p.z);
  if (p.y <= ground + 0.4) {
    p.y = ground + 0.4;
    const hard = Math.abs(p.vs) > 6 || Math.abs(p.roll) > 0.5;
    const onRunway = p.x > RUNWAY.x0 - 4 && p.x < RUNWAY.x1 + 4 &&
      p.z > RUNWAY.z0 - 4 && p.z < RUNWAY.z1 + 4;
    if (!p.onGround) {
      if (onRunway && Math.abs(p.vs) <= 5.5 && p.speed < 150 && Math.abs(p.roll) < 0.45) {
        p.onGround = true;
        p.landed = true;
        p.vs = 0;
        p.pitch = 0;
        events.push('landed');
      } else if (hard || p.speed > 170) {
        p.crashed = true;
        events.push('crash');
      } else {
        // Rough-field touchdown: survivable but damaging.
        p.onGround = true;
        p.vs = 0;
        p.hull = Math.max(0, p.hull - 22);
        events.push('rough-landing');
        if (p.hull <= 0) { p.crashed = true; events.push('crash'); }
      }
    } else {
      p.vs = 0;
    }
    if (p.onGround) {
      // Roll-out friction, faster with brakes.
      p.speed = Math.max(0, p.speed - dt * (input.brakes ? 26 : 7));
      p.roll *= 0.8;
    }
  }
  if (p.y > 1500) { p.y = 1500; p.vs = Math.min(0, p.vs); } // service ceiling
}

// Camera chase position: behind and above the plane, looking along its heading.
export function chaseCamera(p) {
  const back = 11;
  const up = 3.4;
  return {
    x: p.x - Math.sin(p.heading) * back,
    y: p.y + up,
    z: p.z - Math.cos(p.heading) * back,
    heading: p.heading,
    pitch: p.pitch * 0.6,
  };
}
