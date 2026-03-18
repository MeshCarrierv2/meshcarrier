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

// ── One-time seed endpoint (secured by SETUP_TOKEN env var) ──────────────────
app.post('/api/setup/seed', async (req, res) => {
  try {
    const { setup_token, superadmin_email, superadmin_password,
            user_email, user_password, user_name, user_plan } = req.body;
    const expectedToken = process.env.SETUP_TOKEN;
    if (!expectedToken) return res.status(403).json({ error: 'SETUP_TOKEN not set in environment' });
    if (setup_token !== expectedToken) return res.status(403).json({ error: 'Invalid setup token' });
    const existing = await db.queryOne('SELECT COUNT(*) as n FROM users');
    if (parseInt(existing?.n) > 0) return res.status(409).json({ error: 'Already seeded' });
    const bcrypt = require('bcryptjs');
    const { v4: uuid } = require('uuid');
    const crypto = require('crypto');
    const adminId = uuid();
    await db.execute('INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [adminId, superadmin_email||'admin@meshcarrier.xyz', bcrypt.hashSync(superadmin_password,12), 'MeshCarrier Admin','superadmin','active']);
    const userId = uuid(), plan = user_plan||'NODE';
    await db.execute('INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, user_email, bcrypt.hashSync(user_password,12), user_name||'Node Operator','user','active']);
    const subId = uuid();
    const DATA_LIMITS = {NODE:5,MESH:20,CARRIER:-1};
    await db.execute('INSERT INTO subscribers (id,user_id,plan,esim_status,voice,sms,data_used_gb,data_limit_gb,mesh_balance,account_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [subId,userId,plan,'pending','pending','pending',0,DATA_LIMITS[plan]||5,0,'active']);
    const nodeKey='nk_'+crypto.randomBytes(24).toString('hex'), nodeId='node_'+crypto.randomBytes(6).toString('hex');
    await db.execute("INSERT INTO nodes (id,name,status,node_key,node_type,location,mesh_earned) VALUES ($1,$2,'offline',$3,$4,$5,0)",
      [nodeId,'Pixel Fold Node #1',nodeKey,'relay','Primary']);
    res.json({ success:true, superadmin_email: superadmin_email||'admin@meshcarrier.xyz',
      user_email, node_key: nodeKey, node_id: nodeId,
      warning:'Remove SETUP_TOKEN env var after seeding!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
