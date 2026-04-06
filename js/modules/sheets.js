import { getState, saveState, getTodayKey, getCurrentDayName, DAYS_ES } from './state.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function sheetsCall(accion, hoja, datos, extra = {}) {
  const state = getState();
  if (!state.config.sheetUrl) return { success: false, error: 'Sin URL configurada', retryable: false };

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const body = { accion, hoja };
      if (datos) body.datos = datos;
      Object.assign(body, extra);
      const resp = await fetch(state.config.sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      return { success: true, data: result.data, retryable: false };
    } catch (e) {
      clearTimeout(timeout);
      lastError = e.message;
      const isRetryable = e.name === 'AbortError' || e.message.includes('network') || e.message.includes('Failed to fetch');
      if (isRetryable && attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt);
        continue;
      }
      return { success: false, error: lastError, retryable: isRetryable };
    }
  }
  return { success: false, error: lastError || 'Error desconocido', retryable: false };
}

export async function syncToSheets(onLog, onStatus) {
  const state = getState();
  if (!state.config.sheetUrl) { onStatus('red', 'Sin Sheets'); return { success: false, error: 'Sin URL' }; }
  onStatus('yellow', 'Sincronizando...');
  onLog('Enviando horario a Sheets...');

  const horarioData = [];
  DAYS_ES.forEach(day => {
    (state.schedule[day] || []).forEach(b => {
      horarioData.push({ dia: day, hora: b.time, materia: b.subject, duracion_min: b.dur, categoria: b.cat });
    });
  });
  const r1 = await sheetsCall('escribir', 'HORARIO', horarioData);
  if (!r1.success) { onLog('Error HORARIO: ' + r1.error); onStatus('red', 'Error'); return r1; }
  onLog('HORARIO enviado (' + horarioData.length + ' bloques)');

  const dayKey = getTodayKey();
  const logs = state.logs[dayKey] || [];
  if (logs.length > 0) {
    const logData = logs.map(l => ({ fecha: dayKey, dia: getCurrentDayName(), hora: l.time, materia: l.subject, status: l.status, nota: l.note || '', timestamp: l.timestamp || Date.now() }));
    const r2 = await sheetsCall('escribir', 'LOGROS', logData);
    if (r2.success) onLog('LOGROS enviados (' + logData.length + ')');
    else onLog('Error LOGROS: ' + r2.error);
  }

  await sheetsCall('actualizar', 'CONFIGURACION', null, { clave: 'nombre_estudiante', valor: state.config.name });
  await sheetsCall('actualizar', 'CONFIGURACION', null, { clave: 'hora_inicio', valor: state.config.startHour });
  await sheetsCall('actualizar', 'CONFIGURACION', null, { clave: 'colores_json', valor: JSON.stringify(state.config.colors) });

  onStatus('green', 'Sincronizado');
  onLog('Sincronizacion completa');
  return { success: true };
}

export async function importFromSheets(onLog, onStatus) {
  const state = getState();
  if (!state.config.sheetUrl) { alert('Configura la URL primero'); return; }
  onLog('Importando desde Sheets...');
  onStatus('yellow', 'Importando...');

  const r1 = await sheetsCall('leer', 'HORARIO');
  if (r1.success && r1.data && r1.data.length > 0) {
    const sched = {};
    r1.data.forEach(row => {
      const day = row.dia || row['dia'];
      if (!day) return;
      if (!sched[day]) sched[day] = [];
      sched[day].push({
        time: sheetTimeToHHMM(row.hora || row['hora'] || '00:00'),
        subject: row.materia || row['materia'] || '',
        dur: parseInt(row.duracion_min || row['duracion_min'] || 30),
        cat: row.categoria || row['categoria'] || 'ciencias'
      });
    });
    state.schedule = sched;
    onLog('Horario importado (' + r1.data.length + ' bloques)');
  } else {
    onLog('No se encontro HORARIO en Sheets');
  }

  const r2 = await sheetsCall('leer', 'CONFIGURACION');
  if (r2.success && r2.data) {
    r2.data.forEach(row => {
      const key = row.clave || row['clave'];
      const val = row.valor || row['valor'];
      if (key === 'nombre_estudiante') state.config.name = val;
      if (key === 'hora_inicio') state.config.startHour = val;
      if (key === 'colores_json') state.config.colors = JSON.parse(val);
    });
    onLog('Configuracion importada');
  }

  const r3 = await sheetsCall('leer', 'LOGROS');
  if (r3.success && r3.data) {
    const logsByDate = {};
    r3.data.forEach(row => {
      const fecha = row.fecha || row['fecha'];
      if (!fecha) return;
      if (!logsByDate[fecha]) logsByDate[fecha] = [];
      logsByDate[fecha].push({
        time: sheetTimeToHHMM(row.hora || row['hora']),
        subject: row.materia || row['materia'],
        status: row.status || row['status'],
        note: row.nota || row['nota'] || null,
        timestamp: row.timestamp || row['timestamp'] || Date.now()
      });
    });
    state.logs = { ...state.logs, ...logsByDate };
    onLog('Logros importados (' + r3.data.length + ' registros)');
  }

  saveState();
  onStatus('green', 'Importado');
  alert('Datos importados desde Google Sheets');
}

function sheetTimeToHHMM(t) {
  if (t && t.includes('T')) { const d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
  return t || '00:00';
}
