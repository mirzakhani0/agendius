import { getState, saveState } from './state.js';
import { playPomodoroEnd, showConfetti } from './utils.js';
import { sendNotification } from './notifications.js';

const MODES = { focus: 25, shortBreak: 5, longBreak: 15 };

let pomoState = {
  running: false,
  mode: 'focus',
  timeLeft: MODES.focus * 60,
  sessions: 0,
  interval: null,
  currentBlock: null
};

export function getPomoState() { return pomoState; }

export function startPomodoro(mode = 'focus', block = null) {
  if (pomoState.interval) clearInterval(pomoState.interval);
  pomoState.mode = mode;
  pomoState.timeLeft = MODES[mode] * 60;
  pomoState.running = true;
  pomoState.currentBlock = block;
  pomoState.interval = setInterval(tick, 1000);
  renderPomodoro();
  if (block) sendNotification('Pomodoro iniciado', `${block.subject} - ${MODES[mode]} min`, '');
}

export function pausePomodoro() {
  if (pomoState.interval) clearInterval(pomoState.interval);
  pomoState.running = false;
  pomoState.interval = null;
  renderPomodoro();
}

export function resetPomodoro() {
  if (pomoState.interval) clearInterval(pomoState.interval);
  pomoState.running = false;
  pomoState.interval = null;
  pomoState.timeLeft = MODES[pomoState.mode] * 60;
  renderPomodoro();
}

export function setPomoMode(mode) {
  pomoState.mode = mode;
  resetPomodoro();
}

export function setPomoDuration(mode, minutes) {
  MODES[mode] = minutes;
  if (pomoState.mode === mode && !pomoState.running) {
    pomoState.timeLeft = minutes * 60;
    renderPomodoro();
  }
}

function tick() {
  pomoState.timeLeft--;
  if (pomoState.timeLeft <= 0) {
    clearInterval(pomoState.interval);
    pomoState.running = false;
    pomoState.interval = null;
    onPomodoroEnd();
  }
  renderPomodoro();
}

function onPomodoroEnd() {
  playPomodoroEnd();
  if (pomoState.mode === 'focus') {
    pomoState.sessions++;
    showConfetti();
    sendNotification('Pomodoro completado!', `${pomoState.sessions} sesiones hoy`, '');
    if (pomoState.sessions % 4 === 0) {
      pomoState.mode = 'longBreak';
      pomoState.timeLeft = MODES.longBreak * 60;
    } else {
      pomoState.mode = 'shortBreak';
      pomoState.timeLeft = MODES.shortBreak * 60;
    }
  } else {
    pomoState.mode = 'focus';
    pomoState.timeLeft = MODES.focus * 60;
  }
  renderPomodoro();
}

function renderPomodoro() {
  const bar = document.getElementById('pomodoroBar');
  const display = document.getElementById('pomoDisplay');
  const label = document.getElementById('pomoLabel');
  const startBtn = document.getElementById('pomoStartBtn');
  if (!bar || !display || !label || !startBtn) return;

  const mins = Math.floor(pomoState.timeLeft / 60);
  const secs = pomoState.timeLeft % 60;
  display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const modeLabels = { focus: 'Enfoque', shortBreak: 'Descanso corto', longBreak: 'Descanso largo' };
  label.textContent = `${modeLabels[pomoState.mode]} (${pomoState.sessions} sesiones)`;

  startBtn.textContent = pomoState.running ? '⏸ Pausar' : '▶ Iniciar';
  startBtn.className = pomoState.running ? '' : 'pomo-start';

  if (pomoState.currentBlock) {
    bar.classList.add('visible');
  }
}

export function renderPomodoroBar() {
  const bar = document.getElementById('pomodoroBar');
  if (!bar) return;
  bar.innerHTML = `
    <div>
      <div class="pomo-label" id="pomoLabel">Enfoque (0 sesiones)</div>
      <div class="pomo-display" id="pomoDisplay">25:00</div>
    </div>
    <div class="pomo-controls">
      <button id="pomoStartBtn" class="pomo-start">▶ Iniciar</button>
      <button id="pomoResetBtn">↺ Reset</button>
    </div>
    <div class="pomo-settings">
      <select id="pomoModeSelect">
        <option value="focus">Enfoque</option>
        <option value="shortBreak">Desc. corto</option>
        <option value="longBreak">Desc. largo</option>
      </select>
      <select id="pomoDurationSelect">
        <option value="25">25 min</option>
        <option value="20">20 min</option>
        <option value="15">15 min</option>
        <option value="50">50 min</option>
      </select>
    </div>`;

  document.getElementById('pomoStartBtn').addEventListener('click', () => {
    if (pomoState.running) pausePomodoro();
    else startPomodoro(pomoState.mode, pomoState.currentBlock);
  });
  document.getElementById('pomoResetBtn').addEventListener('click', resetPomodoro);
  document.getElementById('pomoModeSelect').addEventListener('change', (e) => setPomoMode(e.target.value));
  document.getElementById('pomoDurationSelect').addEventListener('change', (e) => setPomoDuration(pomoState.mode, parseInt(e.target.value)));

  renderPomodoro();
}
