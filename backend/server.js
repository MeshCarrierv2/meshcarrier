try { require('dotenv').config(); } catch(e) {}

const express = require('express');
const cors    = require('cors');
const db      = require('./db');
const initSchema = require('./db-init');

const app    = express();
const PORT   = process.env.PORT || 3001;
const IS_LIVE = process.env.LIVE_MODE === 'true';

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/signup',      require('./routes/signup'));
app.use('/api/subscribers', require('./routes/subscribers'));
app.use('/api/devices',     require('./routes/devices'));
app.use('/api/tickets',     require('./routes/tickets'));
app.use('/api/voice',       require('./routes/voice'));
app.use('/api/payments',    require('./routes/payments'));
app.use('/api/nodes',       require('./routes/nodes'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/dashboard',   require('./routes/dashboard'));
app.use('/api/billing',     require('./routes/billing'));
app.use('/api/esim',        require('./routes/esim'));

app.get('/api', (req, res) => res.json({ name:'MeshCarrier API', version:'2.2.0', status:'online', mode: IS_LIVE?'LIVE':'demo', db:'postgresql' }));

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Init schema then start
initSchema().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║  MeshCarrier API v2.2.0  (PostgreSQL)        ║
  ║  ${IS_LIVE ? '🔴 LIVE MODE                           ' : '🟡 DEMO MODE                           '}  ║
  ║  http://0.0.0.0:${PORT}/api                    ║
  ╚══════════════════════════════════════════════╝
    `);
  });
}).catch(e => {
  console.error('Failed to init DB:', e.message);
  process.exit(1);
});
