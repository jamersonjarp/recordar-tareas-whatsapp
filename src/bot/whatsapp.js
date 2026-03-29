const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createTask, getUpcomingTasks, completeTask, deleteTask } = require('../api/database');
const { parseMessage } = require('./parser');
const { transcribeAudio } = require('./audio');

// IDs de mensajes enviados por el bot (para evitar loops)
const botSentMessages = new Set();

// Expose the bot's own number so the API/dashboard can use it
let botNumber = null;
function getBotNumber() { return botNumber; }

// Owner number from env (the real user who receives reminders)
function getOwnerChatId() {
  const num = process.env.OWNER_NUMBER || '';
  const digits = num.replace(/[^0-9]/g, '');
  return digits ? `${digits}@c.us` : null;
}

// ---------------------------------------------------------------------------
// Formatear fecha legible
// ---------------------------------------------------------------------------

function formatDate(dueDate, dueTime) {
  if (!dueDate) return 'Sin fecha';
  const [y, m, d] = dueDate.split('-');
  let str = `${d}/${m}/${y}`;
  if (dueTime) str += ` ${dueTime}`;
  return str;
}

function formatReminderBefore(minutes) {
  if (!minutes || minutes === 0) return '';
  if (minutes >= 1440) return ` (aviso ${minutes / 1440} día(s) antes)`;
  if (minutes >= 60) return ` (aviso ${minutes / 60}h antes)`;
  return ` (aviso ${minutes}min antes)`;
}

// ---------------------------------------------------------------------------
// Manejar mensajes entrantes
// ---------------------------------------------------------------------------

async function handleMessage(message, client) {
  let body = message.body ? message.body.trim() : '';

  // Ignorar mensajes enviados por el bot
  if (botSentMessages.has(message.id._serialized)) {
    return;
  }

  const chatId = message.from;
  const reply = async (text) => {
    try {
      const sent = await client.sendMessage(chatId, text);
      botSentMessages.add(sent.id._serialized);
      setTimeout(() => botSentMessages.delete(sent.id._serialized), 30000);
    } catch (err) {
      console.error('Error enviando respuesta:', err);
    }
  };

  // Si es un audio, transcribirlo
  if (message.hasMedia && (message.type === 'ptt' || message.type === 'audio')) {
    try {
      const media = await message.downloadMedia();
      if (media && media.data) {
        const buffer = Buffer.from(media.data, 'base64');
        const transcription = await transcribeAudio(buffer);
        if (transcription) {
          body = transcription;
          await reply(`🎙️ _"${transcription}"_`);
        } else {
          return reply('⚠️ No pude entender el audio. Intenta enviarlo de nuevo o escribe el mensaje.');
        }
      }
    } catch (err) {
      console.error('Error procesando audio:', err);
      return reply('⚠️ Error al procesar el audio.');
    }
  }

  if (!body) return;

  console.log(`[Bot] Mensaje recibido de ${chatId}: "${body}"`);
  const phone = chatId;
  const parsed = parseMessage(body);

  // ── Crear tarea ────────────────────────────────────────────────────────
  if (parsed.intent === 'create') {
    if (!parsed.task) {
      return reply('⚠️ No entendí la tarea. Intenta algo como:\n_"Recuérdame que mañana tengo reunión a las 9"_');
    }

    const task = createTask(phone, parsed.task, parsed.dueDate, parsed.dueTime, parsed.reminderBefore);

    let msg = `✅ Tarea creada (ID: ${task.id})\n📝 *${parsed.task}*`;
    if (parsed.dueDate) {
      msg += `\n📅 ${formatDate(parsed.dueDate, parsed.dueTime)}`;
    }
    if (parsed.reminderBefore > 0) {
      msg += `\n⏰ Te avisaré${formatReminderBefore(parsed.reminderBefore)}`;
    }
    return reply(msg);
  }

  // ── Listar tareas ─────────────────────────────────────────────────────
  if (parsed.intent === 'list') {
    const tasks = getUpcomingTasks(phone);

    if (tasks.length === 0) {
      return reply('📋 No tienes tareas pendientes. ¡Disfruta tu tiempo libre! 🎉');
    }

    let msg = '📋 *Tus tareas pendientes:*\n\n';
    tasks.forEach((t) => {
      const date = t.due_date ? `📅 ${formatDate(t.due_date, t.due_time)}` : '';
      const reminder = formatReminderBefore(t.reminder_before);
      msg += `*${t.id}.* ${t.task} ${date}${reminder}\n`;
    });
    msg += '\n_Dime "completar [id]" o "eliminar [id]" para gestionarlas._';
    return reply(msg);
  }

  // ── Completar tarea ───────────────────────────────────────────────────
  if (parsed.intent === 'complete') {
    if (!parsed.taskId) {
      return reply('⚠️ Indica el ID de la tarea.\nEjemplo: _"completar 3"_');
    }
    const success = completeTask(parsed.taskId);
    if (success) {
      return reply(`✅ Tarea #${parsed.taskId} completada. ¡Buen trabajo! 💪`);
    }
    return reply(`❌ No encontré la tarea #${parsed.taskId}.`);
  }

  // ── Eliminar tarea ────────────────────────────────────────────────────
  if (parsed.intent === 'delete') {
    if (!parsed.taskId) {
      return reply('⚠️ Indica el ID de la tarea.\nEjemplo: _"eliminar 3"_');
    }
    const success = deleteTask(parsed.taskId);
    if (success) {
      return reply(`🗑️ Tarea #${parsed.taskId} eliminada.`);
    }
    return reply(`❌ No encontré la tarea #${parsed.taskId}.`);
  }

  // ── Ayuda ─────────────────────────────────────────────────────────────
  if (parsed.intent === 'help') {
    const help = [
      '🤖 *Soy tu asistente de tareas*\n',
      'Puedes hablarme de forma natural o enviar audios:\n',
      '📝 *Crear tarea:*',
      '   _"Recuérdame que mañana tengo reunión a las 9"_',
      '   _"Agendar cita con el doctor el viernes a las 3pm, avísame 2 horas antes"_',
      '   _"Tengo que entregar el reporte el 15/04 a las 10"_\n',
      '📋 *Ver tareas:*',
      '   _"Qué tengo pendiente"_ o _"listar"_\n',
      '✅ *Completar:*',
      '   _"Completar 3"_ o _"Ya terminé la 3"_\n',
      '🗑️ *Eliminar:*',
      '   _"Eliminar 3"_ o _"Borrar tarea 3"_\n',
      '🎙️ *Audio:*',
      '   ¡También puedes enviar notas de voz!',
    ].join('\n');
    return reply(help);
  }

  // ── Si detectó fecha/tarea pero intent fue unknown, intentar crear ────
  if (parsed.intent === 'unknown' && parsed.task && parsed.dueDate) {
    const task = createTask(phone, parsed.task, parsed.dueDate, parsed.dueTime, parsed.reminderBefore);
    let msg = `✅ Tarea creada (ID: ${task.id})\n📝 *${parsed.task}*`;
    if (parsed.dueDate) {
      msg += `\n📅 ${formatDate(parsed.dueDate, parsed.dueTime)}`;
    }
    if (parsed.reminderBefore > 0) {
      msg += `\n⏰ Te avisaré${formatReminderBefore(parsed.reminderBefore)}`;
    }
    return reply(msg);
  }

  // No entendí → sugerir ayuda
  if (parsed.intent === 'unknown') {
    return reply('🤔 No entendí. Dime _"ayuda"_ para ver qué puedo hacer.');
  }
}

