import { getState, getSubjectTrend, getSubjectNotes, getDayLogs, getDayCompletedCount, getDayTotalMinutes, getBlockStatus, getTodayKey, getCurrentDayName, timeToMin, getCurrentTime } from './state.js';
import { DAYS_ES, DAYS_LABEL, CAT_COLORS, CAT_BADGES } from './constants.js';
import { playBeep, showConfetti, updateSyncStatus, addSyncLog } from './utils.js';
import { syncToSheets, importFromSheets } from './sheets.js';
import { startPomodoro, renderPomodoroBar } from './pomodoro.js';
import { requestPermission, scheduleAllReminders } from './notifications.js';

/* ═══════════════════════════════════════
   NAVEGACIÓN
   ═══════════════════════════════════════ */
document.querySelectorAll('#mainNav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mainNav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'week') renderWeekView();
    if (btn.dataset.view === 'admin') renderAdmin();
  });
});

/* ═══════════════════════════════════════
   RELOJ
   ═══════════════════════════════════════ */
function updateClock() {
  const now = new Date();
  document.getElementById('currentDate').textContent = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('currentTime').textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000); updateClock();

/* ═══════════════════════════════════════
   RENDER: HOY
   ═══════════════════════════════════════ */
function renderTodayView() {
  const state = getState();
  const dayName = state.selectedDay || getCurrentDayName();
  const dayKey = getTodayKey();
  const blocks = state.schedule[dayName] || [];
  const now = getCurrentTime(); const nowMin = timeToMin(now);

  const sel = document.getElementById('daySelector');
  sel.innerHTML = '';
  DAYS_ES.forEach((d, i) => {
    if (d === 'domingo') return;
    const btn = document.createElement('button');
    btn.textContent = DAYS_LABEL[i] || d.substring(0, 3);
    btn.className = d === dayName ? 'active' : '';
    btn.addEventListener('click', () => { state.selectedDay = d; renderTodayView() });
    sel.appendChild(btn);
  });

  const completed = getDayCompletedCount(dayKey);
  const total = blocks.length;
  const pct = total > 0 ? Math.round(completed / total * 100) : 0;
  document.getElementById('statCompleted').textContent = completed;
  document.getElementById('statStreak').textContent = state.streak;
  document.getElementById('statWeekly').textContent = pct + '%';
  document.getElementById('dayProgress').style.width = pct + '%';
  document.getElementById('greetingTitle').textContent = `Hola, ${state.config.name}`;

  const list = document.getElementById('blocksList');
  list.innerHTML = '';
  blocks.forEach(b => {
    const status = getBlockStatus(dayKey, b.time, b.subject);
    const blockMin = timeToMin(b.time); const endMin = blockMin + b.dur;
    const isActive = nowMin >= blockMin && nowMin < endMin;
    const statusClass = status === 'completado' ? 'completed' : status === 'parcial' ? 'partial' : status === 'saltado' ? 'skipped' : '';
    const statusIcon = status === 'completado' ? '✓' : status === 'parcial' ? '~' : status === 'saltado' ? '✗' : '';
    const color = state.config.colors[b.cat] || CAT_COLORS[b.cat] || '#888';

    const el = document.createElement('div');
    el.className = `block ${statusClass} ${isActive ? 'active-block' : ''}`;
    const trend = getSubjectTrend(b.subject);
    const trendIcon = trend.pct >= 80 ? '↑' : trend.pct >= 50 ? '→' : '↓';
    const trendClass = trend.pct >= 80 ? 'trend-up' : trend.pct >= 50 ? 'trend-flat' : 'trend-down';

    el.innerHTML = `
      <div class="cat-dot" style="background:${color}"></div>
      <div class="time">${b.time}</div>
      <div class="info">
        <div class="subject">${isActive ? '<span class="badge badge-purple" style="margin-right:6px">▶ AHORA</span>' : ''}${b.subject}<span class="trend-indicator ${trendClass}" data-tooltip="${trend.pct}% completado en 7 días">${trendIcon}</span></div>
        <div class="duration">${b.dur} min · <span class="badge ${CAT_BADGES[b.cat] || ''}">${b.cat}</span></div>
      </div>
      <div class="status-icon">${statusIcon}</div>
      <div class="block-actions">
        <button class="btn-complete" data-tooltip="Completado">✓</button>
        <button class="btn-partial" data-tooltip="Parcial">~</button>
        <button class="btn-skip" data-tooltip="Saltado">✗</button>
      </div>`;

    el.addEventListener('click', (e) => { if (!e.target.closest('.block-actions')) openBlockModal(b, dayKey, dayName) });
    el.querySelector('.btn-complete').addEventListener('click', (e) => { e.stopPropagation(); setBlockStatus(dayKey, b.time, b.subject, 'completado', null); playBeep(); renderTodayView(); checkAllCompleted(dayKey, dayName) });
    el.querySelector('.btn-partial').addEventListener('click', (e) => { e.stopPropagation(); setBlockStatus(dayKey, b.time, b.subject, 'parcial', null); renderTodayView() });
    el.querySelector('.btn-skip').addEventListener('click', (e) => { e.stopPropagation(); setBlockStatus(dayKey, b.time, b.subject, 'saltado', null); renderTodayView(); checkSkippedAlert(dayKey, dayName) });
    list.appendChild(el);
  });

  const ab = list.querySelector('.active-block');
  if (ab) ab.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setBlockStatus(dk, time, subj, status, note) {
  const state = getState();
  if (!state.logs[dk]) state.logs[dk] = [];
  const idx = state.logs[dk].findIndex(x => x.time === time && x.subject === subj);
  const entry = { time, subject: subj, status, note: note || null, timestamp: Date.now() };
  if (idx >= 0) state.logs[dk][idx] = entry; else state.logs[dk].push(entry);
  saveState();
}

function checkAllCompleted(dk, dn) {
  const state = getState();
  const blocks = state.schedule[dn] || []; const logs = getDayLogs(dk);
  const allDone = blocks.every(b => { if (b.cat === 'descanso') return true; return logs.find(l => l.time === b.time && l.subject === b.subject && (l.status === 'completado' || l.status === 'parcial')) });
  if (allDone && blocks.length > 5) showConfetti();
}

function checkSkippedAlert(dk, dn) {
  const state = getState();
  const skipped = getDayLogs(dk).filter(l => l.status === 'saltado').length;
  if (skipped > 2) {
    const blocks = state.schedule[dn] || []; const now = getCurrentTime(); const nowMin = timeToMin(now);
    const next = blocks.find(b => timeToMin(b.time) > nowMin && b.cat !== 'descanso');
    alert(`Llevas ${skipped} bloques sin completar. Tu proxima ventana de recuperacion es ${next ? next.time : 'manana'}.`);
  }
}

/* ═══════════════════════════════════════
   MODAL
   ═══════════════════════════════════════ */
function openBlockModal(block, dk, dn) {
  const state = getState();
  state.selectedBlock = { block, dk, dn };
  document.getElementById('modalTitle').textContent = block.subject;
  document.getElementById('modalInfo').textContent = `${block.time} · ${block.dur} min · ${dn.charAt(0).toUpperCase() + dn.slice(1)}`;
  document.getElementById('modalNote').value = '';

  const notes = getSubjectNotes(block.subject);
  let notesHtml = '';
  if (notes.length > 0) {
    notesHtml = '<div class="notes-history"><h4 style="font-size:.85rem;color:var(--text2);margin-bottom:8px">Notas anteriores:</h4>';
    notes.forEach(n => {
      notesHtml += `<div class="note-item"><div class="note-date">${n.date} · ${n.status}</div><div class="note-text">${n.note}</div></div>`;
    });
    notesHtml += '</div>';
  }

  let existingNotes = document.getElementById('modalNotes');
  if (existingNotes) existingNotes.remove();
  const notesDiv = document.createElement('div');
  notesDiv.id = 'modalNotes';
  notesDiv.innerHTML = notesHtml;
  document.getElementById('modalNote').parentElement.after(notesDiv);

  document.getElementById('blockModal').classList.add('visible');
}

document.getElementById('modalClose').addEventListener('click', () => { document.getElementById('blockModal').classList.remove('visible'); getState().selectedBlock = null });
document.getElementById('modalComplete').addEventListener('click', () => {
  const state = getState();
  if (!state.selectedBlock) return; const { block, dk, dn } = state.selectedBlock;
  setBlockStatus(dk, block.time, block.subject, 'completado', document.getElementById('modalNote').value);
  playBeep(); document.getElementById('blockModal').classList.remove('visible'); renderTodayView(); checkAllCompleted(dk, dn); state.selectedBlock = null;
});
document.getElementById('modalPartial').addEventListener('click', () => {
  const state = getState();
  if (!state.selectedBlock) return; const { block, dk } = state.selectedBlock;
  setBlockStatus(dk, block.time, block.subject, 'parcial', document.getElementById('modalNote').value);
  document.getElementById('blockModal').classList.remove('visible'); renderTodayView(); state.selectedBlock = null;
});
document.getElementById('modalSkip').addEventListener('click', () => {
  const state = getState();
  if (!state.selectedBlock) return; const { block, dk, dn } = state.selectedBlock;
  setBlockStatus(dk, block.time, block.subject, 'saltado', document.getElementById('modalNote').value);
  document.getElementById('blockModal').classList.remove('visible'); renderTodayView(); checkSkippedAlert(dk, dn); state.selectedBlock = null;
});

/* ═══════════════════════════════════════
   RENDER: SEMANA
   ═══════════════════════════════════════ */
function renderWeekView() {
  const state = getState();
  const grid = document.getElementById('weekGrid');
  const searchInput = document.getElementById('weekSearchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

  grid.innerHTML = '';
  DAYS_ES.forEach((day, i) => {
    if (day === 'domingo') return;
    const blocks = state.schedule[day] || [];
    const col = document.createElement('div'); col.className = 'week-day';
    col.innerHTML = `<h3>${DAYS_LABEL[i] || day}</h3>`;
    let visibleCount = 0;
    blocks.forEach(b => {
      const color = state.config.colors[b.cat] || CAT_COLORS[b.cat] || '#888';
      const matches = !searchTerm || b.subject.toLowerCase().includes(searchTerm) || b.cat.toLowerCase().includes(searchTerm);
      col.innerHTML += `<div class="week-block ${matches ? '' : 'hidden'}" style="border-left-color:${color}"><span class="wb-time">${b.time}</span><span class="wb-subject">${b.subject}</span></div>`;
      if (matches) visibleCount++;
    });
    if (!visibleCount && searchTerm) col.classList.add('no-results');
    grid.appendChild(col);
  });
}

document.getElementById('weekSearchInput').addEventListener('input', renderWeekView);
document.getElementById('weekSearchClear').addEventListener('click', () => {
  document.getElementById('weekSearchInput').value = '';
  document.getElementById('weekSearchClear').classList.remove('visible');
  renderWeekView();
});
document.getElementById('weekSearchInput').addEventListener('input', function () {
  document.getElementById('weekSearchClear').classList.toggle('visible', this.value.length > 0);
});

/* ═══════════════════════════════════════
   ADMIN: PIN
   ═══════════════════════════════════════ */
document.querySelectorAll('#pinPad button').forEach(btn => {
  btn.addEventListener('click', () => {
    const state = getState();
    const v = btn.dataset.pin;
    if (v === 'clear') state.pinInput = '';
    else if (v === 'del') state.pinInput = state.pinInput.slice(0, -1);
    else { if (state.pinInput.length < 4) state.pinInput += v }
    updatePinDots();
    if (state.pinInput.length === 4) checkPin();
  });
});
function updatePinDots() {
  const state = getState();
  document.querySelectorAll('#pinDots .pin-dot').forEach((d, i) => d.classList.toggle('filled', i < state.pinInput.length));
}
function checkPin() {
  const state = getState();
  const pinHash = simpleHash(state.config.pin);
  const inputHash = simpleHash(state.pinInput);
  if (inputHash === pinHash || state.pinInput === state.config.pin) {
    state.adminAuthenticated = true;
    document.getElementById('pinScreen').style.display = 'none';
    document.getElementById('adminPanel').classList.add('visible');
    renderAdminEditor(); renderAdminConfig();
  } else {
    const s = document.getElementById('pinScreen'); s.classList.add('shake');
    document.getElementById('pinError').textContent = 'PIN incorrecto';
    setTimeout(() => { s.classList.remove('shake'); document.getElementById('pinError').textContent = '' }, 600);
    state.pinInput = ''; updatePinDots();
  }
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/* ═══════════════════════════════════════
   ADMIN TABS
   ═══════════════════════════════════════ */
document.querySelectorAll('.admin-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + btn.dataset.admin).classList.add('active');
    if (btn.dataset.admin === 'stats') renderStats();
  });
});

