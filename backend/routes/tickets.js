const router = require('express').Router();
const db     = require('../db');
const { v4: uuid } = require('uuid');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const isStaff = ['support','tech','admin','superadmin'].includes(req.user.role);
    const rows = isStaff
      ? await db.query(`SELECT t.*, u.full_name, u.email FROM tickets t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC`)
      : await db.query(`SELECT t.*, u.full_name FROM tickets t LEFT JOIN users u ON u.id=t.user_id WHERE t.user_id=$1 ORDER BY t.created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const msgs = await db.query(`
      SELECT m.*, u.full_name, u.role FROM ticket_messages m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`, [req.params.id]);
    res.json(msgs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { subject, category, priority, body } = req.body;
    if (!subject) return res.status(400).json({ error: 'Subject required' });
    const tid = uuid();
    await db.execute(
      'INSERT INTO tickets (id,user_id,subject,category,priority,status) VALUES ($1,$2,$3,$4,$5,$6)',
      [tid, req.user.id, subject, category||'general', priority||'medium', 'open']
    );
    if (body) {
      await db.execute(
        'INSERT INTO ticket_messages (id,ticket_id,user_id,body) VALUES ($1,$2,$3,$4)',
        [uuid(), tid, req.user.id, body]
      );
    }
    const ticket = await db.queryOne('SELECT * FROM tickets WHERE id=$1', [tid]);
    res.json(ticket);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/messages', async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Body required' });
    const mid = uuid();
    await db.execute(
      'INSERT INTO ticket_messages (id,ticket_id,user_id,body) VALUES ($1,$2,$3,$4)',
      [mid, req.params.id, req.user.id, body]
    );
    const msg = await db.queryOne(`
      SELECT m.*,u.full_name,u.role FROM ticket_messages m
      LEFT JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [mid]);
    res.json(msg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['status','priority','category'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (updates.length) {
      const set  = updates.map(([k], i) => `${k} = $${i+1}`).join(', ');
      const vals = [...updates.map(([,v]) => v), req.params.id];
      await db.execute(`UPDATE tickets SET ${set} WHERE id = $${vals.length}`, vals);
    }
    const updated = await db.queryOne('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
