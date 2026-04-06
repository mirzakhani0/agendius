import { DEFAULT_SCHEDULE, CAT_COLORS, DAYS_ES } from './constants.js';

let state = {
  schedule: {},
  logs: {},
  config: { name: 'Estudiante', pin: '1234', sheetUrl: '', sheetId: '', colors: { ...CAT_COLORS }, startHour: '04:00', sound: true, notifications: false, focus: false },
  streak: 0,
  selectedDay: '',
  selectedBlock: null,
  pinInput: '',
  adminAuthenticated: false,
  syncStatus: 'yellow'
};

export function getState() { return state; }

export function saveState() {
  localStorage.setItem('agenda_state', JSON.stringify({ schedule: state.schedule, logs: state.logs, config: state.config, streak: state.streak }));
}

export function loadState() {
  const s = localStorage.getItem('agenda_state');
  if (s) {
    const d = JSON.parse(s);
    state.schedule = d.schedule || DEFAULT_SCHEDULE;
    state.logs = d.logs || {};
    state.config = { ...state.config, ...d.config };
    state.streak = d.streak || 0;
  } else {
    state.schedule = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
  }
}

export function getTodayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function getCurrentDayName() { return DAYS_ES[new Date().getDay()]; }

export { DAYS_ES };

export function getCurrentTime() {
  const n = new Date();
  return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
}

export function timeToMin(t) {
  if (t.includes('T')) { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  const [h, m] = t.split(':').map(Number); return h * 60 + m;
}

export function sheetTimeToHHMM(t) {
  if (t.includes('T')) { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
  return t;
}

export function getDayLogs(k) { return state.logs[k] || []; }

export function getBlockStatus(dk, time, subj) {
  const l = getDayLogs(dk);
  const f = l.find(x => x.time === time && x.subject === subj);
  return f ? f.status : null;
}

export function setBlockStatus(dk, time, subj, status, note) {
  if (!state.logs[dk]) state.logs[dk] = [];
  const idx = state.logs[dk].findIndex(x => x.time === time && x.subject === subj);
  const entry = { time, subject: subj, status, note: note || null, timestamp: Date.now() };
  if (idx >= 0) state.logs[dk][idx] = entry; else state.logs[dk].push(entry);
  saveState();
}

export function getDayTotalMinutes(dk) {
  const logs = getDayLogs(dk);
  const dayName = getCurrentDayName();
  const blocks = state.schedule[dayName] || [];
  let mins = 0;
  logs.forEach(l => {
    if (l.status === 'completado' || l.status === 'parcial') {
      const b = blocks.find(bl => bl.time === l.time && bl.subject === l.subject);
      mins += b ? (l.status === 'completado' ? b.dur : Math.round(b.dur * 0.5)) : 0;
    }
  });
  return mins;
}

export function getDayCompletedCount(dk) { return getDayLogs(dk).filter(l => l.status === 'completado').length; }
export function getDaySkippedCount(dk) { return getDayLogs(dk).filter(l => l.status === 'saltado').length; }

export function getSubjectTrend(subject, days = 7) {
  const today = new Date();
  let totalCompleted = 0, totalPossible = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dn = DAYS_ES[d.getDay()];
    const blocks = state.schedule[dn] || [];
    const logs = state.logs[key] || [];
    const subjectBlocks = blocks.filter(b => b.subject === subject);
    totalPossible += subjectBlocks.length;
    subjectBlocks.forEach(sb => {
      const log = logs.find(l => l.time === sb.time && l.subject === sb.subject);
      if (log && (log.status === 'completado' || log.status === 'parcial')) totalCompleted++;
    });
  }
  return { completed: totalCompleted, possible: totalPossible, pct: totalPossible > 0 ? Math.round(totalCompleted / totalPossible * 100) : 0 };
}

export function getSubjectNotes(subject) {
  const notes = [];
  Object.keys(state.logs).forEach(dk => {
    state.logs[dk].forEach(l => {
      if (l.subject === subject && l.note) {
        notes.push({ date: dk, note: l.note, status: l.status, timestamp: l.timestamp || 0 });
      }
    });
  });
  return notes.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
}


