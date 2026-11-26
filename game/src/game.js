// game.js — Skyline Runner: main loop, input, game states, screenshot scenes.
// A single-page canvas flight game. Original art, code and sounds.
import { createPlane, stepFlight, chaseCamera, DEG } from './flight.js';
import { createMission, startPosition, updateMission, scoreLanding, formatTime } from './missions.js';
import { terrainHeight, RUNWAY } from './terrain.js';
import { VIEW, drawWorld, drawPlane, drawHUD, drawTitle, drawEndScreen, drawPaused } from './render.js';
import { SoundEngine } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const sound = new SoundEngine();

const params = new URLSearchParams(location.search);

// Game state.
let state = 'title'; // title | flying | paused | crashed | landed | complete
let plane = createPlane();
let mission = createMission('rings');
let selectedMission = 0;
let message = null;
let time = 0;
let endKind = 'crash';
let endDetail = '';
let lastTs = 0;
let mouseSteer = false;
let mouseX = 0;
let mouseY = 0;

const input = {
  pitchUp: false, pitchDown: false,
  rollLeft: false, rollRight: false,
  throttleUp: false, throttleDown: false,
  brakes: false,
};

const MISSION_IDS = ['rings', 'landing', 'free'];

function showMessage(text, color) {
  message = { text, color: color || '#ffffff', at: time };
}

function applyStartPosition(id) {
  const sp = startPosition(id);
  plane = createPlane();
  Object.assign(plane, sp);
  mission = createMission(id);
  mission.running = true;
  mission.startTime = time;
  state = 'flying';
  sound.start();
  showMessage(`${mission.name} — ${mission.tagline}`, '#ffd97a');
}

function handleFlightEvent(ev) {
  if (ev === 'stall') showMessage('STALL — push the nose down!', '#ff5040');
  if (ev === 'takeoff') { showMessage('AIRBORNE — gear up, climb out!', '#37d67a'); sound.tone(660, 0.2, 'sine', 0.12); }
  if (ev === 'ring') { sound.ringChime(); showMessage(`RING ${mission.nextRing} / ${mission.rings.length} — +100`, '#ffb020'); }
  if (ev === 'fuel-ring') { sound.fuelChime(); showMessage('GREEN RING — fuel +30%', '#37d67a'); }
  if (ev === 'rings-done') { sound.fanfare(); showMessage('ALL RINGS! Now land on RWY 27', '#37d67a'); }
  if (ev === 'fuel-empty') { showMessage('FUEL EMPTY — glide her down!', '#ff5040'); }
  if (ev === 'rough-landing') { sound.thud(); showMessage('ROUGH LANDING — hull damaged!', '#ff9a3c'); }
  if (ev === 'landed') {
    const pts = scoreLanding(mission, plane);
    sound.thud();
    if (mission.done) {
      state = 'complete';
      endKind = 'complete';
      endDetail = `A textbook landing on RWY 27 — +${pts} points.`;
      sound.fanfare();
    } else {
      state = 'landed';
      endKind = 'landed';
      endDetail = `Smooth touchdown on RWY 27 — +${pts} points.`;
    }
    mission.fuelLeft = plane.fuel;
  }
  if (ev === 'crash') {
    sound.crash();
    state = 'crashed';
    endKind = plane.fuel <= 0 ? 'fuel' : 'crash';
    endDetail = plane.fuel <= 0
      ? 'The tanks ran dry over the valley.'
      : 'The valley floor is harder than it looks.';
    mission.fuelLeft = plane.fuel;
  }
}

function restart() {
  applyStartPosition(MISSION_IDS[selectedMission]);
}

function toTitle() {
  state = 'title';
  plane = createPlane();
  mission = createMission(MISSION_IDS[selectedMission]);
}

// --- Input -------------------------------------------------------------------
const KEYMAP = {
  KeyW: 'throttleUp', KeyS: 'throttleDown',
  ArrowUp: 'pitchUp', ArrowDown: 'pitchDown',
  KeyA: 'rollLeft', ArrowLeft: 'rollLeft',
  KeyD: 'rollRight', ArrowRight: 'rollRight',
  KeyB: 'brakes',
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state === 'title') { restart(); return; }
  if (e.code === 'KeyR' && (state === 'crashed' || state === 'landed' || state === 'complete')) { restart(); return; }
  if (e.code === 'KeyT' && (state === 'crashed' || state === 'landed' || state === 'complete')) { toTitle(); return; }
  if (e.code === 'KeyP' && (state === 'flying' || state === 'paused')) {
    state = state === 'flying' ? 'paused' : 'flying';
    return;
  }
  if (e.code === 'KeyM') { sound.toggleMute(); return; }
  if (state === 'title' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    selectedMission = Number(e.code.slice(-1)) - 1;
    restart();
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); input.brakes = true; }
  const key = KEYMAP[e.code];
  if (key) { input[key] = true; e.preventDefault(); }
});

