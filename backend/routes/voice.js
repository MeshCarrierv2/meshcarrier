const router = require('express').Router();
const db     = require('../db');
const { v4: uuid } = require('uuid');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/calls', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM voice_calls ORDER BY created_at DESC LIMIT 100'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/sms', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM sms_messages ORDER BY created_at DESC LIMIT 100'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/dids', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM dids ORDER BY status, number'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/ports', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM port_requests ORDER BY created_at DESC'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/assign-did', async (req, res) => {
  try {
    const { sub_id, number } = req.body;
    await db.execute("UPDATE dids SET status='assigned', sub_id=$1 WHERE number=$2", [sub_id, number]);
    await db.execute('UPDATE subscribers SET did=$1, msisdn=$1 WHERE id=$2', [number, sub_id]);
    res.json({ ok: true, number });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
