import { getState } from './state.js';

let audioCtx = null;

export function playBeep() {
  const state = getState();
  if (!state.config.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 800; g.gain.value = 0.1;
    o.start(); o.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

export function playPomodoroEnd() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 200, 400].forEach(delay => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = 880; g.gain.value = 0.15;
      o.start(audioCtx.currentTime + delay / 1000);
      o.stop(audioCtx.currentTime + delay / 1000 + 0.15);
    });
  } catch (e) {}
}

export function showConfetti() {
  let canvas = document.querySelector('.confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#7c3aed', '#c9a84c', '#22c55e', '#3b82f6', '#f97316', '#0ea5e9'];
  const pieces = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 100,
    w: 6 + Math.random() * 8,
    h: 6 + Math.random() * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 4,
    vx: (Math.random() - 0.5) * 2,
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 10,
    round: Math.random() > 0.5
  }));

  let frame = 0;
  const maxFrames = 180;
  function animate() {
    if (frame >= maxFrames) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.rot += p.rotV;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++; requestAnimationFrame(animate);
  }
  animate();
}

export function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById('currentDate');
  const timeEl = document.getElementById('currentTime');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function addSyncLog(msg) {
  const log = document.getElementById('syncLog');
  if (!log) return;
  const t = new Date().toLocaleString('es');
  log.innerHTML = `<div style="margin-bottom:4px">[${t}] ${msg}</div>` + log.innerHTML;
}

export function updateSyncStatus(status, text) {
  const state = getState();
  state.syncStatus = status;
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  if (!dot) return;
  dot.className = 'sync-dot ' + status;
  txt.textContent = text || (status === 'green' ? 'Sincronizado' : status === 'yellow' ? 'Pendiente' : 'Sin conexion');
}
