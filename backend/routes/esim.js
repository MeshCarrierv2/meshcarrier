const router = require('express').Router();
const db     = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const crypto = require('crypto');

// ── Gigs service (optional — graceful fallback if not configured) ──────────
let esimService = null;
try { esimService = require('../services/esim'); } catch(e) {}

// ── Provision eSIM ────────────────────────────────────────────────────────
router.post('/provision/:subscriberId', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    const sub = await db.queryOne('SELECT * FROM subscribers WHERE id = $1', [req.params.subscriberId]);
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });

    if (!esimService || !process.env.GIGS_API_KEY) {
      // Mock provisioning
      const iccid = '8901150278' + Math.floor(10000000000 + Math.random()*90000000000);
      await db.execute('UPDATE subscribers SET esim_status=$1, iccid=$2 WHERE id=$3', ['active', iccid, sub.id]);
      return res.json({ status:'provisioned', iccid, mock:true, message:'Mock eSIM provisioned (configure GIGS_API_KEY for live)' });
    }

    const result = await esimService.provisionESIM(db, sub.id, req.body.plan || sub.plan);
    await db.execute('INSERT INTO activity_log (id,user_id,full_name,action,detail) VALUES ($1,$2,$3,$4,$5)',
      [crypto.randomUUID(), req.user.id, req.user.name||'', 'provisioned eSIM', `for subscriber ${sub.id.slice(0,8)}`]);

    if (result.pending) return res.json({ status:'pending', subscription_id: result.subscription.id });
    res.json({ status:'provisioned', iccid: result.sim?.iccid, qr_code_url: result.credentials?.qrCodeUrl,
               activation_code: result.credentials?.activationCode });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Reissue eSIM ──────────────────────────────────────────────────────────
router.post('/reissue/:subscriberId', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    const sub = await db.queryOne('SELECT * FROM subscribers WHERE id = $1', [req.params.subscriberId]);
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });

    if (!esimService || !process.env.GIGS_API_KEY) {
      const iccid = '8901150278' + Math.floor(10000000000 + Math.random()*90000000000);
      await db.execute('UPDATE subscribers SET esim_status=$1, iccid=$2 WHERE id=$3', ['active', iccid, sub.id]);
      const dev = await db.queryOne('SELECT * FROM devices WHERE subscriber_id=$1 ORDER BY created_at DESC LIMIT 1', [sub.id]);
      if (dev) await db.execute('UPDATE devices SET iccid=$1, setup_step=5, setup_notes=$2 WHERE id=$3',
        [iccid, 'eSIM reissued (mock)', dev.id]);
      return res.json({ status:'reissued', iccid, mock:true,
        activation_code:'LPA:1$mock.meshcarrier.xyz$MESHTEST'+Math.floor(1000+Math.random()*9000),
        message:'Mock eSIM reissued' });
    }

    const result = await esimService.reissueESIM(db, sub.id);
    if (result.pending) return res.json({ status:'pending', subscription_id: result.subscription.id });
    res.json({ status:'reissued', iccid: result.sim?.iccid,
               qr_code_url: result.credentials?.qrCodeUrl,
               activation_code: result.credentials?.activationCode });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Get Credentials ───────────────────────────────────────────────────────
router.get('/credentials/:subscriberId', auth, async (req, res) => {
  try {
    const sub = await db.queryOne('SELECT * FROM subscribers WHERE id = $1', [req.params.subscriberId]);
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });

    const isOwner = sub.user_id === req.user.id;
    const isStaff = ['tech','admin','superadmin','support'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Forbidden' });

    if (!sub.gigs_sim_id) {
      // Return mock creds if no Gigs integration
      return res.json({
        iccid: sub.iccid || 'Pending',
        esim_status: sub.esim_status,
        mock: true,
        activation_code: sub.iccid ? `LPA:1$mock.meshcarrier.xyz$${sub.iccid}` : null,
        qr_code_url: null,
      });
    }

    const credentials = await esimService.getSIMCredentials(sub.gigs_sim_id);
    res.json({ iccid: sub.iccid, esim_status: sub.esim_status,
               qr_code_url: credentials.qrCodeUrl,
               activation_code: credentials.activationCode });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Usage ─────────────────────────────────────────────────────────────────
router.get('/usage/:subscriberId', auth, async (req, res) => {
  try {
    const sub = await db.queryOne('SELECT * FROM subscribers WHERE id = $1', [req.params.subscriberId]);
    if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
    const isOwner = sub.user_id === req.user.id;
    const isStaff = ['tech','admin','superadmin','support'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Forbidden' });

    if (!sub.gigs_sub_id || !esimService) {
      return res.json({ data_used_gb: sub.data_used_gb||0, source:'local' });
    }
    const usage = await esimService.getUsage(sub.gigs_sub_id);
    const usedGB = (usage.data?.used||0) / 1_000_000_000;
    await db.execute('UPDATE subscribers SET data_used_gb=$1 WHERE id=$2', [usedGB, sub.id]);
    res.json({ data_used_gb: usedGB, source:'live' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Plans ─────────────────────────────────────────────────────────────────
router.get('/plans', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    if (!esimService || !process.env.GIGS_API_KEY) {
      return res.json({ plans:[], mock:true, note:'Set GIGS_API_KEY to see real plans' });
    }
    const plans = await esimService.listPlans();
    res.json({ plans: plans.items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Sync ──────────────────────────────────────────────────────────────────
router.post('/sync/:subscriberId', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    if (!esimService) return res.json({ message:'Gigs not configured' });
    const result = await esimService.syncSubscriber(db, req.params.subscriberId);
    res.json({ synced: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Webhook ───────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('[eSIM Webhook]', event.type);
    res.json({ received: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
