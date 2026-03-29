require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./api/routes');

// Import database to ensure Firebase initializes on startup
require('./api/database');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow frontend from Netlify (or any origin in dev)
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Parse JSON bodies
app.use(express.json());

// Serve static files (only in local dev, Netlify serves them in production)
if (!process.env.RAILWAY_ENVIRONMENT) {
  app.use(express.static(path.join(__dirname, '..', 'public')));
}

// Mount API routes
app.use('/api', routes);

// Start Express server
app.listen(PORT, () => {
  console.log(`Servidor web en http://localhost:${PORT}`);
});

// Initialize WhatsApp bot
const { initBot } = require('./bot/whatsapp');
const { initScheduler } = require('./scheduler/cron');

console.log('Bot de WhatsApp iniciando...');
const client = initBot();

client.on('ready', () => {
  console.log('Bot de WhatsApp listo');
  initScheduler(client);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nCerrando aplicación...');
  client.destroy();
  process.exit(0);
});