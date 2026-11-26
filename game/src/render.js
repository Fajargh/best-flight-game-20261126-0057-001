// render.js — every pixel the player sees: sky, terrain, runway, rings,
// the aircraft, the instruments and the menus. Canvas 2D, no images.
import { terrainHeight, groundColor, fogMix, PEAKS, CLOUDS, RUNWAY, project, headingToCompass, fmtAlt, fmtSpeed } from './terrain.js';
import { DEG } from './flight.js';

export const VIEW = { w: 1280, h: 800, focal: 900, horizonY: 336 };

// --- Sky -------------------------------------------------------------------
function drawSky(ctx, w, h, horizonY, time) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  g.addColorStop(0, '#2f6fb4');
  g.addColorStop(0.45, '#6fa8d8');
  g.addColorStop(0.8, '#bcd8ec');
  g.addColorStop(1, '#dcebf5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizonY + 40);
  // Sun with a soft halo.
  const sunX = w * 0.78;
  const sunY = h * 0.16;
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  halo.addColorStop(0, 'rgba(255,244,200,0.95)');
  halo.addColorStop(0.25, 'rgba(255,226,140,0.55)');
  halo.addColorStop(1, 'rgba(255,226,140,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
  ctx.fill();
  // A few high streak clouds in the sky itself.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 263 + time * 2) % (w + 300)) - 150;
    const cy = 60 + i * 34;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 90, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Terrain ---------------------------------------------------------------
function drawTerrain(ctx, cam, view, time) {
  const { w, h } = view;
  // Ground grid: rows of increasing depth, columns across the view.
  const zSteps = [];
  let z = cam.z + 10;
  while (z < cam.z + 2600) {
    zSteps.push(z);
    z += 8 + (z - cam.z) * 0.055;
  }
  const xStep = 22;
  const x0 = Math.floor((cam.x - 320) / xStep) * xStep;
  const x1 = cam.x + 320;
  for (let zi = 0; zi < zSteps.length - 1; zi++) {
    const zA = zSteps[zi];
    const zB = zSteps[zi + 1];
    for (let x = x0; x < x1; x += xStep) {
      const xA = x;
      const xB = x + xStep;
      const hA = terrainHeight((xA + xB) / 2, (zA + zB) / 2);
      const p1 = project(cam, xA, terrainHeight(xA, zA), zA, view);
      const p2 = project(cam, xB, terrainHeight(xB, zA), zA, view);
      const p3 = project(cam, xB, terrainHeight(xB, zB), zB, view);
      const p4 = project(cam, xA, terrainHeight(xA, zB), zB, view);
      if (!p1 || !p2 || !p3 || !p4) continue;
      const dist = (zA + zB) / 2 - cam.z;
      const fog = Math.max(0, Math.min(0.85, (dist - 500) / 1800));
      ctx.fillStyle = fogMix(groundColor(hA, (xA + xB) / 2, (zA + zB) / 2), fog);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// --- Runway ----------------------------------------------------------------
function drawRunway(ctx, cam, view) {
  const { z0, z1, x0, x1 } = RUNWAY;
  // Asphalt strip.
  const corners = [
    project(cam, x0, 0.4, z0, view),
    project(cam, x1, 0.4, z0, view),
    project(cam, x1, 0.4, z1, view),
    project(cam, x0, 0.4, z1, view),
  ];
  if (corners.some((c) => !c)) return;
  ctx.fillStyle = '#3a3f45';
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.fill();
  // Centreline dashes and threshold bars (the strip runs east-west).
  ctx.fillStyle = '#f5f5f0';
  for (let x = x0 + 40; x < x1 - 20; x += 90) {
    const a = project(cam, x, 0.55, 2398.8, view);
    const b = project(cam, x, 0.55, 2401.2, view);
    const c = project(cam, x + 34, 0.55, 2401.2, view);
    const d = project(cam, x + 34, 0.55, 2398.8, view);
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }
  // "27" threshold marking at the eastern end (landing heading west).
  const n = project(cam, x1 - 46, 0.6, 2400, view);
  if (n) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(10, Math.round(n.s * 14))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('27', n.x, n.y);
  }
  // Edge lights.
  for (let x = x0; x <= x1; x += 100) {
    for (const z of [z0 - 2, z1 + 2]) {
      const p = project(cam, x, 1.2, z, view);
      if (!p) continue;
      ctx.fillStyle = '#7fd4ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, p.s * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- Peaks, clouds, rings ---------------------------------------------------
function drawPeaks(ctx, cam, view) {
  for (const peak of PEAKS) {
    const baseY = terrainHeight(peak.x, peak.z);
    const base = project(cam, peak.x, baseY, peak.z, view);
    const top = project(cam, peak.x, baseY + peak.h, peak.z, view);
    const left = project(cam, peak.x - peak.w / 2, baseY, peak.z, view);
    const right = project(cam, peak.x + peak.w / 2, baseY, peak.z, view);
    if (!base || !top || !left || !right) continue;
    const fog = Math.max(0, Math.min(0.8, (top.fwd - 500) / 1800));
    ctx.fillStyle = fogMix([93, 107, 122], fog);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fill();
    // Snow cap.
    const capY = top.y + (base.y - top.y) * 0.32;
    const capL = left.x + (top.x - left.x) * 0.32;
    const capR = right.x + (top.x - right.x) * 0.32;
    ctx.fillStyle = fogMix([242, 247, 250], fog);
    ctx.beginPath();
    ctx.moveTo(capL, capY);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(capR, capY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawClouds(ctx, cam, view, time) {
  for (const c of CLOUDS) {
    const cx = c.x + time * c.drift;
    const p = project(cam, cx, c.y, c.z, view);
    if (!p) continue;
    const s = c.s * p.s * 0.09;
    if (s < 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.5, p.y + s * 0.06, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.5, p.y + s * 0.06, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRings(ctx, cam, view, mission, time) {
  if (!mission.rings.length) return;
  for (let i = mission.nextRing; i < mission.rings.length; i++) {
    const ring = mission.rings[i];
    const isNext = i === mission.nextRing;
    const p = project(cam, ring.x, ring.y, ring.z, view);
    if (!p) continue;
    const r = ring.r * p.s;
    if (r < 2) continue;
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.45;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = ring.fuel ? '#37d67a' : (isNext ? '#ffb020' : '#ff5a3c');
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = pulse * 0.5;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 0.72, r * 0.66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (isNext) {
      ctx.fillStyle = '#ffb020';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${ring.index + 1}`, p.x, p.y - r - 12);
    }
  }
  // Passed rings: small check marks trail behind.
  for (const ring of mission.rings) {
    if (!ring.passed) continue;
    const p = project(cam, ring.x, ring.y, ring.z, view);
    if (!p || p.s < 0.4) continue;
    ctx.fillStyle = 'rgba(55,214,122,0.8)';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✓', p.x, p.y);
  }
}

// --- The aircraft (chase view, drawn in screen space) ----------------------
export function drawPlane(ctx, view, plane, time) {
  const cx = view.w / 2;
  const cy = view.h * 0.78;
  const bank = plane.roll;
  const size = 1 + Math.min(0.12, plane.speed / 2400);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.85);
  ctx.scale(size, size);
  // Prop wash / speed lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = -40 + i * 26;
    const len = 26 + plane.speed * 0.12;
    ctx.beginPath();
    ctx.moveTo(-150 - i * 8, y);
    ctx.lineTo(-150 - i * 8 - len, y);
    ctx.moveTo(150 + i * 8, y);
    ctx.lineTo(150 + i * 8 + len, y);
    ctx.stroke();
  }
  // Main wing.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-168, 6);
  ctx.quadraticCurveTo(-120, -14, -52, -6);
  ctx.lineTo(52, -6);
  ctx.quadraticCurveTo(120, -14, 168, 6);
  ctx.lineTo(150, 18);
  ctx.lineTo(-150, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f6f6f2';
  ctx.fillRect(-168, 4, 336, 5);
  // Fuselage (seen from behind, tapering up).
  const fg = ctx.createLinearGradient(0, -70, 0, 60);
  fg.addColorStop(0, '#f2f4f6');
  fg.addColorStop(0.6, '#dfe6ea');
  fg.addColorStop(1, '#b9c4cb');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-26, 58);
  ctx.quadraticCurveTo(-30, -10, -14, -58);
  ctx.quadraticCurveTo(0, -70, 14, -58);
  ctx.quadraticCurveTo(30, -10, 26, 58);
  ctx.quadraticCurveTo(0, 66, -26, 58);
  ctx.closePath();
  ctx.fill();
  // Canopy stripe.
  ctx.fillStyle = '#274b6d';
  ctx.beginPath();
  ctx.ellipse(0, -38, 11, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-3, -44, 4, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Tail fin with the Skyline Runner flash.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-8, -52);
  ctx.lineTo(-10, -92);
  ctx.lineTo(10, -92);
  ctx.lineTo(8, -52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(-10, -80, 20, 7);
  // Horizontal stabiliser.
  ctx.fillStyle = '#b8322a';
  ctx.beginPath();
  ctx.moveTo(-62, 46);
  ctx.lineTo(62, 46);
  ctx.lineTo(48, 58);
  ctx.lineTo(-48, 58);
  ctx.closePath();
  ctx.fill();
  // Nav lights (blink).
  const blink = Math.sin(time * 6) > 0;
  if (blink) {
    ctx.fillStyle = '#ff2d2d';
    ctx.beginPath(); ctx.arc(-166, 10, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2dff5e';
    ctx.beginPath(); ctx.arc(166, 10, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Exhaust shimmer at high throttle.
  if (plane.throttle > 0.5 && !plane.onGround) {
    ctx.fillStyle = `rgba(255,${Math.floor(140 + 60 * Math.sin(time * 30))},40,0.55)`;
    ctx.beginPath();
    ctx.ellipse(0, 62, 7, 10 + plane.throttle * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- HUD --------------------------------------------------------------------
function gauge(ctx, x, y, w, h, frac, label, color, warnAt) {
  ctx.fillStyle = 'rgba(8,20,34,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#12283d';
  ctx.fillRect(x, y, w, h);
  const low = warnAt !== undefined && frac < warnAt;
  ctx.fillStyle = low ? '#ff5040' : color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 5);
}

export function drawHUD(ctx, view, plane, mission, message, time) {
  const { w, h } = view;
  ctx.textBaseline = 'alphabetic';
  // Top bar: compass strip.
  const hdgDeg = (((plane.heading / DEG) % 360) + 360) % 360;
  ctx.fillStyle = 'rgba(8,20,34,0.6)';
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(hdgDeg)).padStart(3, '0')}° ${headingToCompass(hdgDeg)}`, w / 2, 18);
  // Compass ticks.
  for (let d = -60; d <= 60; d += 15) {
    const deg = Math.round(hdgDeg + d);
    const norm = (((deg % 360) + 360) % 360);
    const x = w / 2 + d * 4.4;
    ctx.fillStyle = d === 0 ? '#ffb020' : 'rgba(234,244,255,0.75)';
    ctx.fillRect(x - 1, 26, 2, d % 45 === 0 ? 10 : 6);
    if (norm % 90 === 0) {
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(headingToCompass(norm), x, 42);
    }
  }
  // Left instrument stack.
  const lx = 24;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(8,20,34,0.6)';
  ctx.fillRect(lx - 8, 56, 208, 128);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('ALTITUDE', lx, 76);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(`${fmtAlt(plane.y)} ft`, lx, 106);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('AIRSPEED', lx, 132);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  const vsArrow = plane.vs > 0.5 ? ' ▲' : plane.vs < -0.5 ? ' ▼' : '';
  ctx.fillText(`${fmtSpeed(plane.speed)} kt${vsArrow}`, lx, 162);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`VERT ${plane.vs >= 0 ? '+' : ''}${Math.round(plane.vs * 196.85)} fpm`, lx, 180);
  // Right instrument stack.
  const rx = w - 232;
  ctx.fillStyle = 'rgba(8,20,34,0.6)';
  ctx.fillRect(rx - 8, 56, 208, 168);
  gauge(ctx, rx, 84, 192, 14, plane.fuel / 100, `FUEL ${Math.round(plane.fuel)}%`, '#37d67a', 0.25);
  gauge(ctx, rx, 122, 192, 14, plane.throttle, `THROTTLE ${Math.round(plane.throttle * 100)}%`, '#ffb020');
  gauge(ctx, rx, 160, 192, 14, plane.hull / 100, `HULL ${Math.round(plane.hull)}%`, '#4fc3f7', 0.35);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('SCORE', rx, 200);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(String(mission.score), rx, 222);
  // Artificial horizon (bottom centre).
  const hx = w / 2;
  const hy = h - 64;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, 34, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-plane.roll);
  ctx.translate(0, plane.pitch * 90);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-40, -40, 80, 40);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-40, 0, 80, 40);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(40, 0); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(hx, hy, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(hx - 12, hy); ctx.lineTo(hx + 12, hy); ctx.lineTo(hx, hy + 6);
  ctx.closePath(); ctx.fill();
  // Mission objective + timer.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8,20,34,0.6)';
  const obj = missionObjectiveText(mission);
  ctx.font = 'bold 15px system-ui, sans-serif';
  const tw = ctx.measureText(obj).width + 28;
  ctx.fillRect(w / 2 - tw / 2, 56, tw, 30);
  ctx.fillStyle = '#ffd97a';
  ctx.fillText(obj, w / 2, 76);
  ctx.fillStyle = 'rgba(8,20,34,0.6)';
  ctx.fillRect(w / 2 - 52, 92, 104, 26);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(formatTimeText(mission), w / 2, 110);
  // Centre message (ring passed, stall warning...).
  if (message && message.text) {
    const age = time - message.at;
    if (age < 2.6) {
      ctx.globalAlpha = Math.min(1, (2.6 - age) / 0.6);
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillStyle = message.color || '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(message.text, w / 2, h * 0.3);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }
  // Stall warning.
  if (plane.speed < 62 && !plane.onGround && !plane.crashed) {
    const blink = Math.sin(time * 10) > 0;
    if (blink) {
      ctx.fillStyle = '#ff5040';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('⚠ STALL — NOSE DOWN, FULL THROTTLE', w / 2, h * 0.38);
    }
  }
  // Low fuel warning.
  if (plane.fuel < 25 && plane.fuel > 0 && !plane.crashed) {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('LOW FUEL — find a green ring', w / 2, h - 120);
  }
  // Controls hint.
  ctx.fillStyle = 'rgba(234,244,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('W/S throttle · ←/→ roll · ↑/↓ pitch · B brakes · M mute · P pause', w / 2, h - 14);
}

function missionObjectiveText(mission) {
  // Kept local so the HUD never imports mission internals twice.
  if (mission.id === 'free') return 'FREE FLIGHT — explore the valley';
  if (mission.id === 'landing') {
    return mission.done ? 'LANDED — mission complete!' : 'LAND ON RWY 27 — keep it smooth';
  }
  if (mission.ringsDone) {
    return mission.done ? 'COURSE COMPLETE — landed!' : 'ALL RINGS! Now land on RWY 27';
  }
  return `RING ${mission.nextRing + 1} / ${mission.rings.length} — follow the glow`;
}

function formatTimeText(mission) {
  const s = mission.time || 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// --- Screens ----------------------------------------------------------------
function panel(ctx, w, h, pw, ph) {
  ctx.fillStyle = 'rgba(6,16,30,0.78)';
  ctx.fillRect(w / 2 - pw / 2, h / 2 - ph / 2, pw, ph);
  ctx.strokeStyle = 'rgba(255,176,32,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(w / 2 - pw / 2, h / 2 - ph / 2, pw, ph);
}

export function drawTitle(ctx, view, selected, time) {
  const { w, h } = view;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillText('SKYLINE RUNNER', w / 2, h * 0.2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('— Alpine Flight —', w / 2, h * 0.2 + 36);
  const missions = [
    ['1', 'RING RUN', 'Thread 8 rings, then land on RWY 27'],
    ['2', 'RUNWAY LANDING', 'A clean circuit, a gentle touchdown'],
    ['3', 'FREE FLIGHT', 'The valley is yours — just fly'],
  ];
  panel(ctx, w, h, 620, 300);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('CHOOSE YOUR SORTIE — click or press 1 / 2 / 3', w / 2, h / 2 - 110);
  missions.forEach((m, i) => {
    const y = h / 2 - 62 + i * 62;
    const sel = selected === i;
    ctx.fillStyle = sel ? 'rgba(255,176,32,0.22)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(w / 2 - 280, y - 30, 560, 50);
    ctx.fillStyle = sel ? '#ffb020' : '#eaf4ff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${m[0]}  ${m[1]}`, w / 2 - 260, y + 2);
    ctx.fillStyle = 'rgba(234,244,255,0.8)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(m[2], w / 2 - 260, y + 24);
    ctx.textAlign = 'center';
  });
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('W/S throttle · Arrow keys pitch & roll · Mouse steers too · B brakes · ENTER to fly', w / 2, h / 2 + 168);
  ctx.fillStyle = 'rgba(234,244,255,0.65)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Fuel burns with throttle — green rings refuel. Hard impacts bend the airframe.', w / 2, h / 2 + 192);
}

export function drawEndScreen(ctx, view, kind, mission, detail) {
  const { w, h } = view;
  panel(ctx, w, h, 560, 300);
  ctx.textAlign = 'center';
  const titles = {
    crash: ['CRASHED', '#ff5040'],
    landed: ['TOUCHDOWN!', '#37d67a'],
    complete: ['MISSION COMPLETE', '#37d67a'],
    fuel: ['OUT OF FUEL', '#ff5040'],
  };
  const [title, color] = titles[kind] || titles.crash;
  ctx.fillStyle = color;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 88);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(detail || '', w / 2, h / 2 - 48);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`SCORE  ${mission.score}`, w / 2, h / 2 - 8);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(`Time ${formatTimeText(mission)}  ·  Fuel ${Math.round(mission.fuelLeft || 0)}% left`, w / 2, h / 2 + 24);
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('Press R to fly again · T for the title screen', w / 2, h / 2 + 78);
}

export function drawPaused(ctx, view) {
  const { w, h } = view;
  ctx.fillStyle = 'rgba(6,16,30,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', w / 2, h / 2);
  ctx.fillStyle = '#9fd0ff';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Press P to resume', w / 2, h / 2 + 36);
}

// --- World frame ------------------------------------------------------------
export function drawWorld(ctx, cam, view, plane, mission, time) {
  const horizonY = view.horizonY + plane.pitch * 260;
  const v = { ...view, horizonY };
  drawSky(ctx, view.w, view.h, horizonY, time);
  // The world banks with the plane; the HUD stays level.
  ctx.save();
  ctx.translate(view.w / 2, horizonY);
  ctx.rotate(-plane.roll * 0.45);
  ctx.translate(-view.w / 2, -horizonY);
  drawPeaks(ctx, cam, v);
  drawTerrain(ctx, cam, v, time);
  drawRunway(ctx, cam, v);
  drawClouds(ctx, cam, v, time);
  drawRings(ctx, cam, v, mission, time);
  ctx.restore();
}
