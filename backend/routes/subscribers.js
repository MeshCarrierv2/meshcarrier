const router = require('express').Router();
const db     = require('../db');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT s.*, u.full_name, u.email, u.role
      FROM subscribers s LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.queryOne(`
      SELECT s.*, u.full_name, u.email FROM subscribers s
      LEFT JOIN users u ON u.id = s.user_id WHERE s.id = $1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['plan','did','msisdn','esim_status','voice','sms','data_used_gb',
                     'data_limit_gb','mesh_balance','wallet','account_status','voicemail_count',
                     'gigs_user_id','gigs_sub_id','gigs_sim_id','iccid'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

    const set    = updates.map(([k], i) => `${k} = $${i+1}`).join(', ');
    const vals   = updates.map(([,v]) => v);
    vals.push(req.params.id);
    await db.execute(`UPDATE subscribers SET ${set} WHERE id = $${vals.length}`, vals);

    const updated = await db.queryOne('SELECT * FROM subscribers WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM subscribers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
