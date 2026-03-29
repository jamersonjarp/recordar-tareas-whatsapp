const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasks,
  getAllTasks,
  getTaskById,
  completeTask,
  updateTask,
  deleteTask,
  getUpcomingTasks,
  getPendingReminders,
  markReminded,
} = require('./database');
const { parseMessage } = require('../bot/parser');
const { getBotNumber } = require('../bot/whatsapp');

/**
 * Normalize a phone number to WhatsApp format: 57XXXXXXXXXX@c.us
 */
function normalizePhone(phone) {
  if (!phone) return phone;
  if (phone.includes('@')) return phone;
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10 && (digits.startsWith('3') || digits.startsWith('6'))) {
    digits = '57' + digits;
  }
  return digits + '@c.us';
}

// GET /api/bot-number
router.get('/bot-number', (req, res) => {
  const num = getBotNumber();
  res.json({ ok: true, number: num || null });
});

// GET /api/tasks
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await getAllTasks();
    res.json({ ok: true, tasks });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/tasks/:phone
router.get('/tasks/:phone', async (req, res) => {
  try {
    const tasks = await getTasks(req.params.phone);
    res.json({ ok: true, tasks });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/tasks
router.post('/tasks', async (req, res) => {
  try {
    const { phone, task, dueDate, dueTime, reminderBefore } = req.body;
    if (!phone || !task) {
      return res.status(400).json({ ok: false, error: 'phone and task are required' });
    }
    const normalizedPhone = normalizePhone(phone);
    const created = await createTask(normalizedPhone, task, dueDate || null, dueTime || null, reminderBefore || 0);
    res.status(201).json({ ok: true, task: created });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/tasks/:id
router.put('/tasks/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { task, phone, dueDate, dueTime, reminderBefore } = req.body;
    if (!task || !phone) {
      return res.status(400).json({ ok: false, error: 'task and phone are required' });
    }
    const normalizedPhone = normalizePhone(phone);
    const updated = await updateTask(id, task, normalizedPhone, dueDate || null, dueTime || null, reminderBefore || 0);
    if (!updated) return res.status(404).json({ ok: false, error: 'Task not found' });
    res.json({ ok: true, task: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/tasks/:id/complete
router.put('/tasks/:id/complete', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = await completeTask(id);
    if (!updated) return res.status(404).json({ ok: false, error: 'Task not found' });
    res.json({ ok: true, task: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteTask(id);
    if (!deleted) return res.status(404).json({ ok: false, error: 'Task not found' });
    res.json({ ok: true, task: deleted });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Simulate helpers
// ---------------------------------------------------------------------------

function fmtDate(dueDate, dueTime) {
  if (!dueDate) return 'Sin fecha';
  const [y, m, d] = dueDate.split('-');
  let str = `${d}/${m}/${y}`;
  if (dueTime) str += ` ${dueTime}`;
  return str;
}

function fmtReminderBefore(minutes) {
  if (!minutes || minutes === 0) return '';
  if (minutes >= 1440) return ` (aviso ${minutes / 1440} día(s) antes)`;
  if (minutes >= 60) return ` (aviso ${minutes / 60}h antes)`;
  return ` (aviso ${minutes}min antes)`;
}

// POST /api/simulate
router.post('/simulate', async (req, res) => {
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
        response = '⚠️ No entendí la tarea. Intenta algo como:\n_"Recuérdame que mañana tengo reunión a las 9"_';
      } else {
        const task = await createTask(phone, parsed.task, parsed.dueDate, parsed.dueTime, parsed.reminderBefore);
        response = `✅ Tarea creada (ID: ${task.id})\n📝 *${parsed.task}*`;
        if (parsed.dueDate) response += `\n📅 ${fmtDate(parsed.dueDate, parsed.dueTime)}`;
        if (parsed.reminderBefore > 0) response += `\n⏰ Te avisaré${fmtReminderBefore(parsed.reminderBefore)}`;
      }
    } else if (parsed.intent === 'list') {
      const tasks = await getUpcomingTasks(phone);
      if (tasks.length === 0) {
        response = '📋 No tienes tareas pendientes. ¡Disfruta tu tiempo libre! 🎉';
      } else {
        response = '📋 *Tus tareas pendientes:*\n\n';
        tasks.forEach((t) => {
          const date = t.due_date ? `📅 ${fmtDate(t.due_date, t.due_time)}` : '';
          const reminder = fmtReminderBefore(t.reminder_before);
          response += `*${t.id}.* ${t.task} ${date}${reminder}\n`;
        });
        response += '\n_Dime "completar [id]" o "eliminar [id]" para gestionarlas._';
      }
    } else if (parsed.intent === 'complete') {
      if (!parsed.taskId) {
        response = '⚠️ Indica el ID de la tarea.\nEjemplo: _"completar 3"_';
      } else {
        const success = await completeTask(parsed.taskId);
        response = success
          ? `✅ Tarea #${parsed.taskId} completada. ¡Buen trabajo! 💪`
          : `❌ No encontré la tarea #${parsed.taskId}.`;
      }
    } else if (parsed.intent === 'delete') {
      if (!parsed.taskId) {
        response = '⚠️ Indica el ID de la tarea.\nEjemplo: _"eliminar 3"_';
      } else {
        const success = await deleteTask(parsed.taskId);
        response = success
          ? `🗑️ Tarea #${parsed.taskId} eliminada.`
          : `❌ No encontré la tarea #${parsed.taskId}.`;
      }
    } else if (parsed.intent === 'help') {
      response = [
        '🤖 *Soy tu asistente de tareas*\n',
        'Puedes hablarme de forma natural o enviar audios:\n',
        '📝 *Crear tarea:*',
        '   _"Recuérdame que mañana tengo reunión a las 9"_\n',
        '📋 *Ver tareas:*  _"listar"_\n',
        '✅ *Completar:*  _"completar 3"_\n',
        '🗑️ *Eliminar:*  _"eliminar 3"_\n',
        '🎙️ *Audio:*  ¡También puedes enviar notas de voz!',
      ].join('\n');
    } else if (parsed.intent === 'unknown' && parsed.task && parsed.dueDate) {
      const task = await createTask(phone, parsed.task, parsed.dueDate, parsed.dueTime, parsed.reminderBefore);
      response = `✅ Tarea creada (ID: ${task.id})\n📝 *${parsed.task}*`;
      if (parsed.dueDate) response += `\n📅 ${fmtDate(parsed.dueDate, parsed.dueTime)}`;
      if (parsed.reminderBefore > 0) response += `\n⏰ Te avisaré${fmtReminderBefore(parsed.reminderBefore)}`;
    } else {
      response = '🤔 No entendí. Dime _"ayuda"_ para ver qué puedo hacer.';
    }

    return res.json({ ok: true, response, parsed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/simulate/reminders
router.get('/simulate/reminders', async (req, res) => {
  try {
    const pending = await getPendingReminders();
    const simPending = pending.filter(t => t.phone === 'simulador');
    const reminders = [];

    for (const task of simPending) {
      const msg =
        `⏰ *Recordatorio de tarea*\n\n` +
        `📌 ${task.task}\n` +
        `📅 ${fmtDate(task.due_date, task.due_time)}\n\n` +
        `Responde *completar ${task.id}* para marcarla como hecha.`;
      await markReminded(task.id);
      reminders.push(msg);
    }

    res.json({ ok: true, reminders });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