/* ═══════════════════════════════════════
   ADMIN: EDITOR
   ═══════════════════════════════════════ */
function renderAdminEditor() {
  const state = getState();
  const c = document.getElementById('scheduleTable');
  let h = '<table><thead><tr><th>Dia</th><th>Hora</th><th>Materia</th><th>Dur.</th><th>Categoria</th><th></th></tr></thead><tbody>';
  DAYS_ES.forEach(day => {
    if (day === 'domingo') return;
    (state.schedule[day] || []).forEach((b, i) => {
      h += `<tr data-day="${day}" data-idx="${i}">
        <td><input value="${day}" readonly style="opacity:.6"></td>
        <td><input type="time" value="${b.time}" class="inp-time"></td>
        <td><input value="${b.subject}" class="inp-subject"></td>
        <td><input type="number" value="${b.dur}" class="inp-dur" min="5" max="180" step="5"></td>
        <td><select class="inp-cat">${Object.keys(CAT_COLORS).map(c => `<option value="${c}" ${c === b.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
        <td><button class="btn btn-danger" style="padding:4px 8px;font-size:.7rem" data-delete="${day},${i}">✗</button></td>
      </tr>`;
    });
  });
  h += '</tbody></table>'; c.innerHTML = h;

  c.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [day, idx] = btn.dataset.delete.split(',');
      state.schedule[day].splice(parseInt(idx), 1);
      saveState(); renderAdminEditor();
    });
  });
}

document.getElementById('btnAddBlock').addEventListener('click', () => {
  const state = getState();
  const day = getCurrentDayName();
  state.schedule[day].push({ time: '12:00', subject: 'NUEVO', dur: 30, cat: 'ciencias' });
  saveState(); renderAdminEditor();
});

document.getElementById('btnSaveSchedule').addEventListener('click', async () => {
  const state = getState();
  document.querySelectorAll('#scheduleTable tbody tr').forEach(tr => {
    const day = tr.querySelector('input').value;
    const time = tr.querySelector('.inp-time').value;
    const subject = tr.querySelector('.inp-subject').value;
    const dur = parseInt(tr.querySelector('.inp-dur').value);
    const cat = tr.querySelector('.inp-cat').value;
    const idx = parseInt(tr.dataset.idx);
    if (state.schedule[day] && state.schedule[day][idx]) state.schedule[day][idx] = { time, subject, dur, cat };
  });
  saveState();
  addSyncLog('Horario guardado localmente');
  if (state.config.sheetUrl) {
    addSyncLog('Enviando a Google Sheets...');
    const r = await syncToSheets(addSyncLog, updateSyncStatus);
    if (r && r.success) alert('Guardado en Google Sheets');
    else alert('Guardado local. Error Sheets: ' + (r ? r.error : 'Sin URL'));
  } else {
    alert('Horario guardado (local). Configura Sheets en Admin > Config para backup en la nube.');
  }
  renderTodayView();
});

/* ═══════════════════════════════════════
   ADMIN: CONFIG
   ═══════════════════════════════════════ */
function renderAdminConfig() {
  const state = getState();
  document.getElementById('cfgName').value = state.config.name;
  document.getElementById('cfgPin').value = state.config.pin;
  document.getElementById('cfgSheetUrl').value = state.config.sheetUrl;
  document.getElementById('cfgSheetId').value = state.config.sheetId;
  document.getElementById('colCiencias').value = state.config.colors.ciencias || CAT_COLORS.ciencias;
  document.getElementById('colMatematicas').value = state.config.colors.matematicas || CAT_COLORS.matematicas;
  document.getElementById('colSocial').value = state.config.colors.social || CAT_COLORS.social;
  document.getElementById('colVerbal').value = state.config.colors.verbal || CAT_COLORS.verbal;
  document.getElementById('colBienestar').value = state.config.colors.bienestar || CAT_COLORS.bienestar;
  document.getElementById('colDescanso').value = state.config.colors.descanso || CAT_COLORS.descanso;
  document.getElementById('cfgStartHour').value = state.config.startHour;
  document.getElementById('cfgSound').checked = state.config.sound;
  document.getElementById('cfgNotif').checked = state.config.notifications;
  document.getElementById('cfgFocus').checked = state.config.focus;
}

document.getElementById('btnSaveConfig').addEventListener('click', async () => {
  const state = getState();
  state.config.name = document.getElementById('cfgName').value;
  const np = document.getElementById('cfgPin').value; if (/^\d{4}$/.test(np)) state.config.pin = np;
  state.config.sheetUrl = document.getElementById('cfgSheetUrl').value;
  state.config.sheetId = document.getElementById('cfgSheetId').value;
  state.config.colors = {
    ciencias: document.getElementById('colCiencias').value,
    matematicas: document.getElementById('colMatematicas').value,
    social: document.getElementById('colSocial').value,
    verbal: document.getElementById('colVerbal').value,
    bienestar: document.getElementById('colBienestar').value,
    descanso: document.getElementById('colDescanso').value
  };
  state.config.startHour = document.getElementById('cfgStartHour').value;
  state.config.sound = document.getElementById('cfgSound').checked;
  state.config.notifications = document.getElementById('cfgNotif').checked;
  state.config.focus = document.getElementById('cfgFocus').checked;
  saveState(); addSyncLog('Configuracion guardada'); alert('Configuracion guardada'); renderTodayView();
  if (state.config.notifications) await requestPermission();
});

/* ═══════════════════════════════════════
   ADMIN: ESTADÍSTICAS
   ═══════════════════════════════════════ */
function renderStats() {
  const sc = {}; const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dn = DAYS_ES[d.getDay()]; const blocks = getState().schedule[dn] || []; const logs = getState().logs[key] || [];
    logs.forEach(l => {
      if (l.status === 'completado' || l.status === 'parcial') {
        const b = blocks.find(bl => bl.time === l.time && bl.subject === l.subject);
        if (b) sc[l.subject] = (sc[l.subject] || 0) + (l.status === 'completado' ? b.dur : Math.round(b.dur * 0.5));
      }
    });
  }
  drawBarChart(sc); drawStreakChart(); renderStatsSummary(sc);
}

function drawBarChart(data) {
  const canvas = document.getElementById('chartSubjects'); const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 32;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) { ctx.fillStyle = '#6a6a82'; ctx.font = '14px Sora'; ctx.textAlign = 'center'; ctx.fillText('Sin datos esta semana', canvas.width / 2, canvas.height / 2); return }
  const max = Math.max(...entries.map(e => e[1])); const barW = Math.min(40, (canvas.width - 60) / entries.length - 8); const cH = canvas.height - 50;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  entries.forEach(([s, m], i) => { const x = 30 + i * (barW + 8); const h = (m / max) * cH; const y = canvas.height - 30 - h; ctx.fillStyle = getSubjectColor(s); ctx.fillRect(x, y, barW, h); ctx.fillStyle = '#a0a0b8'; ctx.font = '9px Sora'; ctx.textAlign = 'center'; ctx.fillText(s.substring(0, 6), x + barW / 2, canvas.height - 16); ctx.fillStyle = '#e8e8f0'; ctx.fillText((m / 60).toFixed(1) + 'h', x + barW / 2, y - 6) });
}

function getSubjectColor(s) {
  const state = getState();
  const u = s.toUpperCase();
  if (['BIOLOGÍA', 'QUÍMICA', 'FÍSICA', 'ANATOMÍA'].some(m => u.includes(m))) return state.config.colors.ciencias || CAT_COLORS.ciencias;
  if (['RM', 'ARITMÉTICA'].some(m => u.includes(m))) return state.config.colors.matematicas || CAT_COLORS.matematicas;
  if (u.includes('R.V.')) return state.config.colors.verbal || CAT_COLORS.verbal;
  if (u.includes('MEDITAR')) return state.config.colors.bienestar || CAT_COLORS.bienestar;
  return state.config.colors.social || CAT_COLORS.social;
}

function drawStreakChart() {
  const canvas = document.getElementById('chartStreak'); const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth - 32;
  const days = 7; const data = []; const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dn = DAYS_ES[d.getDay()]; const blocks = getState().schedule[dn] || []; const logs = getState().logs[key] || [];
    const comp = logs.filter(l => l.status === 'completado').length;
    data.push({ day: DAYS_LABEL[d.getDay()] || '', pct: blocks.length > 0 ? Math.round(comp / blocks.length * 100) : 0 });
  }
  const cW = canvas.width - 60; const cH = canvas.height - 50; ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath(); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2;
  data.forEach((d, i) => { const x = 30 + (i / (days - 1)) * cW; const y = canvas.height - 30 - (d.pct / 100) * cH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) });
  ctx.stroke();
  data.forEach((d, i) => { const x = 30 + (i / (days - 1)) * cW; const y = canvas.height - 30 - (d.pct / 100) * cH; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#7c3aed'; ctx.fill(); ctx.fillStyle = '#a0a0b8'; ctx.font = '10px Sora'; ctx.textAlign = 'center'; ctx.fillText(d.day, x, canvas.height - 14); ctx.fillStyle = '#e8e8f0'; ctx.fillText(d.pct + '%', x, y - 10) });
}

function renderStatsSummary(data) {
  const c = document.getElementById('statsSummary'); const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  let h = '<table style="width:100%;font-size:.85rem"><thead><tr><th>Materia</th><th>Minutos</th><th>Horas</th><th>Tendencia</th></tr></thead><tbody>';
  entries.forEach(([s, m]) => {
    const trend = getSubjectTrend(s);
    const trendIcon = trend.pct >= 80 ? '<span class="trend-up">↑</span>' : trend.pct >= 50 ? '<span class="trend-flat">→</span>' : '<span class="trend-down">↓</span>';
    h += `<tr><td>${s}</td><td>${m}</td><td>${(m / 60).toFixed(1)}</td><td>${trendIcon} ${trend.pct}%</td></tr>`;
  });
  h += '</tbody></table>'; c.innerHTML = h;
}

document.getElementById('btnExportReport').addEventListener('click', () => {
  const state = getState();
  const dk = getTodayKey(); const dn = getCurrentDayName(); const blocks = state.schedule[dn] || []; const logs = getDayLogs(dk);
  let t = `REPORTE SEMANAL - ${new Date().toLocaleDateString('es')}\n\n`;
  t += `Completados: ${getDayCompletedCount(dk)}\nMinutos: ${getDayTotalMinutes(dk)}\nRacha: ${state.streak} dias\n\nBloques:\n`;
  blocks.forEach(b => { const s = getBlockStatus(dk, b.time, b.subject); const icon = s === 'completado' ? '[OK]' : s === 'parcial' ? '[~]' : s === 'saltado' ? '[X]' : '[ ]'; t += `${icon} ${b.time} ${b.subject} (${b.dur}min)\n` });
  navigator.clipboard.writeText(t).then(() => alert('Reporte copiado'));
});

document.getElementById('btnExportPDF').addEventListener('click', exportToPDF);

function exportToPDF() {
  const state = getState();
  const dk = getTodayKey(); const dn = getCurrentDayName(); const blocks = state.schedule[dn] || [];
  const printWindow = window.open('', '_blank');
  let html = `<html><head><title>Agenda - ${new Date().toLocaleDateString('es')}</title><style>
    body{font-family:Arial,sans-serif;padding:20px;color:#333}
    h1{color:#7c3aed;border-bottom:2px solid #7c3aed;padding-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#f0f0f0;padding:8px;text-align:left;font-size:12px}
    td{padding:6px 8px;border-bottom:1px solid #eee;font-size:12px}
    .ok{color:#22c55e}.partial{color:#c9a84c}.skip{color:#ef4444}
    @media print{body{padding:0}}
  </style></head><body>`;
  html += `<h1>Mi Agenda de Estudio - ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h1>`;
  html += `<p>Estudiante: ${state.config.name} | Completados: ${getDayCompletedCount(dk)} | Racha: ${state.streak} dias</p>`;
  html += '<table><thead><tr><th>Hora</th><th>Materia</th><th>Dur.</th><th>Categoria</th><th>Estado</th></tr></thead><tbody>';
  blocks.forEach(b => {
    const s = getBlockStatus(dk, b.time, b.subject);
    const statusClass = s === 'completado' ? 'ok' : s === 'parcial' ? 'partial' : s === 'saltado' ? 'skip' : '';
    const statusText = s || 'Pendiente';
    html += `<tr><td>${b.time}</td><td>${b.subject}</td><td>${b.dur} min</td><td>${b.cat}</td><td class="${statusClass}">${statusText}</td></tr>`;
  });
  html += '</tbody></table></body></html>';
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}

/* ═══════════════════════════════════════
   ADMIN: DATOS
   ═══════════════════════════════════════ */
document.getElementById('btnSyncSheets').addEventListener('click', async () => {
  const state = getState();
  if (!state.config.sheetUrl) { alert('Configura la URL de Google Apps Script primero'); return }
  await syncToSheets(addSyncLog, updateSyncStatus);
});

document.getElementById('btnImportSheets').addEventListener('click', () => { importFromSheets(addSyncLog, updateSyncStatus); });

document.getElementById('btnClearDay').addEventListener('click', () => {
  if (!confirm('Limpiar registros del dia actual?')) return;
  const state = getState();
  state.logs[getTodayKey()] = []; saveState(); addSyncLog('Dia limpiado'); renderTodayView();
});

document.getElementById('btnResetWeek').addEventListener('click', () => {
  if (!confirm('Resetear TODA la semana?')) return;
  const state = getState();
  state.logs = {}; state.streak = 0; saveState(); addSyncLog('Semana reseteada'); renderTodayView();
});

document.getElementById('btnExportJSON').addEventListener('click', () => {
  const state = getState();
  const json = JSON.stringify({ schedule: state.schedule, logs: state.logs, config: state.config, streak: state.streak }, null, 2);
  const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'agenda_backup_' + getTodayKey() + '.json'; a.click();
  URL.revokeObjectURL(url); addSyncLog('Backup JSON exportado');
});

document.getElementById('btnImportJSON').addEventListener('click', () => {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return; const r = new FileReader();
    r.onload = (ev) => {
      try {
        const state = getState();
        const d = JSON.parse(ev.target.result);
        state.schedule = d.schedule || state.schedule; state.logs = d.logs || {};
        state.config = { ...state.config, ...d.config }; state.streak = d.streak || 0;
        saveState(); addSyncLog('Importado desde JSON'); renderTodayView(); renderAdminConfig(); alert('Importado');
      } catch (err) { alert('Error JSON') }
    }; r.readAsText(file);
  };
  input.click();
});

/* ═══════════════════════════════════════
   RENDER ADMIN
   ═══════════════════════════════════════ */
function renderAdmin() {
  const state = getState();
  if (state.adminAuthenticated) { document.getElementById('pinScreen').style.display = 'none'; document.getElementById('adminPanel').classList.add('visible') }
  else { document.getElementById('pinScreen').classList.add('visible'); document.getElementById('adminPanel').classList.remove('visible') }
}

/* ═══════════════════════════════════════
   INIT
   ═══════════════════════════════════════ */
function init() {
  const state = getState();
  loadState();
  state.selectedDay = getCurrentDayName();

  if (!state.config.sheetUrl) {
    document.getElementById('setupScreen').style.display = 'flex';
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('view-today').style.display = 'none';
  } else {
    renderTodayView();
    updateSyncStatus('green', 'Listo');
  }

  setInterval(() => { if (document.getElementById('view-today').classList.contains('active')) renderTodayView() }, 60000);
  if (state.config.notifications && 'Notification' in window) requestPermission();
  renderPomodoroBar();
}

document.getElementById('setupStart').addEventListener('click', () => {
  const state = getState();
  const url = document.getElementById('setupSheetUrl').value.trim();
  const name = document.getElementById('setupName').value.trim();
  if (!url) { alert('Pega la URL de tu Apps Script'); return }
  if (!url.includes('script.google.com')) { alert('La URL debe ser de script.google.com'); return }
  if (!name) { alert('Dinos tu nombre'); return }
  state.config.sheetUrl = url;
  state.config.name = name;
  saveState();
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('mainNav').style.display = '';
  document.getElementById('view-today').style.display = '';
  renderTodayView();
  updateSyncStatus('green', 'Listo');
});

document.getElementById('setupLogin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('mainNav').style.display = '';
  document.getElementById('view-today').style.display = '';
  renderTodayView();
  updateSyncStatus('green', 'Listo');
});

document.getElementById('btnChangeAccount').addEventListener('click', () => {
  if (!confirm('Cambiar de cuenta? Se mostrara la pantalla de configuracion para poner otra URL de Sheets.')) return;
  const state = getState();
  state.config.sheetUrl = '';
  saveState();
  location.reload();
});

init();
