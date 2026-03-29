/**
 * parser.js - Parses natural Spanish language into structured task data.
 */

const INTENTS = {
  create: /\b(recu[eé]rdame|nueva|crear|agendar|programar|tengo|debo|necesito|agregar|a[nñ]adir|recordar)\b/i,
  list: /\b(listar|lista|mis\s+tareas|qu[eé]\s+tengo|pendientes|mostrar)\b/i,
  complete: /(completar|completada|hecho|listo|done|terminar|termin[eé]|ya\s+termin[eé]|ya\s+hice|ya\s+lo\s+hice)/i,
  delete: /\b(eliminar|borrar|quitar|cancelar)\b/i,
  help: /\b(ayuda|help|comandos|qu[eé]\s+puedes\s+hacer)\b/i,
};

const WEEKDAYS = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, 'miércoles': 3,
  jueves: 4, viernes: 5, sabado: 6, 'sábado': 6,
};

// Build weekday regex from keys
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'mi[eé]rcoles', 'jueves', 'viernes', 's[aá]bado'];

function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  // "recuérdame" siempre es crear, aunque contenga "tengo"
  if (/\brecu[eé]rdame\b/i.test(lower)) return 'create';
  // Verificar list ANTES que create, porque "qué tengo" contiene "tengo"
  if (INTENTS.list.test(lower)) return 'list';
  if (INTENTS.complete.test(lower)) return 'complete';
  if (INTENTS.delete.test(lower)) return 'delete';
  if (INTENTS.help.test(lower)) return 'help';
  if (INTENTS.create.test(lower)) return 'create';
  return 'unknown';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getNextWeekday(dayIndex) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay();
  let diff = dayIndex - currentDay;
  if (diff <= 0) diff += 7;
  const result = new Date(today);
  result.setDate(result.getDate() + diff);
  return result;
}

