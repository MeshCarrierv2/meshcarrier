const router  = require('express').Router();
const db      = require('../db');
const crypto  = require('crypto');
const { v4: uuid } = require('uuid');
const { auth, requireRole } = require('../middleware/auth');

// Node agent endpoints (auth via node key)
router.post('/register', async (req, res) => {
  try {
    const { node_key, node_id, hostname, hardware, node_type, capabilities, agent_version } = req.body;
    if (!node_key) return res.status(401).json({ error: 'node_key required' });

    let node = await db.queryOne('SELECT * FROM nodes WHERE node_key = $1', [node_key]);
    if (!node && node_id) node = await db.queryOne('SELECT * FROM nodes WHERE id = $1', [node_id]);

    if (!node) {
      const id = 'node_' + crypto.randomBytes(6).toString('hex');
      await db.execute(`INSERT INTO nodes
        (id,name,status,node_key,hostname,device_type,hardware_json,node_type,capabilities_json,agent_version,ip_address,last_seen)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
        [id, hostname||id, 'online', node_key, hostname||'', hardware?.device_type||'unknown',
         JSON.stringify(hardware||{}), node_type||'relay', JSON.stringify(capabilities||{}),
         agent_version||'1.0.0', req.headers['x-forwarded-for']||req.socket.remoteAddress||'']);
      node = await db.queryOne('SELECT * FROM nodes WHERE id = $1', [id]);
    } else {
      await db.execute(`UPDATE nodes SET status='online', hostname=$1, device_type=$2, hardware_json=$3,
        node_type=$4, capabilities_json=$5, agent_version=$6, ip_address=$7, last_seen=NOW() WHERE id=$8`,
        [hostname||node.hostname, hardware?.device_type||node.device_type, JSON.stringify(hardware||{}),
         node_type||node.node_type, JSON.stringify(capabilities||{}), agent_version||node.agent_version,
         req.headers['x-forwarded-for']||req.socket.remoteAddress||'', node.id]);
    }

    res.json({ node_id: node.id, status:'registered', config:{ report_interval:15000, radio_enabled: node.radio_enabled||false }, commands:[] });
  } catch(e) { console.error('[Node] Register:', e.message); res.status(500).json({ error: e.message }); }
});

router.post('/:id/heartbeat', async (req, res) => {
  try {
    const node = await db.queryOne('SELECT * FROM nodes WHERE id = $1', [req.params.id]);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const { stats } = req.body;
    await db.execute(`UPDATE nodes SET status='online', last_seen=NOW(),
      cpu_percent=$1, ram_percent=$2, temperature_c=$3, connected_clients=$4,
      uptime_seconds=$5, stats_json=$6 WHERE id=$7`,
      [stats?.cpu_percent||0, stats?.ram_percent||0, stats?.temperature_c||null,
       stats?.connected_clients||0, stats?.uptime_seconds||0, JSON.stringify(stats||{}), node.id]);
    res.json({ ok: true, earnings_delta: 0, commands: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/offline', async (req, res) => {
  try {
    await db.execute("UPDATE nodes SET status='offline', last_seen=NOW() WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Staff portal endpoints
router.get('/', auth, async (req, res) => {
  try {
    const nodes = await db.query('SELECT * FROM nodes ORDER BY status DESC, last_seen DESC');
    res.json(nodes.map(n => ({
      ...n,
      hardware:     tryParse(n.hardware_json),
      capabilities: tryParse(n.capabilities_json),
      stats:        tryParse(n.stats_json),
      status:       isOnline(n) ? n.status : 'offline',
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const n = await db.queryOne('SELECT * FROM nodes WHERE id=$1', [req.params.id]);
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json({ ...n, hardware: tryParse(n.hardware_json), status: isOnline(n) ? n.status : 'offline' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    const id      = 'node_' + crypto.randomBytes(6).toString('hex');
    const nodeKey = 'nk_' + crypto.randomBytes(24).toString('hex');
    const { name, location, node_type } = req.body;
    await db.execute(
      "INSERT INTO nodes (id,name,status,node_key,node_type,location,mesh_earned) VALUES ($1,$2,'offline',$3,$4,$5,0)",
      [id, name||id, nodeKey, node_type||'relay', location||'']);
    res.json({ id, node_key: nodeKey, name, status: 'offline' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    const { name, location, radio_enabled, status } = req.body;
    const n = await db.queryOne('SELECT * FROM nodes WHERE id=$1', [req.params.id]);
    if (!n) return res.status(404).json({ error: 'Not found' });
    await db.execute('UPDATE nodes SET name=$1, location=$2, radio_enabled=$3, status=$4 WHERE id=$5',
      [name||n.name, location??n.location, radio_enabled!=null?(radio_enabled?1:0):n.radio_enabled, status||n.status, n.id]);
    res.json(await db.queryOne('SELECT * FROM nodes WHERE id=$1', [n.id]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/command', auth, requireRole(['tech','admin','superadmin']), async (req, res) => {
  try {
    const n = await db.queryOne('SELECT id FROM nodes WHERE id=$1', [req.params.id]);
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, queued: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, requireRole(['admin','superadmin']), async (req, res) => {
  try {
    await db.execute('DELETE FROM nodes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function isOnline(node) {
  if (!node.last_seen) return false;
  return (Date.now() - new Date(node.last_seen).getTime()) < 120_000;
}
function tryParse(str) { try { return str ? JSON.parse(str) : {}; } catch(e) { return {}; } }

module.exports = router;
