const router = require('express').Router();
const db     = require('../db');
const { v4: uuid } = require('uuid');
const { auth } = require('../middleware/auth');

router.use(auth);

const SETUP_STEPS = [
  { step:0, name:'Account Verified',   description:'Account active and verified' },
  { step:1, name:'Plan Selected',      description:'Service plan confirmed' },
  { step:2, name:'Device Registered',  description:'Device details submitted' },
  { step:3, name:'IMEI Submitted',     description:'IMEI registered on network' },
  { step:4, name:'eSIM Profile Ready', description:'eSIM profile generated' },
  { step:5, name:'eSIM Installed',     description:'eSIM installed on device' },
  { step:6, name:'APN Configured',     description:'APN settings applied' },
  { step:7, name:'Network Test',       description:'Connection verified' },
  { step:8, name:'Voice & SMS Ready',  description:'Calling and SMS active' },
  { step:9, name:'Setup Complete',     description:'Device fully provisioned' },
];

router.get('/', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT d.*, s.plan, s.esim_status, s.voice, s.sms, s.did, u.full_name
      FROM devices d
      LEFT JOIN subscribers s ON s.id = d.subscriber_id
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY d.created_at DESC`);
    res.json(rows.map(r => ({ ...r, setup_steps: SETUP_STEPS })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.queryOne(`
      SELECT d.*, s.plan, s.esim_status, s.voice, s.sms, s.did, u.full_name
      FROM devices d
      LEFT JOIN subscribers s ON s.id = d.subscriber_id
      LEFT JOIN users u ON u.id = s.user_id
      WHERE d.id = $1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, setup_steps: SETUP_STEPS });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    let { subscriber_id, make, model, os_version, imei, esim_eid, status, setup_step, setup_notes } = req.body;
    if (!subscriber_id && req.user?.role === 'user') {
      const sub = await db.queryOne('SELECT id FROM subscribers WHERE user_id = $1', [req.user.id]);
      if (sub) subscriber_id = sub.id;
    }
    if (!subscriber_id) return res.status(400).json({ error: 'subscriber_id required' });
    const id = uuid();
    await db.execute(
      `INSERT INTO devices (id,subscriber_id,make,model,os_version,imei,esim_eid,status,setup_step,setup_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, subscriber_id, make||'', model||'', os_version||'', imei||'', esim_eid||'',
       status||'setup', setup_step||2, setup_notes||'Device registered']
    );
    const device = await db.queryOne('SELECT * FROM devices WHERE id = $1', [id]);
    res.json({ ...device, setup_steps: SETUP_STEPS });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const devCheck = await db.queryOne('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    if (!devCheck) return res.status(404).json({ error: 'Not found' });
    const isStaff = ['tech','admin','superadmin','support'].includes(req.user.role);
    if (!isStaff) {
      const sub = devCheck.subscriber_id
        ? await db.queryOne('SELECT user_id FROM subscribers WHERE id = $1', [devCheck.subscriber_id])
        : null;
      if (!sub || sub.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    }
    const allowed = ['status','setup_notes','make','model','os_version','imei','esim_eid','iccid','setup_step'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (updates.length) {
      const set  = updates.map(([k], i) => `${k} = $${i+1}`).join(', ');
      const vals = [...updates.map(([,v]) => v), req.params.id];
      await db.execute(`UPDATE devices SET ${set} WHERE id = $${vals.length}`, vals);
    }
    const updated = await db.queryOne(`
      SELECT d.*, s.plan, s.esim_status, s.voice, s.sms, s.did, u.full_name
      FROM devices d LEFT JOIN subscribers s ON s.id=d.subscriber_id
      LEFT JOIN users u ON u.id=s.user_id WHERE d.id=$1`, [req.params.id]);
    res.json({ ...updated, setup_steps: SETUP_STEPS });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/step', async (req, res) => {
  try {
    const d = await db.queryOne('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    if (!d) return res.status(404).json({ error: 'Not found' });
    const isStaff = ['tech','admin','superadmin','support'].includes(req.user.role);
    if (!isStaff) {
      const sub = d.subscriber_id
        ? await db.queryOne('SELECT user_id FROM subscribers WHERE id = $1', [d.subscriber_id])
        : null;
      if (!sub || sub.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    }
    const newStep = req.body.step !== undefined ? req.body.step : Math.min((d.setup_step||0) + 1, 9);
    const notes   = req.body.notes || SETUP_STEPS[newStep]?.description || '';
    const status  = newStep >= 9 ? 'active' : 'setup';
    await db.execute(
      'UPDATE devices SET setup_step=$1, setup_notes=$2, status=$3 WHERE id=$4',
      [newStep, notes, status, d.id]
    );
    if (d.subscriber_id) {
      if (newStep >= 5) await db.execute("UPDATE subscribers SET esim_status='active' WHERE id=$1", [d.subscriber_id]);
      if (newStep >= 6) await db.execute("UPDATE subscribers SET voice='enabled' WHERE id=$1", [d.subscriber_id]);
      if (newStep >= 7) await db.execute("UPDATE subscribers SET sms='enabled' WHERE id=$1", [d.subscriber_id]);
    }
    const updated = await db.queryOne(`
      SELECT d.*, s.plan, s.esim_status, s.voice, s.sms, s.did, u.full_name
      FROM devices d LEFT JOIN subscribers s ON s.id=d.subscriber_id
      LEFT JOIN users u ON u.id=s.user_id WHERE d.id=$1`, [req.params.id]);
    res.json({ ...updated, setup_steps: SETUP_STEPS, current_step: SETUP_STEPS[newStep] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM devices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