function parseDate(text) {
  const lower = text.toLowerCase();

  // "pasado mañana" must come before "mañana"
  if (/pasado\s+ma[nñ]ana/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }

  if (/\bma[nñ]ana\b/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  if (/\bhoy\b/i.test(lower)) {
    return formatDate(new Date());
  }

  // Weekday names
  for (const pattern of WEEKDAY_NAMES) {
    const re = new RegExp(`\\b(el\\s+)?${pattern}\\b`, 'i');
    const match = lower.match(re);
    if (match) {
      // Resolve actual day index
      const matched = match[0].replace(/^el\s+/i, '').toLowerCase();
      let dayIndex;
      if (/^dom/i.test(matched)) dayIndex = 0;
      else if (/^lun/i.test(matched)) dayIndex = 1;
      else if (/^mar/i.test(matched)) dayIndex = 2;
      else if (/^mi/i.test(matched)) dayIndex = 3;
      else if (/^jue/i.test(matched)) dayIndex = 4;
      else if (/^vie/i.test(matched)) dayIndex = 5;
      else if (/^s[aá]b/i.test(matched)) dayIndex = 6;
      if (dayIndex !== undefined) {
        return formatDate(getNextWeekday(dayIndex));
      }
    }
  }

  // DD/MM format
  const ddmm = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (ddmm) {
    const day = parseInt(ddmm[1], 10);
    const month = parseInt(ddmm[2], 10) - 1;
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, month, day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      year++;
    }
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  return null;
}

/**
 * Parse "en X minutos/horas" as a relative offset from now.
 * Returns { date: 'YYYY-MM-DD', time: 'HH:MM' } or null.
 */
function parseRelativeTime(text) {
  const lower = text.toLowerCase();

  // "en X minutos" / "dentro de X minutos"
  let m = lower.match(/(?:dentro\s+de|en)\s+(\d+)\s+minutos?\b/i);
  if (m) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + parseInt(m[1], 10));
    return { date: formatDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  // "en media hora" / "dentro de media hora"
  m = lower.match(/(?:dentro\s+de|en)\s+media\s+hora\b/i);
  if (m) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return { date: formatDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  // "en X horas" / "dentro de X horas"
  m = lower.match(/(?:dentro\s+de|en)\s+(\d+)\s+horas?\b/i);
  if (m) {
    const d = new Date();
    d.setHours(d.getHours() + parseInt(m[1], 10));
    return { date: formatDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  // "en una hora" / "dentro de una hora"
  m = lower.match(/(?:dentro\s+de|en)\s+una\s+hora\b/i);
  if (m) {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return { date: formatDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  return null;
}

function parseTime(text) {
  const lower = text.toLowerCase();

  // "a las HH:MM"
  let m = lower.match(/a\s+las?\s+(\d{1,2}):(\d{2})/i);
  if (m) {
    return `${pad(parseInt(m[1], 10))}:${m[2]}`;
  }

  // "a las 9am", "a las 3pm"
  m = lower.match(/a\s+las?\s+(\d{1,2})\s*(am|pm)/i);
  if (m) {
    let h = parseInt(m[1], 10);
    if (m[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[2].toLowerCase() === 'am' && h === 12) h = 0;
    return `${pad(h)}:00`;
  }

  // "9 de la mañana", "3 de la tarde", "9 de la noche"
  // ANTES de "a las 9" solo, para que "a las 6 de la tarde" no se coma el 6 sin contexto
  m = lower.match(/(\d{1,2})\s+de\s+la\s+(ma[nñ]ana|tarde|noche)/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const period = m[2].toLowerCase().replace('ñ', 'n');
    if (period === 'tarde' && h < 12) h += 12;
    if (period === 'noche' && h < 12) h += 12;
    return `${pad(h)}:00`;
  }

  // "a las 9" (no am/pm, no minutes, no "de la tarde/mañana/noche" after)
  m = lower.match(/a\s+las?\s+(\d{1,2})(?!\s*[:\/\d])/i);
  if (m) {
    const h = parseInt(m[1], 10);
    return `${pad(h)}:00`;
  }

  // "2pm", "3am", "14:00" standalone (sin "a las")
  m = lower.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    if (m[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[2].toLowerCase() === 'am' && h === 12) h = 0;
    return `${pad(h)}:00`;
  }

  m = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    return `${pad(parseInt(m[1], 10))}:${m[2]}`;
  }

  // "en la mañana", "en la tarde", "en la noche" (no specific time)
  if (/en\s+la\s+ma[nñ]ana/i.test(lower)) return '09:00';
  if (/en\s+la\s+tarde/i.test(lower)) return '14:00';
  if (/en\s+la\s+noche/i.test(lower)) return '20:00';

  return null;
}

function parseReminderBefore(text) {
  const lower = text.toLowerCase();

  // "media hora antes"
  if (/media\s+hora\s+antes/i.test(lower)) return 30;

  // "un dia antes" / "un día antes"
  if (/un\s+d[ií]a\s+antes/i.test(lower)) return 1440;

  // "X horas antes"
  let m = lower.match(/(\d+)\s+horas?\s+antes/i);
  if (m) return parseInt(m[1], 10) * 60;

  // "X minutos antes"
  m = lower.match(/(\d+)\s+minutos?\s+antes/i);
  if (m) return parseInt(m[1], 10);

  return 0;
}

function extractTaskId(text) {
  // "completar 3", "borrar tarea 2", "ya termine la 5"
  const m = text.match(/(?:tarea\s+|la\s+|el\s+)?#?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractTaskDescription(text, intent) {
  let cleaned = text;

  // Remove only the INITIAL trigger phrase (not from middle of sentence)
  // e.g. "Recuérdame que tengo que ir al gym" → "tengo que ir al gym"
  cleaned = cleaned.replace(/^\s*(recu[eé]rdame|nueva\s+tarea|nueva|crear|agendar|programar|agregar|a[nñ]adir)\s*/i, '');

  // Remove trailing request phrases like "me puedes recordar", "puedes recordarme", etc.
  cleaned = cleaned.replace(/,?\s*(me\s+puedes\s+(recordar|avisar)|puedes\s+(recordarme|avisarme)|por\s+favor)\s*[?]?\s*$/gi, '');

  // Remove "avísame/recuérdame" + reminder spec at end or middle
  cleaned = cleaned.replace(/,?\s*(av[ií]same|recu[eé]rdame)\s+(\d+\s+(minutos?|horas?)\s+antes|media\s+hora\s+antes|un\s+d[ií]a\s+antes)/gi, '');
  // Standalone trailing "avísame" / "recuérdame"
  cleaned = cleaned.replace(/,?\s*(av[ií]same|recu[eé]rdame)\s*$/gi, '');

  // Remove reminder-before patterns (standalone)
  cleaned = cleaned.replace(/,?\s*media\s+hora\s+antes/gi, '');
  cleaned = cleaned.replace(/,?\s*un\s+d[ií]a\s+antes/gi, '');
  cleaned = cleaned.replace(/,?\s*\d+\s+(horas?|minutos?)\s+antes/gi, '');

  // Remove date patterns
  cleaned = cleaned.replace(/\bpasado\s+ma[nñ]ana\b/gi, '');
  cleaned = cleaned.replace(/\bma[nñ]ana\b/gi, '');
  cleaned = cleaned.replace(/\bhoy\b/gi, '');
  cleaned = cleaned.replace(/\b(el\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/gi, '');
  cleaned = cleaned.replace(/\b(el\s+)?\d{1,2}\/\d{1,2}\b/gi, '');

  // Remove relative time patterns ("en 5 minutos", "dentro de 30 minutos", "en una hora", etc.)
  cleaned = cleaned.replace(/(?:dentro\s+de|en)\s+\d+\s+(minutos?|horas?)\b/gi, '');
  cleaned = cleaned.replace(/(?:dentro\s+de|en)\s+media\s+hora\b/gi, '');
  cleaned = cleaned.replace(/(?:dentro\s+de|en)\s+una\s+hora\b/gi, '');

  // Remove time patterns
  cleaned = cleaned.replace(/a\s+las?\s+\d{1,2}(:\d{2})?\s*(am|pm)?/gi, '');
  cleaned = cleaned.replace(/\d{1,2}\s+de\s+la\s+(ma[nñ]ana|tarde|noche)/gi, '');
  cleaned = cleaned.replace(/en\s+la\s+(ma[nñ]ana|tarde|noche)/gi, '');
  cleaned = cleaned.replace(/\b\d{1,2}\s*(am|pm)\b/gi, '');
  cleaned = cleaned.replace(/\b\d{1,2}:\d{2}\b/g, '');

  // Remove connecting words at the start
  cleaned = cleaned.replace(/^\s*(que|de\s+que|para|de)\s+/i, '');
  // Remove trailing connecting words
  cleaned = cleaned.replace(/\s+(que|de\s+que|para|de|el|la)\s*$/i, '');

  // Clean up punctuation and whitespace
  cleaned = cleaned.replace(/^[,\.\s?¿!¡]+/, ''); // leading punctuation
  cleaned = cleaned.replace(/[,\.\s?¿!¡]+$/, ''); // trailing punctuation
  cleaned = cleaned.replace(/\s*,\s*,/g, ','); // double commas
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove leading/trailing connecting words again after cleanup
  cleaned = cleaned.replace(/^\s*(que|de\s+que|para|de)\s+/i, '');
  cleaned = cleaned.replace(/\s+(que|de\s+que|para|de|el|la)\s*$/i, '');
  cleaned = cleaned.replace(/^[,\.\s?¿!¡]+/, ''); // leading punctuation again
  cleaned = cleaned.replace(/[,\.\s?¿!¡]+$/, ''); // trailing punctuation again
  cleaned = cleaned.trim();

  return cleaned || null;
}

function parseMessage(text) {
  const result = {
    intent: 'unknown',
    task: null,
    dueDate: null,
    dueTime: null,
    reminderBefore: 0,
    taskId: null,
  };

  if (!text || typeof text !== 'string') return result;

  const trimmed = text.trim();
  result.intent = detectIntent(trimmed);

  if (result.intent === 'complete' || result.intent === 'delete') {
    result.taskId = extractTaskId(trimmed);
    return result;
  }

  if (result.intent === 'list' || result.intent === 'help') {
    return result;
  }

  if (result.intent === 'create' || result.intent === 'unknown') {
    // Check for relative time first ("en 5 minutos", "en una hora")
    const relative = parseRelativeTime(trimmed);

    result.dueDate = parseDate(trimmed);
    result.dueTime = parseTime(trimmed);
    result.reminderBefore = parseReminderBefore(trimmed);
    result.task = extractTaskDescription(trimmed, result.intent);

    // If relative time was found and no explicit date/time, use the relative values
    if (relative && !result.dueDate && !result.dueTime) {
      result.dueDate = relative.date;
      result.dueTime = relative.time;
    }

    // Si hay hora pero no fecha, asignar hoy o mañana segun si la hora ya paso
    if (result.dueTime && !result.dueDate) {
      const now = new Date();
      const [h, m] = result.dueTime.split(':').map(Number);
      const reminderMinutes = result.reminderBefore || 0;
      const dueToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      const reminderTime = new Date(dueToday.getTime() - reminderMinutes * 60000);

      if (reminderTime > now) {
        // La hora del recordatorio aun no pasa → hoy
        result.dueDate = formatDate(now);
      } else {
        // Ya paso → mañana
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        result.dueDate = formatDate(tomorrow);
      }
    }
  }

  return result;
}

module.exports = { parseMessage };
