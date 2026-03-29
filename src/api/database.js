const admin = require('firebase-admin');
const path = require('path');

// ---------------------------------------------------------------------------
// Firebase initialization
// ---------------------------------------------------------------------------

function initFirebase() {
  // Option 1: firebase-key.json file (local dev)
  const keyPath = process.env.FIREBASE_KEY_PATH || path.join(__dirname, '..', '..', 'firebase-key.json');
  try {
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('Firebase: inicializado con firebase-key.json');
    return;
  } catch (err) {
    // File not found, try env vars
  }

  // Option 2: Individual env vars (Railway)
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    // If base64 encoded (no dashes), decode it
    if (!privateKey.includes('-----')) {
      privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
    } else {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('Firebase: inicializado con variables de entorno');
    return;
  }

  // Option 3: FIREBASE_CONFIG JSON blob
  if (process.env.FIREBASE_CONFIG) {
    try {
      const config = JSON.parse(process.env.FIREBASE_CONFIG);
      admin.initializeApp({ credential: admin.credential.cert(config) });
      console.log('Firebase: inicializado con FIREBASE_CONFIG');
      return;
    } catch (e) {
      console.error('Firebase: FIREBASE_CONFIG JSON inválido:', e.message);
    }
  }

  console.error('Firebase: No se encontró configuración. Usa firebase-key.json o variables FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
  process.exit(1);
}

initFirebase();

const db = admin.firestore();
const tasksCol = db.collection('tasks');
const countersCol = db.collection('counters');

// ---------------------------------------------------------------------------
// Helper: get next sequential ID
// ---------------------------------------------------------------------------

async function getNextId() {
  const counterRef = countersCol.doc('tasks');
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = doc.exists ? (doc.data().next || 1) : 1;
    tx.set(counterRef, { next: next + 1 });
    return next;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Helper: compute reminder_at timestamp
// ---------------------------------------------------------------------------

function computeReminderAt(dueDate, dueTime, reminderBefore) {
  if (!dueDate || !dueTime) return null;
  const dt = new Date(`${dueDate}T${dueTime}:00`);
  if (isNaN(dt.getTime())) return null;
  return new Date(dt.getTime() - (reminderBefore || 0) * 60000);
}

// ---------------------------------------------------------------------------
// Helper: doc to plain object
// ---------------------------------------------------------------------------

function docToTask(doc) {
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    id: data.id,
    phone: data.phone,
    task: data.task,
    due_date: data.due_date || null,
    due_time: data.due_time || null,
    completed: data.completed || 0,
    reminded: data.reminded || 0,
    reminder_before: data.reminder_before || 0,
    created_at: data.created_at ? data.created_at.toDate().toISOString() : '',
  };
}

function snapToTasks(snap) {
  return snap.docs.map(doc => docToTask(doc));
}

// ---------------------------------------------------------------------------
// CRUD functions (all async)
// ---------------------------------------------------------------------------

async function createTask(phone, task, dueDate = null, dueTime = null, reminderBefore = 0) {
  const id = await getNextId();
  const reminderAt = computeReminderAt(dueDate, dueTime, reminderBefore);

  const data = {
    id,
    phone,
    task,
    due_date: dueDate,
    due_time: dueTime,
    completed: 0,
    reminded: 0,
    reminder_before: reminderBefore,
    reminder_at: reminderAt ? admin.firestore.Timestamp.fromDate(reminderAt) : null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  await tasksCol.doc(String(id)).set(data);

  // Return with a usable created_at
  return { ...data, created_at: new Date().toISOString() };
}

async function getTasks(phone) {
  const snap = await tasksCol.where('phone', '==', phone).orderBy('created_at', 'desc').get();
  return snapToTasks(snap);
}

async function getAllTasks() {
  const snap = await tasksCol.orderBy('created_at', 'desc').get();
  return snapToTasks(snap);
}

async function getTaskById(id) {
  const doc = await tasksCol.doc(String(id)).get();
  return docToTask(doc);
}

async function completeTask(id) {
  const ref = tasksCol.doc(String(id));
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.update({ completed: 1 });
  const updated = await ref.get();
  return docToTask(updated);
}

async function updateTask(id, task, phone, dueDate, dueTime, reminderBefore) {
  const ref = tasksCol.doc(String(id));
  const doc = await ref.get();
  if (!doc.exists) return null;

  const reminderAt = computeReminderAt(dueDate, dueTime, reminderBefore);
  await ref.update({
    task,
    phone,
    due_date: dueDate,
    due_time: dueTime,
    reminder_before: reminderBefore,
    reminded: 0,
    reminder_at: reminderAt ? admin.firestore.Timestamp.fromDate(reminderAt) : null,
  });

  const updated = await ref.get();
  return docToTask(updated);
}

async function deleteTask(id) {
  const ref = tasksCol.doc(String(id));
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = docToTask(doc);
  await ref.delete();
  return data;
}

async function getPendingReminders() {
  const now = admin.firestore.Timestamp.now();
  const snap = await tasksCol
    .where('completed', '==', 0)
    .where('reminded', '==', 0)
    .where('reminder_at', '<=', now)
    .get();
  return snapToTasks(snap);
}

async function markReminded(id) {
  const ref = tasksCol.doc(String(id));
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.update({ reminded: 1 });
  return true;
}

async function getUpcomingTasks(phone) {
  const snap = await tasksCol
    .where('phone', '==', phone)
    .where('completed', '==', 0)
    .orderBy('due_date')
    .orderBy('due_time')
    .get();
  return snapToTasks(snap);
}

module.exports = {
  db,
  createTask,
  getTasks,
  getAllTasks,
  getTaskById,
  completeTask,
  updateTask,
  deleteTask,
  getPendingReminders,
  markReminded,
  getUpcomingTasks,
};