// ---------------------------------------------------------------------------
// Inicializar bot
// ---------------------------------------------------------------------------

function initBot() {
  const ownerChatId = getOwnerChatId();
  if (!ownerChatId) {
    console.error('ERROR: Debes configurar OWNER_NUMBER en el archivo .env');
    console.error('Ejemplo: OWNER_NUMBER=573004638234');
    process.exit(1);
  }

  const puppeteerOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  // In Docker/Railway, use system Chromium
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else if (process.platform === 'darwin') {
    puppeteerOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }

  const authDataPath = process.env.WWEBJS_AUTH_PATH || undefined;
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authDataPath }),
    puppeteer: puppeteerOptions,
  });

  client.on('qr', (qr) => {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  Escanea este QR con el SEGUNDO numero       ║');
    console.log('║  (el numero del bot, NO tu numero personal)  ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    
    // Generar un link para verlo limpio fuera de la consola
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    console.log('⚠️ SI EL QR DE ABAJO SE VE DEFORME, ABRE ESTE ENLACE EN TU NAVEGADOR PARA ESCANEARLO:');
    console.log('👉 ' + qrImageUrl + '\n');

    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    botNumber = client.info.wid._serialized;
    console.log(`Bot conectado con numero: ${botNumber}`);
    console.log(`Escuchando mensajes del dueño: ${ownerChatId}`);
    console.log('Enviale un mensaje al bot desde tu WhatsApp personal para probarlo.\n');
  });

  // Escuchar TODOS los mensajes entrantes
  client.on('message', async (message) => {
    try {
      // DEBUG: log ALL incoming messages
      console.log(`[DEBUG] message event — from: ${message.from}, type: ${message.type}, body: "${(message.body || '').substring(0, 50)}"`);

      // Solo procesar mensajes del dueño (tu numero personal)
      if (message.from !== ownerChatId) {
        console.log(`[DEBUG] Ignorado: ${message.from} !== ${ownerChatId}`);
        return;
      }

      // Ignorar mensajes del bot
      if (botSentMessages.has(message.id._serialized)) return;

      await handleMessage(message, client);
    } catch (err) {
      console.error('Error procesando mensaje:', err);
    }
  });

  client.initialize();

  return client;
}

module.exports = { initBot, botSentMessages, getBotNumber, getOwnerChatId };
