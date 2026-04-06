import { getState } from './state.js';

let notificationsEnabled = false;

export async function requestPermission() {
  if (!('Notification' in window)) return false;
  const perm = await Notification.requestPermission();
  notificationsEnabled = perm === 'granted';
  return notificationsEnabled;
}

export function sendNotification(title, body, icon) {
  const state = getState();
  if (!state.config.notifications || !notificationsEnabled) return;
  try {
    new Notification(title, { body, icon: icon || '', tag: title });
  } catch (e) {}
}

export function scheduleBlockReminder(block, dayName) {
  const state = getState();
  if (!state.config.notifications) return;
  const now = new Date();
  const [h, m] = block.time.split(':').map(Number);
  const reminderTime = new Date(now);
  reminderTime.setHours(h, m - 5, 0, 0);
  if (reminderTime <= now) return;
  const ms = reminderTime - now;
  setTimeout(() => {
    sendNotification(
      `En 5 min: ${block.subject}`,
      `Preparate para tu bloque de ${block.subject} (${block.dur} min)`,
      ''
    );
  }, ms);
}

export function scheduleAllReminders() {
  const state = getState();
  const dayName = state.selectedDay || getCurrentDayName();
  const blocks = state.schedule[dayName] || [];
  blocks.forEach(b => {
    if (b.cat !== 'descanso') scheduleBlockReminder(b, dayName);
  });
}

function getCurrentDayName() {
  const DAYS_ES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return DAYS_ES[new Date().getDay()];
}
