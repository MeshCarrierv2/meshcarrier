const router = require('express').Router();
const db     = require('../db');
const { v4: uuid } = require('uuid');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT p.*, s.plan, u.full_name FROM payments p
      LEFT JOIN subscribers s ON s.id=p.sub_id
      LEFT JOIN users u ON u.id=s.user_id
      ORDER BY p.created_at DESC`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { sub_id, type, plan, amount_xrp, amount_usd, status, notes } = req.body;
    if (!sub_id || !type || amount_xrp === undefined) return res.status(400).json({ error: 'Missing fields' });
    const id = uuid();
    await db.execute(
      'INSERT INTO payments (id,sub_id,type,plan,amount_xrp,amount_usd,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, sub_id, type, plan||'', amount_xrp, amount_usd||0, status||'settled', notes||'']
    );
    res.json(await db.queryOne('SELECT * FROM payments WHERE id=$1', [id]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    await db.execute('UPDATE payments SET status=$1, notes=$2 WHERE id=$3', [status, notes||'', req.params.id]);
    res.json(await db.queryOne('SELECT * FROM payments WHERE id=$1', [req.params.id]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
