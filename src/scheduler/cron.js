const cron = require('node-cron');
const { getPendingReminders, markReminded } = require('../api/database');
const { botSentMessages, getOwnerChatId } = require('../bot/whatsapp');

function initScheduler(whatsappClient) {
  console.log('Scheduler de recordatorios iniciado (cada minuto)');

  cron.schedule('*/1 * * * *', async () => {
    try {
      const pending = await getPendingReminders();

      if (pending.length === 0) return;

      console.log(`[Scheduler] ${pending.length} recordatorio(s) pendiente(s)`);

      // Always send reminders to the owner
      const ownerChatId = getOwnerChatId();

      for (const task of pending) {
        const message =
          `⏰ *Recordatorio de tarea*\n\n` +
          `📌 ${task.task}\n` +
          `📅 ${task.due_date} ${task.due_time}\n\n` +
          `Responde *completar ${task.id}* para marcarla como hecha.`;

        try {
          // Send to owner's @c.us chat ID (not LID)
          const chatId = ownerChatId || task.phone;
          console.log(`[Scheduler] Enviando recordatorio tarea #${task.id} a ${chatId}...`);
          const sent = await whatsappClient.sendMessage(chatId, message);
          botSentMessages.add(sent.id._serialized);
          setTimeout(() => botSentMessages.delete(sent.id._serialized), 30000);
          await markReminded(task.id);
          console.log(`[Scheduler] Recordatorio enviado — tarea #${task.id}`);
        } catch (err) {
          console.error(`[Scheduler] Error enviando recordatorio (tarea #${task.id}):`, err.message);
          await markReminded(task.id);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error general en el cron:', err.message);
    }
  });
}

module.exports = { initScheduler };
