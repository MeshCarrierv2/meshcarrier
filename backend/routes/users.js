const router  = require('express').Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { auth, requireRole: role } = require('../middleware/auth');

router.use(auth, role('admin','superadmin'));

router.get('/', async (req, res) => {
  try {
    res.json(await db.query('SELECT id,email,full_name,role,status,last_login,created_at FROM users ORDER BY created_at'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { email, password, full_name, role: r } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Missing fields' });
    const id = uuid();
    await db.execute(
      'INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, email.toLowerCase(), bcrypt.hashSync(password, 10), full_name, r||'user', 'active']
    );
    res.json(await db.queryOne('SELECT id,email,full_name,role,status FROM users WHERE id=$1', [id]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['full_name','role','status'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (req.body.password) updates.push(['password_hash', bcrypt.hashSync(req.body.password, 10)]);
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
    const set  = updates.map(([k], i) => `${k} = $${i+1}`).join(', ');
    const vals = [...updates.map(([,v]) => v), req.params.id];
    await db.execute(`UPDATE users SET ${set} WHERE id = $${vals.length}`, vals);
    res.json(await db.queryOne('SELECT id,email,full_name,role,status FROM users WHERE id=$1', [req.params.id]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
