const { parseMessage } = require('./src/bot/parser');

// Colores para la terminal
const GREEN = '\x1b[32m✅';
const RED = '\x1b[31m❌';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function test(input, expected) {
  const result = parseMessage(input);
  const errors = [];

  for (const [key, val] of Object.entries(expected)) {
    if (result[key] !== val) {
      errors.push(`  ${key}: esperado "${val}" → obtenido "${result[key]}"`);
    }
  }

  if (errors.length === 0) {
    console.log(`${GREEN} "${input}"${RESET}`);
    passed++;
  } else {
    console.log(`${RED} "${input}"${RESET}`);
    errors.forEach(e => console.log(e));
    failed++;
  }
}

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── CREAR TAREAS (lenguaje natural) ──${RESET}\n`);

test('Recuérdame que mañana tengo reunión a las 9', {
  intent: 'create',
  dueTime: '09:00',
});

test('recuerdame que tengo cita con el doctor el viernes a las 3pm', {
  intent: 'create',
  dueTime: '15:00',
});

test('Agendar presentación pasado mañana a las 10', {
  intent: 'create',
  dueTime: '10:00',
});

test('nueva tarea comprar leche hoy a las 6 de la tarde', {
  intent: 'create',
  dueTime: '18:00',
});

test('tengo que entregar el reporte el 15/04 a las 10', {
  intent: 'create',
  dueTime: '10:00',
});

test('necesito llamar a mamá mañana en la mañana', {
  intent: 'create',
  dueTime: '09:00',
});

test('programar reunión el lunes a las 2pm', {
  intent: 'create',
  dueTime: '14:00',
});

test('tarea ir al gym, hoy 2pm, recuerdame 30 minutos antes', {
  intent: 'create',
  dueTime: '14:00',
  reminderBefore: 30,
});

test('reunion 3pm', {
  intent: 'unknown',
  dueTime: '15:00',
});

test('comprar leche 14:30', {
  intent: 'unknown',
  dueTime: '14:30',
});

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── RECORDATORIOS ANTICIPADOS ──${RESET}\n`);

test('Recuérdame reunión mañana a las 9, avísame 2 horas antes', {
  intent: 'create',
  dueTime: '09:00',
  reminderBefore: 120,
});

test('agendar cita el viernes a las 3pm avisame media hora antes', {
  intent: 'create',
  reminderBefore: 30,
});

test('tengo examen el lunes a las 8 avisame un dia antes', {
  intent: 'create',
  reminderBefore: 1440,
});

test('recordar pagar factura mañana a las 10 avisame 30 minutos antes', {
  intent: 'create',
  reminderBefore: 30,
});

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── LISTAR TAREAS ──${RESET}\n`);

test('listar', { intent: 'list' });
test('mis tareas', { intent: 'list' });
test('qué tengo pendiente', { intent: 'list' });
test('que tengo', { intent: 'list' });
test('mostrar tareas', { intent: 'list' });

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── COMPLETAR TAREAS ──${RESET}\n`);

test('completar 3', { intent: 'complete', taskId: 3 });
test('ya terminé la 5', { intent: 'complete', taskId: 5 });
test('hecho 1', { intent: 'complete', taskId: 1 });
test('listo 7', { intent: 'complete', taskId: 7 });

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── ELIMINAR TAREAS ──${RESET}\n`);

test('eliminar 3', { intent: 'delete', taskId: 3 });
test('borrar tarea 2', { intent: 'delete', taskId: 2 });
test('cancelar 4', { intent: 'delete', taskId: 4 });

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── AYUDA ──${RESET}\n`);

test('ayuda', { intent: 'help' });
test('que puedes hacer', { intent: 'help' });
test('comandos', { intent: 'help' });

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}── MENSAJES NO RECONOCIDOS ──${RESET}\n`);

test('hola', { intent: 'unknown' });
test('jajaja', { intent: 'unknown' });

// ═══════════════════════════════════════════════════════
console.log(`\n${BOLD}══ RESULTADO ══${RESET}`);
console.log(`${GREEN} ${passed} pasaron${RESET}`);
if (failed > 0) console.log(`${RED} ${failed} fallaron${RESET}`);
console.log('');
