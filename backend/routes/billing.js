const router = require('express').Router();
const db     = require('../db');
const { v4: uuid } = require('uuid');
const { auth, requireRole: role } = require('../middleware/auth');

router.use(auth, role('admin','superadmin'));

const PLAN_PRICES = { NODE: { usd:15, xrp:6.5 }, MESH: { usd:30, xrp:13.0 }, CARRIER: { usd:55, xrp:23.8 } };

router.get('/stats', async (req, res) => {
  try {
    const subs    = await db.query("SELECT * FROM subscribers WHERE account_status='active'");
    const revenue = await db.queryOne("SELECT SUM(amount_usd) as total_usd, SUM(amount_xrp) as total_xrp FROM payments WHERE status='settled'");
    const mrr     = subs.reduce((a, s) => a + (PLAN_PRICES[s.plan]?.usd||0), 0);
    res.json({ mrr, arr: mrr*12, total_revenue_usd: revenue?.total_usd||0, total_revenue_xrp: revenue?.total_xrp||0, active_subscribers: subs.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/run-cycle', async (req, res) => {
  try {
    const subs = await db.query("SELECT * FROM subscribers WHERE account_status='active'");
    let billed = 0;
    for (const s of subs) {
      const price = PLAN_PRICES[s.plan];
      if (!price) continue;
      await db.execute(
        'INSERT INTO payments (id,sub_id,type,plan,amount_xrp,amount_usd,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [uuid(), s.id, 'monthly_bill', s.plan, price.xrp, price.usd, 'settled', 'Auto billing cycle']
      );
      billed++;
    }
    await db.execute(
      'INSERT INTO activity_log (id,user_id,full_name,action,detail) VALUES ($1,$2,$3,$4,$5)',
      [uuid(), req.user.id, req.user.name||'Admin', 'ran billing cycle', `Billed ${billed} subscribers`]
    );
    res.json({ ok: true, billed });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/invoices', async (req, res) => {
  try {
    res.json(await db.query(`
      SELECT p.*, u.full_name, u.email FROM payments p
      LEFT JOIN subscribers s ON s.id=p.sub_id
      LEFT JOIN users u ON u.id=s.user_id
      ORDER BY p.created_at DESC LIMIT 200`));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
