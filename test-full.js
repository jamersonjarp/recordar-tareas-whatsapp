/**
 * test-full.js — Comprehensive end-to-end test suite
 *
 * Usage:
 *   node test-full.js           — run ALL tests
 *   node test-full.js parser    — only parser tests
 *   node test-full.js api       — only API tests
 *   node test-full.js reminders — only reminder tests
 *   node test-full.js stress    — stress test
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

// ─── Colors & formatting ────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let totalPassed = 0;
let totalFailed = 0;
const bugs = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr() {
  return formatDateStr(new Date());
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateStr(d);
}

function dayAfterTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return formatDateStr(d);
}

function getNextWeekdayStr(dayIndex) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay();
  let diff = dayIndex - currentDay;
  if (diff <= 0) diff += 7;
  const result = new Date(today);
  result.setDate(result.getDate() + diff);
  return formatDateStr(result);
}

function header(title) {
  console.log(`\n${BOLD}═══ ${title} ═══${RESET}\n`);
}

function subheader(title) {
  console.log(`\n${BOLD}── ${title} ──${RESET}\n`);
}

// ─── Test runner for parser ─────────────────────────────────────────────────

function testParse(parseMessage, input, expected, description) {
  const result = parseMessage(input);
  const errors = [];

  for (const [key, val] of Object.entries(expected)) {
    if (val === '__EXISTS__') {
      if (result[key] === null || result[key] === undefined || result[key] === '') {
        errors.push(`  ${key}: expected to exist, got "${result[key]}"`);
      }
    } else if (val === '__NOT_NULL__') {
      if (result[key] === null || result[key] === undefined) {
        errors.push(`  ${key}: expected not null, got "${result[key]}"`);
      }
    } else if (val === '__ANY_DATE__') {
      if (!result[key] || !/^\d{4}-\d{2}-\d{2}$/.test(result[key])) {
        errors.push(`  ${key}: expected a valid date, got "${result[key]}"`);
      }
    } else if (result[key] !== val) {
      errors.push(`  ${key}: expected "${val}" -> got "${result[key]}"`);
    }
  }

  const label = description ? `${description} | "${input}"` : `"${input}"`;

  if (errors.length === 0) {
    console.log(`${GREEN}  ✅ ${label}${RESET}`);
    totalPassed++;
  } else {
    console.log(`${RED}  ❌ ${label}${RESET}`);
    errors.forEach(e => console.log(`${RED}${e}${RESET}`));
    totalFailed++;
    bugs.push({ category: 'parser', input, expected, actual: result, errors });
  }
}

// ─── Test runner for generic assertions ─────────────────────────────────────

function assert(condition, label, detail) {
  if (condition) {
    console.log(`${GREEN}  ✅ ${label}${RESET}`);
    totalPassed++;
  } else {
    const msg = detail || '';
    console.log(`${RED}  ❌ ${label}${RESET}`);
    if (msg) console.log(`${RED}     ${msg}${RESET}`);
    totalFailed++;
    bugs.push({ category: 'assertion', label, detail: msg });
  }
}

// ─── HTTP helper for API tests ──────────────────────────────────────────────

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function runParserTests() {
  const { parseMessage } = require('./src/bot/parser');
  const t = (input, expected, desc) => testParse(parseMessage, input, expected, desc);

  header('PARSER TESTS');

  // ── Intent detection: create ──────────────────────────────────────────────

  subheader('Intent: crear tarea');

  t('Recuérdame que mañana tengo reunión a las 9', { intent: 'create' }, 'recuérdame');
  t('recuerdame comprar leche', { intent: 'create' }, 'recuerdame sin acento');
  t('nueva tarea ir al gym', { intent: 'create' }, 'nueva tarea');
  t('crear tarea estudiar', { intent: 'create' }, 'crear');
  t('agendar cita con el doctor', { intent: 'create' }, 'agendar');
  t('programar reunión', { intent: 'create' }, 'programar');
  t('tengo que entregar el reporte', { intent: 'create' }, 'tengo');
  t('debo pagar la luz', { intent: 'create' }, 'debo');
  t('necesito llamar a mamá', { intent: 'create' }, 'necesito');
  t('agregar tarea comprar pan', { intent: 'create' }, 'agregar');
  t('añadir comprar fruta', { intent: 'create' }, 'añadir');
  t('recordar pagar factura', { intent: 'create' }, 'recordar');

  // ── Intent detection: list ────────────────────────────────────────────────

  subheader('Intent: listar');

  t('listar', { intent: 'list' }, 'listar');
  t('lista', { intent: 'list' }, 'lista');
  t('mis tareas', { intent: 'list' }, 'mis tareas');
  t('qué tengo pendiente', { intent: 'list' }, 'qué tengo');
  t('que tengo', { intent: 'list' }, 'que tengo sin acento');
  t('pendientes', { intent: 'list' }, 'pendientes');
  t('mostrar tareas', { intent: 'list' }, 'mostrar');

  // ── Intent detection: complete ────────────────────────────────────────────

  subheader('Intent: completar');

  t('completar 3', { intent: 'complete', taskId: 3 }, 'completar');
  t('completada 2', { intent: 'complete', taskId: 2 }, 'completada');
  t('hecho 1', { intent: 'complete', taskId: 1 }, 'hecho');
  t('listo 7', { intent: 'complete', taskId: 7 }, 'listo');
  t('done 5', { intent: 'complete', taskId: 5 }, 'done');
  t('ya terminé la 4', { intent: 'complete', taskId: 4 }, 'ya terminé la');
  t('ya termine la 6', { intent: 'complete', taskId: 6 }, 'ya termine sin acento');
  t('ya hice la 8', { intent: 'complete', taskId: 8 }, 'ya hice');
  t('ya lo hice 9', { intent: 'complete', taskId: 9 }, 'ya lo hice');
  t('terminar 10', { intent: 'complete', taskId: 10 }, 'terminar');

  // ── Intent detection: delete ──────────────────────────────────────────────

  subheader('Intent: eliminar');

  t('eliminar 3', { intent: 'delete', taskId: 3 }, 'eliminar');
  t('borrar tarea 2', { intent: 'delete', taskId: 2 }, 'borrar');
  t('quitar 5', { intent: 'delete', taskId: 5 }, 'quitar');
  t('cancelar 4', { intent: 'delete', taskId: 4 }, 'cancelar');

  // ── Intent detection: help ────────────────────────────────────────────────

  subheader('Intent: ayuda');

  t('ayuda', { intent: 'help' }, 'ayuda');
  t('help', { intent: 'help' }, 'help');
  t('comandos', { intent: 'help' }, 'comandos');
  t('que puedes hacer', { intent: 'help' }, 'que puedes hacer');
  t('qué puedes hacer', { intent: 'help' }, 'qué puedes hacer');

  // ── Intent detection: unknown ─────────────────────────────────────────────

  subheader('Intent: unknown');

  t('hola', { intent: 'unknown' }, 'hola');
  t('jajaja', { intent: 'unknown' }, 'jajaja');
  t('buen día', { intent: 'unknown' }, 'buen dia');

  // ── Date parsing ──────────────────────────────────────────────────────────

  subheader('Date parsing');

  t('recuérdame ir al doctor hoy', { intent: 'create', dueDate: todayStr() }, 'hoy');
  t('recuérdame ir al doctor mañana', { intent: 'create', dueDate: tomorrowStr() }, 'mañana');
  t('recuérdame ir al doctor pasado mañana', { intent: 'create', dueDate: dayAfterTomorrowStr() }, 'pasado mañana');
  t('recuérdame ir al doctor el lunes', { intent: 'create', dueDate: getNextWeekdayStr(1) }, 'el lunes');
  t('recuérdame ir al doctor el martes', { intent: 'create', dueDate: getNextWeekdayStr(2) }, 'el martes');
  t('recuérdame ir al doctor el miércoles', { intent: 'create', dueDate: getNextWeekdayStr(3) }, 'el miércoles');
  t('recuérdame ir al doctor el jueves', { intent: 'create', dueDate: getNextWeekdayStr(4) }, 'el jueves');
  t('recuérdame ir al doctor el viernes', { intent: 'create', dueDate: getNextWeekdayStr(5) }, 'el viernes');
  t('recuérdame ir al doctor el sábado', { intent: 'create', dueDate: getNextWeekdayStr(6) }, 'el sábado');
  t('recuérdame ir al doctor el domingo', { intent: 'create', dueDate: getNextWeekdayStr(0) }, 'el domingo');

  // DD/MM format
  const now = new Date();
  const futureDay = 25;
  const futureMonth = now.getMonth() + 2; // next month (1-indexed for display)
  const expectedYear = futureMonth > 12 ? now.getFullYear() + 1 : now.getFullYear();
  const actualMonth = futureMonth > 12 ? futureMonth - 12 : futureMonth;
  const ddmmInput = `recuérdame ir al doctor ${futureDay}/${pad(actualMonth)}`;
  const ddmmExpected = `${expectedYear}-${pad(actualMonth)}-${pad(futureDay)}`;
  t(ddmmInput, { intent: 'create', dueDate: ddmmExpected }, 'DD/MM format (future)');

  // ── Time parsing ──────────────────────────────────────────────────────────

  subheader('Time parsing');

  t('recuérdame algo hoy a las 9', { dueTime: '09:00' }, 'a las 9');
  t('recuérdame algo hoy a las 3pm', { dueTime: '15:00' }, 'a las 3pm');
  t('recuérdame algo hoy a las 9am', { dueTime: '09:00' }, 'a las 9am');
  t('recuérdame algo hoy a las 12pm', { dueTime: '12:00' }, 'a las 12pm');
  t('recuérdame algo hoy a las 12am', { dueTime: '00:00' }, 'a las 12am');
  t('recuérdame algo hoy a las 3:30', { dueTime: '03:30' }, 'a las 3:30');
  t('recuérdame algo hoy a las 14:45', { dueTime: '14:45' }, 'a las 14:45');
  t('recuérdame algo hoy 9 de la mañana', { dueTime: '09:00' }, '9 de la mañana');
  t('recuérdame algo hoy 3 de la tarde', { dueTime: '15:00' }, '3 de la tarde');
  t('recuérdame algo hoy 9 de la noche', { dueTime: '21:00' }, '9 de la noche');
  t('recuérdame algo hoy en la mañana', { dueTime: '09:00' }, 'en la mañana');
  t('recuérdame algo hoy en la tarde', { dueTime: '14:00' }, 'en la tarde');
  t('recuérdame algo hoy en la noche', { dueTime: '20:00' }, 'en la noche');

  // Standalone times without "a las"
  t('reunion 2pm', { dueTime: '14:00' }, 'standalone 2pm');
  t('reunion 3am', { dueTime: '03:00' }, 'standalone 3am');
  t('reunion 14:00', { dueTime: '14:00' }, 'standalone 14:00');
  t('reunion 9:30', { dueTime: '09:30' }, 'standalone 9:30');

  // ── Auto-date assignment (time without date) ──────────────────────────────

  subheader('Auto-date assignment (time without date)');

  // When a time is given without a date, should get today or tomorrow
  t('recuérdame algo a las 23:59', { dueDate: '__ANY_DATE__' }, 'auto-date for time only');

  // ── Reminder before ───────────────────────────────────────────────────────

  subheader('Reminder before');

  t('recuérdame reunión mañana a las 9 avisame 2 horas antes', { reminderBefore: 120 }, '2 horas antes');
  t('recuérdame reunión mañana a las 9 avisame 1 hora antes', { reminderBefore: 60 }, '1 hora antes');
  t('recuérdame reunión mañana a las 9 avisame 30 minutos antes', { reminderBefore: 30 }, '30 minutos antes');
  t('recuérdame reunión mañana a las 9 avisame 15 minutos antes', { reminderBefore: 15 }, '15 minutos antes');
  t('recuérdame reunión mañana a las 9 avisame media hora antes', { reminderBefore: 30 }, 'media hora antes');
  t('recuérdame reunión mañana a las 9 avisame un dia antes', { reminderBefore: 1440 }, 'un dia antes');
  t('recuérdame reunión mañana a las 9 avisame un día antes', { reminderBefore: 1440 }, 'un día antes');
  t('recuérdame reunión mañana a las 9', { reminderBefore: 0 }, 'no reminder');

  // ── Task description extraction ───────────────────────────────────────────

  subheader('Task description extraction');

  t('recuérdame comprar leche mañana a las 9', {
    intent: 'create',
    task: 'comprar leche',
  }, 'description clean: no date/time fragments');

  t('necesito ir al dentista el viernes a las 3pm', {
    intent: 'create',
    task: '__EXISTS__',
  }, 'description exists for necesito');

  t('debo estudiar para el examen hoy en la tarde', {
    intent: 'create',
    task: '__EXISTS__',
  }, 'description exists for debo');

  t('agendar cita con el doctor el viernes a las 3pm avisame media hora antes', {
    intent: 'create',
    task: '__EXISTS__',
  }, 'description exists with reminder');

  // ── Edge cases ────────────────────────────────────────────────────────────

  subheader('Edge cases');

  t('', { intent: 'unknown' }, 'empty string');
  t('   ', { intent: 'unknown' }, 'whitespace only');
  t('12345', { intent: 'unknown' }, 'numbers only');

  // null/undefined
  {
    const result = parseMessage(null);
    assert(result.intent === 'unknown', 'null input returns unknown intent');
  }
  {
    const result = parseMessage(undefined);
    assert(result.intent === 'unknown', 'undefined input returns unknown intent');
  }
  {
    const result = parseMessage(123);
    assert(result.intent === 'unknown', 'numeric input returns unknown intent');
  }

  t('recuérdame 😀🎉 mañana a las 10', { intent: 'create', dueTime: '10:00' }, 'emojis in message');

  const longMsg = 'recuérdame ' + 'hacer algo importante '.repeat(50) + 'mañana a las 10';
  t(longMsg, { intent: 'create', dueTime: '10:00', dueDate: tomorrowStr() }, 'very long message');

  t('RECUÉRDAME COMPRAR LECHE MAÑANA', { intent: 'create', dueDate: tomorrowStr() }, 'ALL CAPS');

  t('recuérdame... comprar leche, mañana!', { intent: 'create', dueDate: tomorrowStr() }, 'punctuation');

  // Priority: "recuérdame" should be create even with "tengo"
  t('recuérdame que tengo reunión', { intent: 'create' }, 'recuérdame overrides tengo');

  // Priority: "qué tengo" should be list, not create
  t('qué tengo pendiente', { intent: 'list' }, 'qué tengo is list not create');
}

// ═══════════════════════════════════════════════════════════════════════════════
// API TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runApiTests() {
  header('API TESTS');

  // ── Setup: create a separate test database ────────────────────────────────

  const testDataDir = path.join(__dirname, 'test-data');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  const testDbPath = path.join(testDataDir, 'test.db');

  // Clean up any existing test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  // Also remove WAL/SHM files
  if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
  if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');

  // Create a test database directly
  const Database = require('better-sqlite3');
  const testDb = new Database(testDbPath);
  testDb.pragma('journal_mode = WAL');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      task TEXT NOT NULL,
      due_date TEXT,
      due_time TEXT,
      completed INTEGER DEFAULT 0,
      reminded INTEGER DEFAULT 0,
      reminder_before INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Prepare statements for the test DB
  const stmtInsert = testDb.prepare('INSERT INTO tasks (phone, task, due_date, due_time, reminder_before) VALUES (?, ?, ?, ?, ?)');
  const stmtById = testDb.prepare('SELECT * FROM tasks WHERE id = ?');
  const stmtAll = testDb.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
  const stmtComplete = testDb.prepare('UPDATE tasks SET completed = 1 WHERE id = ?');
  const stmtDelete = testDb.prepare('DELETE FROM tasks WHERE id = ?');
  const stmtUpcoming = testDb.prepare('SELECT * FROM tasks WHERE phone = ? AND completed = 0 ORDER BY due_date ASC, due_time ASC');
  const stmtPending = testDb.prepare(`
    SELECT * FROM tasks
    WHERE completed = 0
      AND reminded = 0
      AND due_date IS NOT NULL
      AND due_time IS NOT NULL
      AND datetime(due_date || ' ' || due_time, '-' || reminder_before || ' minutes') <= datetime('now', 'localtime')
  `);
  const stmtReminded = testDb.prepare('UPDATE tasks SET reminded = 1 WHERE id = ?');

  // Build an express app that uses our test database
  const express = require('express');
  const { parseMessage } = require('./src/bot/parser');
  const app = express();
  app.use(express.json());

  // Re-implement routes using test DB (same logic as routes.js but with test db)
  app.get('/api/tasks', (req, res) => {
    try {
      const tasks = stmtAll.all();
      res.json({ ok: true, tasks });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/tasks', (req, res) => {
    try {
      const { phone, task, dueDate, dueTime, reminderBefore } = req.body;
      if (!phone || !task) {
        return res.status(400).json({ ok: false, error: 'phone and task are required' });
      }
      const result = stmtInsert.run(phone, task, dueDate || null, dueTime || null, reminderBefore || 0);
      const created = stmtById.get(result.lastInsertRowid);
      res.status(201).json({ ok: true, task: created });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/api/tasks/:id/complete', (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = stmtComplete.run(id);
      if (result.changes === 0) return res.status(404).json({ ok: false, error: 'Task not found' });
      res.json({ ok: true, task: stmtById.get(id) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/tasks/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const task = stmtById.get(id);
      if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
      stmtDelete.run(id);
      res.json({ ok: true, task });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Simulate endpoint
  app.post('/api/simulate', (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ ok: false, error: 'message (string) is required' });
      }
      const parsed = parseMessage(message.trim());
      const phone = 'simulador';
      let response = '';

      if (parsed.intent === 'create') {
        if (!parsed.task) {
          response = 'No entendí la tarea.';
        } else {
          const result = stmtInsert.run(phone, parsed.task, parsed.dueDate, parsed.dueTime, parsed.reminderBefore);
          const task = stmtById.get(result.lastInsertRowid);
          response = `Tarea creada (ID: ${task.id})`;
        }
      } else if (parsed.intent === 'list') {
        const tasks = stmtUpcoming.all(phone);
        response = tasks.length === 0 ? 'No tienes tareas pendientes.' : `Tienes ${tasks.length} tarea(s).`;
      } else if (parsed.intent === 'complete') {
        if (!parsed.taskId) {
          response = 'Indica el ID de la tarea.';
        } else {
          const r = stmtComplete.run(parsed.taskId);
          response = r.changes > 0 ? `Tarea #${parsed.taskId} completada.` : `No encontré la tarea #${parsed.taskId}.`;
        }
      } else if (parsed.intent === 'delete') {
        if (!parsed.taskId) {
          response = 'Indica el ID de la tarea.';
        } else {
          const task = stmtById.get(parsed.taskId);
          if (task) {
            stmtDelete.run(parsed.taskId);
            response = `Tarea #${parsed.taskId} eliminada.`;
          } else {
            response = `No encontré la tarea #${parsed.taskId}.`;
          }
        }
      } else if (parsed.intent === 'help') {
        response = 'Soy tu asistente de tareas.';
      } else if (parsed.intent === 'unknown' && parsed.task && parsed.dueDate) {
        const result = stmtInsert.run(phone, parsed.task, parsed.dueDate, parsed.dueTime, parsed.reminderBefore);
        const task = stmtById.get(result.lastInsertRowid);
        response = `Tarea creada (ID: ${task.id})`;
      } else {
        response = 'No entendí.';
      }

      return res.json({ ok: true, response, parsed });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Reminders endpoint
  app.get('/api/simulate/reminders', (req, res) => {
    try {
      const pending = stmtPending.all().filter(t => t.phone === 'simulador');
      const reminders = [];
      for (const task of pending) {
        stmtReminded.run(task.id);
        reminders.push({ id: task.id, task: task.task });
      }
      res.json({ ok: true, reminders });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Start server on random port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  console.log(`${DIM}  Test server running on port ${port}${RESET}`);

  const r = (method, p, body) => request(port, method, p, body);

  try {
    // ── POST /api/simulate ──────────────────────────────────────────────────

    subheader('POST /api/simulate');

    {
      const res = await r('POST', '/api/simulate', { message: 'recuérdame comprar leche mañana a las 9' });
      assert(res.status === 200 && res.body.ok === true, 'simulate create returns ok');
      assert(typeof res.body.response === 'string' && res.body.response.length > 0, 'simulate create has response string');
      assert(res.body.parsed && res.body.parsed.intent === 'create', 'simulate create parsed intent is create');
    }

    {
      const res = await r('POST', '/api/simulate', { message: 'listar' });
      assert(res.status === 200 && res.body.ok === true, 'simulate list returns ok');
      assert(typeof res.body.response === 'string', 'simulate list has response');
    }

    {
      const res = await r('POST', '/api/simulate', { message: 'ayuda' });
      assert(res.status === 200 && res.body.parsed.intent === 'help', 'simulate help works');
    }

    {
      const res = await r('POST', '/api/simulate', { message: 'hola mundo' });
      assert(res.status === 200 && res.body.parsed.intent === 'unknown', 'simulate unknown works');
    }

    // Missing message field
    {
      const res = await r('POST', '/api/simulate', {});
      assert(res.status === 400, 'simulate missing message returns 400');
    }

    {
      const res = await r('POST', '/api/simulate', { message: 123 });
      assert(res.status === 400, 'simulate non-string message returns 400');
    }

    // ── POST /api/tasks — create ────────────────────────────────────────────

    subheader('POST /api/tasks (create)');

    let createdId;
    {
      const res = await r('POST', '/api/tasks', {
        phone: 'test-phone',
        task: 'Test task 1',
        dueDate: tomorrowStr(),
        dueTime: '10:00',
        reminderBefore: 30,
      });
      assert(res.status === 201, 'create task returns 201');
      assert(res.body.ok === true, 'create task ok is true');
      assert(res.body.task && res.body.task.id, 'create task returns id');
      assert(res.body.task.task === 'Test task 1', 'create task has correct task name');
      assert(res.body.task.phone === 'test-phone', 'create task has correct phone');
      assert(res.body.task.due_date === tomorrowStr(), 'create task has correct due_date');
      assert(res.body.task.due_time === '10:00', 'create task has correct due_time');
      assert(res.body.task.reminder_before === 30, 'create task has correct reminder_before');
      createdId = res.body.task.id;
    }

    // Missing required fields
    {
      const res = await r('POST', '/api/tasks', { phone: 'test-phone' });
      assert(res.status === 400, 'create task without task field returns 400');
    }
    {
      const res = await r('POST', '/api/tasks', { task: 'No phone' });
      assert(res.status === 400, 'create task without phone field returns 400');
    }
    {
      const res = await r('POST', '/api/tasks', {});
      assert(res.status === 400, 'create task with empty body returns 400');
    }

    // Create another task for listing
    let secondId;
    {
      const res = await r('POST', '/api/tasks', {
        phone: 'test-phone',
        task: 'Test task 2',
      });
      secondId = res.body.task.id;
    }

    // ── GET /api/tasks — list all ───────────────────────────────────────────

    subheader('GET /api/tasks (list all)');

    {
      const res = await r('GET', '/api/tasks');
      assert(res.status === 200, 'list tasks returns 200');
      assert(res.body.ok === true, 'list tasks ok is true');
      assert(Array.isArray(res.body.tasks), 'list tasks returns array');
      // Should have at least the tasks we created (plus any from simulate)
      assert(res.body.tasks.length >= 2, `list tasks has at least 2 tasks (got ${res.body.tasks.length})`);
    }

    // ── PUT /api/tasks/:id/complete ─────────────────────────────────────────

    subheader('PUT /api/tasks/:id/complete');

    {
      const res = await r('PUT', `/api/tasks/${createdId}/complete`);
      assert(res.status === 200, 'complete task returns 200');
      assert(res.body.ok === true, 'complete task ok is true');
      assert(res.body.task.completed === 1, 'complete task sets completed=1');
    }

    // Complete non-existent task
    {
      const res = await r('PUT', '/api/tasks/99999/complete');
      assert(res.status === 404, 'complete non-existent task returns 404');
    }

    // ── DELETE /api/tasks/:id ───────────────────────────────────────────────

    subheader('DELETE /api/tasks/:id');

    {
      const res = await r('DELETE', `/api/tasks/${secondId}`);
      assert(res.status === 200, 'delete task returns 200');
      assert(res.body.ok === true, 'delete task ok is true');
      assert(res.body.task.id === secondId, 'delete returns correct task');
    }

    // Delete non-existent task
    {
      const res = await r('DELETE', '/api/tasks/99999');
      assert(res.status === 404, 'delete non-existent task returns 404');
    }

    // Verify it is actually deleted
    {
      const res = await r('DELETE', `/api/tasks/${secondId}`);
      assert(res.status === 404, 'delete already-deleted task returns 404');
    }

    // ── GET /api/simulate/reminders ─────────────────────────────────────────

    subheader('GET /api/simulate/reminders');

    {
      const res = await r('GET', '/api/simulate/reminders');
      assert(res.status === 200, 'reminders endpoint returns 200');
      assert(res.body.ok === true, 'reminders ok is true');
      assert(Array.isArray(res.body.reminders), 'reminders returns array');
    }

  } finally {
    // Cleanup
    server.close();
    testDb.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (_) {}
    console.log(`${DIM}  Test server stopped, test DB cleaned up${RESET}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REMINDER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function runReminderTests() {
  header('REMINDER TESTS');

  const testDataDir = path.join(__dirname, 'test-data');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  const testDbPath = path.join(testDataDir, 'test-reminders.db');

  // Clean up
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
  if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');

  const Database = require('better-sqlite3');
  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      task TEXT NOT NULL,
      due_date TEXT,
      due_time TEXT,
      completed INTEGER DEFAULT 0,
      reminded INTEGER DEFAULT 0,
      reminder_before INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  const insert = db.prepare('INSERT INTO tasks (phone, task, due_date, due_time, reminder_before) VALUES (?, ?, ?, ?, ?)');
  const byId = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const pending = db.prepare(`
    SELECT * FROM tasks
    WHERE completed = 0
      AND reminded = 0
      AND due_date IS NOT NULL
      AND due_time IS NOT NULL
      AND datetime(due_date || ' ' || due_time, '-' || reminder_before || ' minutes') <= datetime('now', 'localtime')
  `);
  const markReminded = db.prepare('UPDATE tasks SET reminded = 1 WHERE id = ?');
  const markComplete = db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?');

  try {
    // ── Task with due_date in the past ──────────────────────────────────────

    subheader('Past due date -> appears in pending');

    {
      const pastDate = '2020-01-01';
      const pastTime = '10:00';
      const result = insert.run('test', 'Past task', pastDate, pastTime, 0);
      const id = result.lastInsertRowid;
      const pendingList = pending.all();
      const found = pendingList.some(t => t.id === id);
      assert(found, 'Task with past due_date appears in pending reminders');
    }

    // ── Task with due_date in the far future ────────────────────────────────

    subheader('Future due date -> NOT in pending');

    {
      const futureDate = '2099-12-31';
      const futureTime = '23:59';
      const result = insert.run('test', 'Future task', futureDate, futureTime, 0);
      const id = result.lastInsertRowid;
      const pendingList = pending.all();
      const found = pendingList.some(t => t.id === id);
      assert(!found, 'Task with far future due_date does NOT appear in pending reminders');
    }

    // ── Task with reminder_before, due soon ─────────────────────────────────

    subheader('reminder_before=60, due in 30 min -> IS in pending');

    {
      const now = new Date();
      const dueIn30 = new Date(now.getTime() + 30 * 60000);
      const dueDate = formatDateStr(dueIn30);
      const dueTime = `${pad(dueIn30.getHours())}:${pad(dueIn30.getMinutes())}`;
      // reminder_before=60 means "notify 60 min before due"
      // Due in 30 min, reminder was 60 min before = 30 min ago -> should be in pending
      const result = insert.run('test', 'Reminder before task', dueDate, dueTime, 60);
      const id = result.lastInsertRowid;
      const pendingList = pending.all();
      const found = pendingList.some(t => t.id === id);
      assert(found, 'Task with reminder_before=60 and due in 30 min IS in pending (60min-before already passed)');
    }

    // ── Task with reminder_before, due far in future ────────────────────────

    subheader('reminder_before=60, due in 5 hours -> NOT in pending');

    {
      const now = new Date();
      const dueIn5h = new Date(now.getTime() + 5 * 3600000);
      const dueDate = formatDateStr(dueIn5h);
      const dueTime = `${pad(dueIn5h.getHours())}:${pad(dueIn5h.getMinutes())}`;
      const result = insert.run('test', 'Future reminder task', dueDate, dueTime, 60);
      const id = result.lastInsertRowid;
      const pendingList = pending.all();
      const found = pendingList.some(t => t.id === id);
      assert(!found, 'Task with reminder_before=60 and due in 5 hours NOT in pending');
    }

    // ── Mark reminded -> no longer in pending ───────────────────────────────

    subheader('Mark reminded -> disappears from pending');

    {
      const result = insert.run('test', 'Will be reminded', '2020-06-15', '10:00', 0);
      const id = result.lastInsertRowid;

      // Should be pending first
      let pendingList = pending.all();
      let found = pendingList.some(t => t.id === id);
      assert(found, 'Task appears in pending before markReminded');

      markReminded.run(id);

      pendingList = pending.all();
      found = pendingList.some(t => t.id === id);
      assert(!found, 'Task no longer in pending after markReminded');
    }

    // ── Complete task -> no longer in pending ───────────────────────────────

    subheader('Complete task -> disappears from pending');

    {
      const result = insert.run('test', 'Will be completed', '2020-06-15', '10:00', 0);
      const id = result.lastInsertRowid;

      let pendingList = pending.all();
      let found = pendingList.some(t => t.id === id);
      assert(found, 'Task appears in pending before completion');

      markComplete.run(id);

      pendingList = pending.all();
      found = pendingList.some(t => t.id === id);
      assert(!found, 'Completed task no longer in pending reminders');
    }

    // ── Task without date/time -> NOT in pending ────────────────────────────

    subheader('Task without date/time -> NOT in pending');

    {
      const result = insert.run('test', 'No date task', null, null, 0);
      const id = result.lastInsertRowid;
      const pendingList = pending.all();
      const found = pendingList.some(t => t.id === id);
      assert(!found, 'Task without due_date/due_time is NOT in pending');
    }

    {
      const result = insert.run('test', 'Date but no time', '2020-01-01', null, 0);
      const id = result.lastInsertRowid;
      const pendingList = pending.all();
      const found = pendingList.some(t => t.id === id);
      assert(!found, 'Task with date but no time is NOT in pending');
    }

  } finally {
    db.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (_) {}
    console.log(`${DIM}  Reminder test DB cleaned up${RESET}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRESS TEST
// ═══════════════════════════════════════════════════════════════════════════════

function runStressTest() {
  const { parseMessage } = require('./src/bot/parser');

  header('STRESS TEST');

  const messages = [
    'recuérdame comprar leche mañana a las 9',
    'necesito ir al doctor el viernes a las 3pm',
    'agendar reunión pasado mañana a las 10',
    'tengo que entregar el reporte el 15/04',
    'debo pagar la luz hoy en la tarde',
    'programar cita con el dentista el lunes',
    'agregar tarea: limpiar la casa',
    'listar',
    'mis tareas',
    'qué tengo pendiente',
    'completar 1',
    'ya terminé la 3',
    'eliminar 5',
    'borrar tarea 2',
    'ayuda',
    'help',
    'hola',
    '',
    '12345',
    'recuérdame algo 2pm',
    'reunion mañana a las 6 de la tarde',
    'comprar pan el martes a las 9am avisame 30 minutos antes',
    'necesito estudiar hoy a las 8 de la noche media hora antes',
    'nueva tarea ir al gym a las 7am',
    'recordar pagar factura el viernes a las 12pm',
    'debo llamar al banco mañana en la mañana',
    'crear tarea comprar regalo pasado mañana a las 5pm',
    'agendar presentación el jueves a las 14:00',
    'tengo examen el lunes a las 8 avisame un dia antes',
    'recuérdame sacar al perro hoy a las 7',
    'necesito comprar medicinas el sabado a las 10',
    'agregar: ir al super mañana',
    'programar limpieza el domingo en la mañana',
    'debo llevar el carro al taller el miércoles a las 9:30',
    'recuérdame llamar a mamá el viernes a las 6 de la tarde',
    'tengo junta con el jefe hoy a las 11am',
    'nueva tarea: recoger paquete mañana 2pm',
    'agendar cita médica el martes a las 4pm avisame 2 horas antes',
    'necesito preparar presentación pasado mañana',
    'recordar comprar flores el sábado en la tarde',
    'completar 10',
    'hecho 7',
    'listo 15',
    'done 3',
    'eliminar 8',
    'cancelar 12',
    'qué puedes hacer',
    'mostrar tareas',
    'pendientes',
    '😀🎉 recuérdame algo mañana',
    // Pad to 100 with variations
    ...Array.from({ length: 50 }, (_, i) =>
      `recuérdame tarea número ${i + 1} el ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes'][i % 5]} a las ${8 + (i % 12)}${i % 2 === 0 ? 'am' : 'pm'}`
    ),
  ];

  console.log(`  Sending ${messages.length} messages through parseMessage...`);

  const start = Date.now();
  let crashes = 0;
  let valid = 0;

  for (const msg of messages) {
    try {
      const result = parseMessage(msg);
      if (
        result &&
        typeof result === 'object' &&
        typeof result.intent === 'string' &&
        ['create', 'list', 'complete', 'delete', 'help', 'unknown'].includes(result.intent)
      ) {
        valid++;
      } else {
        crashes++;
        console.log(`${RED}  ❌ Invalid result for: "${msg}"${RESET}`);
        bugs.push({ category: 'stress', input: msg, detail: 'Invalid result object' });
      }
    } catch (err) {
      crashes++;
      console.log(`${RED}  ❌ CRASH on: "${msg}" -> ${err.message}${RESET}`);
      bugs.push({ category: 'stress', input: msg, detail: `Crash: ${err.message}` });
    }
  }

  const elapsed = Date.now() - start;
  const msPerMsg = (elapsed / messages.length).toFixed(2);

  console.log('');
  assert(crashes === 0, `No crashes (${valid}/${messages.length} valid results)`);
  console.log(`${DIM}  Performance: ${messages.length} messages in ${elapsed}ms (${msPerMsg}ms/msg)${RESET}`);

  totalPassed += valid > 0 ? 1 : 0;
  if (crashes > 0) totalFailed++;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const filter = process.argv[2] || 'all';

  console.log(`\n${BOLD}╔══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║   TEST SUITE COMPLETO — recordar tareas whatsapp ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}  Filter: ${filter}${RESET}`);

  if (filter === 'all' || filter === 'parser') {
    runParserTests();
  }

  if (filter === 'all' || filter === 'api') {
    await runApiTests();
  }

  if (filter === 'all' || filter === 'reminders') {
    runReminderTests();
  }

  if (filter === 'all' || filter === 'stress') {
    runStressTest();
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log(`\n${BOLD}╔══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║                    RESUMEN                       ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════╝${RESET}`);
  console.log(`${GREEN}  ✅ ${totalPassed} pasaron${RESET}`);
  if (totalFailed > 0) {
    console.log(`${RED}  ❌ ${totalFailed} fallaron${RESET}`);
  } else {
    console.log(`${GREEN}  Todos los tests pasaron!${RESET}`);
  }
  console.log(`  Total: ${totalPassed + totalFailed}`);

  // ── Bugs report ───────────────────────────────────────────────────────────

  if (bugs.length > 0) {
    console.log(`\n${BOLD}${RED}╔══════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}${RED}║              BUGS ENCONTRADOS                    ║${RESET}`);
    console.log(`${BOLD}${RED}╚══════════════════════════════════════════════════╝${RESET}\n`);

    bugs.forEach((bug, i) => {
      console.log(`${RED}  Bug #${i + 1} [${bug.category}]${RESET}`);
      if (bug.input !== undefined) {
        console.log(`    Input:    "${bug.input}"`);
      }
      if (bug.label) {
        console.log(`    Test:     ${bug.label}`);
      }
      if (bug.errors) {
        bug.errors.forEach(e => console.log(`    ${e.trim()}`));
      }
      if (bug.detail) {
        console.log(`    Detail:   ${bug.detail}`);
      }
      if (bug.expected) {
        console.log(`    Expected: ${JSON.stringify(bug.expected)}`);
      }
      if (bug.actual) {
        const relevant = {};
        if (bug.expected) {
          for (const key of Object.keys(bug.expected)) {
            relevant[key] = bug.actual[key];
          }
        }
        console.log(`    Actual:   ${JSON.stringify(relevant)}`);
      }
      console.log('');
    });
  }

  console.log('');
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  console.error(err.stack);
  process.exit(2);
});
