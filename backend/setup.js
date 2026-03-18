/**
 * One-time setup endpoint — seeds the database
 * Automatically disables itself after first use
 * DELETE this file after seeding!
 */
const router  = require('express').Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const crypto  = require('crypto');
const initSchema = require('../db-init');

router.post('/seed', async (req, res) => {
  try {
    // Security: require a setup token
    const { setup_token, superadmin_email, superadmin_password,
            user_email, user_password, user_name, user_plan } = req.body;

    const expectedToken = process.env.SETUP_TOKEN;
    if (!expectedToken) return res.status(403).json({ error: 'SETUP_TOKEN not configured' });
    if (setup_token !== expectedToken) return res.status(403).json({ error: 'Invalid setup token' });

    // Check if already seeded
    const existing = await db.queryOne('SELECT COUNT(*) as n FROM users');
    if (parseInt(existing?.n) > 0) {
      return res.status(409).json({ error: 'Database already seeded. Delete setup route to proceed.' });
    }

    if (!superadmin_password || !user_email || !user_password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await initSchema();

    // Create superadmin
    const adminId = uuid();
    await db.execute(
      'INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [adminId, superadmin_email||'admin@meshcarrier.xyz',
       bcrypt.hashSync(superadmin_password, 12),
       'MeshCarrier Admin', 'superadmin', 'active']
    );

    // Create first user
    const userId = uuid();
    const plan   = user_plan || 'NODE';
    await db.execute(
      'INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, user_email, bcrypt.hashSync(user_password, 12), user_name||'Node Operator', 'user', 'active']
    );

    const DATA_LIMITS = { NODE:5, MESH:20, CARRIER:-1 };
    const subId = uuid();
    await db.execute(
      `INSERT INTO subscribers (id,user_id,plan,esim_status,voice,sms,data_used_gb,data_limit_gb,mesh_balance,account_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [subId, userId, plan, 'pending','pending','pending', 0, DATA_LIMITS[plan]||5, 0, 'active']
    );

    // Create Pixel Fold node
    const nodeKey = 'nk_' + crypto.randomBytes(24).toString('hex');
    const nodeId  = 'node_' + crypto.randomBytes(6).toString('hex');
    await db.execute(
      "INSERT INTO nodes (id,name,status,node_key,node_type,location,mesh_earned) VALUES ($1,$2,'offline',$3,$4,$5,0)",
      [nodeId, 'Pixel Fold Node #1', nodeKey, 'relay', 'Primary']
    );

    res.json({
      success: true,
      message: 'Database seeded! SAVE these credentials and DELETE the setup route.',
      superadmin: { email: superadmin_email||'admin@meshcarrier.xyz', password: superadmin_password },
      user: { email: user_email, password: user_password, plan },
      node: { id: nodeId, key: nodeKey },
      next_step: 'Add NODE_KEY to Pixel Fold .env: NODE_KEY=' + nodeKey,
      warning: 'Remove SETUP_TOKEN from env vars and delete backend/routes/setup.js after this!'
    });

  } catch(e) {
    console.error('Seed error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
