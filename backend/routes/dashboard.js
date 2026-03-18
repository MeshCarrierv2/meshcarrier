const router = require('express').Router();
const db     = require('../db');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const subs     = await db.query('SELECT * FROM subscribers');
    const tickets  = await db.query('SELECT * FROM tickets');
    const devices  = await db.query('SELECT * FROM devices');
    const nodes    = await db.query('SELECT * FROM nodes ORDER BY status DESC');
    const calls    = await db.query("SELECT * FROM voice_calls WHERE created_at::date = CURRENT_DATE");
    const sms      = await db.query("SELECT * FROM sms_messages WHERE created_at::date = CURRENT_DATE");
    const revenue  = await db.queryOne("SELECT SUM(amount_xrp) as total_xrp, SUM(amount_usd) as total_usd FROM payments WHERE status='settled'");
    const activity = await db.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 15');

    res.json({
      subscribers:     { total: subs.length, active: subs.filter(s=>s.account_status==='active').length },
      tickets:         { open: tickets.filter(t=>t.status==='open').length, high: tickets.filter(t=>t.priority==='high'&&t.status==='open').length },
      devices:         { total: devices.length, pending: devices.filter(d=>d.status==='setup').length },
      nodes,
      voice:           { calls_today: calls.length, sms_today: sms.length },
      revenue:         { total_xrp: revenue?.total_xrp||0, total_usd: revenue?.total_usd||0 },
      open_tickets:    tickets.filter(t=>t.status==='open').length,
      recent_activity: activity,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/my', async (req, res) => {
  try {
    const sub = await db.queryOne('SELECT * FROM subscribers WHERE user_id = $1', [req.user.id]);
    if (!sub) return res.json({ subscriber: null, device: null, calls: [], tickets: [], payments: [] });

    const device   = await db.queryOne('SELECT * FROM devices WHERE subscriber_id = $1 ORDER BY created_at DESC LIMIT 1', [sub.id]);
    const calls    = await db.query('SELECT * FROM voice_calls WHERE sub_id = $1 ORDER BY created_at DESC LIMIT 5', [sub.id]);
    const tickets  = await db.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    const payments = await db.query('SELECT * FROM payments WHERE sub_id = $1 ORDER BY created_at DESC', [sub.id]);

    res.json({ subscriber: sub, device: device || null, calls, tickets, payments });
  } catch(e) {
    console.error('User dashboard error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
