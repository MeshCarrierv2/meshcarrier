const router = require('express').Router();
const db     = require('../db');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

router.post('/', async (req, res) => {
  try {
    const { full_name, email, password, plan, make, model, os_version, imei, esim_eid } = req.body;
    if (!full_name || !email || !password || !plan) return res.status(400).json({ error: 'Missing required fields' });

    const existing = await db.queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const DATA_LIMITS = { NODE: 5, MESH: 20, CARRIER: -1 };
    const uid = uuid(), sid = uuid(), did = uuid();

    await db.execute(
      'INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, email.toLowerCase(), bcrypt.hashSync(password, 10), full_name, 'user', 'active']
    );
    await db.execute(
      `INSERT INTO subscribers (id,user_id,plan,esim_status,voice,sms,data_used_gb,data_limit_gb,mesh_balance,account_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [sid, uid, plan, 'pending', 'pending', 'pending', 0, DATA_LIMITS[plan] || 5, 0, 'active']
    );
    if (make || model) {
      await db.execute(
        `INSERT INTO devices (id,subscriber_id,make,model,os_version,imei,esim_eid,status,setup_step,setup_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [did, sid, make || '', model || '', os_version || '', imei || '', esim_eid || '', 'setup', 2, 'Device registered at signup']
      );
    }

    res.json({ ok: true, message: 'Account created successfully' });
  } catch(e) {
    console.error('Signup error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