window.addEventListener('keyup', (e) => {
  const key = KEYMAP[e.code];
  if (key) input[key] = false;
  if (e.code === 'Space') input.brakes = false;
});

// Mouse: hold the left button and steer; moving up pitches up.
canvas.addEventListener('mousedown', (e) => {
  sound.start();
  if (state === 'title') {
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y > 0.36 && y < 0.72) {
      selectedMission = Math.min(2, Math.max(0, Math.floor((y - 0.36) / 0.12)));
      restart();
      return;
    }
    return;
  }
  mouseSteer = true;
  mouseX = e.clientX;
  mouseY = e.clientY;
});
window.addEventListener('mouseup', () => { mouseSteer = false; });
window.addEventListener('mousemove', (e) => {
  if (!mouseSteer) return;
  const dx = e.clientX - mouseX;
  const dy = e.clientY - mouseY;
  input.rollRight = dx > 24;
  input.rollLeft = dx < -24;
  input.pitchUp = dy < -24;
  input.pitchDown = dy > 24;
});

// --- Screenshot scenes -------------------------------------------------------
// ?scene=ring|runway|low|title poses the game for a still render. The plane
// holds its pose (demo mode) so the screenshot is stable and readable.
const SCENES = {
  ring: () => {
    applyStartPosition('rings');
    plane.x = 0; plane.y = 170; plane.z = 1650;
    plane.heading = 0; plane.pitch = 0.02; plane.roll = 0.1;
    plane.speed = 150; plane.throttle = 0.72; plane.fuel = 78;
    mission.nextRing = 0;
  },
  runway: () => {
    applyStartPosition('landing');
    plane.x = 620; plane.y = 78; plane.z = 2400;
    plane.heading = -90 * DEG; plane.pitch = -0.04; plane.roll = -0.05;
    plane.speed = 118; plane.throttle = 0.38; plane.fuel = 82;
  },
  low: () => {
    applyStartPosition('free');
    plane.x = 200; plane.y = 130; plane.z = 800;
    plane.heading = 0.45; plane.pitch = 0.01; plane.roll = 0.15;
    plane.speed = 165; plane.throttle = 0.8; plane.fuel = 64;
  },
  title: () => {
    state = 'title';
    selectedMission = 0;
    // Airborne over the valley behind the title panel (the plane itself
    // is not drawn on the title screen, only the world behind it).
    plane = createPlane();
    Object.assign(plane, { x: 0, y: 170, z: 1650, heading: 0, pitch: 0.02, roll: 0.1, speed: 150, throttle: 0.72, fuel: 78 });
    mission = createMission('free'); // no rings on the title backdrop
  },
};

function setupScene() {
  const scene = params.get('scene');
  if (!scene || !SCENES[scene]) return false;
  SCENES[scene]();
  window.__demo = true; // physics paused; clouds and prop keep animating
  return true;
}

// --- Main loop ---------------------------------------------------------------
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  time += dt;

  if (state === 'flying' && !window.__demo) {
    const events = [];
    stepFlight(plane, input, dt, events);
    updateMission(mission, plane, dt, events);
    for (const ev of events) handleFlightEvent(ev);
    sound.update(plane.throttle, plane.speed, true);
  } else if (state === 'title') {
    sound.update(0, 0, false);
  }

  // Render.
  const cam = chaseCamera(plane);
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  drawWorld(ctx, cam, VIEW, plane, mission, time);
  if (state !== 'title') drawPlane(ctx, VIEW, plane, time);
  if (state === 'title') {
    drawTitle(ctx, VIEW, selectedMission, time);
  } else if (state === 'paused') {
    drawHUD(ctx, VIEW, plane, mission, message, time);
    drawPaused(ctx, VIEW);
  } else if (state === 'flying') {
    drawHUD(ctx, VIEW, plane, mission, message, time);
  } else {
    drawHUD(ctx, VIEW, plane, mission, message, time);
    drawEndScreen(ctx, VIEW, endKind, mission, endDetail);
  }
}

// Keep the canvas at its internal resolution; CSS scales it to the window.
function fitCanvas() {
  canvas.width = VIEW.w;
  canvas.height = VIEW.h;
}

fitCanvas();
setupScene();
requestAnimationFrame(frame);

// Expose a tiny handle for automated play-testing (no network, same page).
window.__skyline = {
  get state() { return state; },
  get plane() { return plane; },
  get mission() { return mission; },
  start: (id) => applyStartPosition(id),
};
