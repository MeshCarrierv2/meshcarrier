/**
 * MeshCarrier — Production Live Seed (PostgreSQL)
 * Run: node -r dotenv/config reseed-live.js
 */
require('dotenv').config();
const db     = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const initSchema = require('./db-init');

const SUPERADMIN = {
  email:     process.env.SUPERADMIN_EMAIL    || 'admin@meshcarrier.xyz',
  password:  process.env.SUPERADMIN_PASSWORD,
  full_name: process.env.SUPERADMIN_NAME     || 'MeshCarrier Admin',
};
const FIRST_USER = {
  email:     process.env.USER_EMAIL,
  password:  process.env.USER_PASSWORD,
  full_name: process.env.USER_NAME    || 'Node Operator',
  plan:      process.env.USER_PLAN    || 'NODE',
};

const missing = [];
if (!SUPERADMIN.password) missing.push('SUPERADMIN_PASSWORD');
if (!FIRST_USER.email)    missing.push('USER_EMAIL');
if (!FIRST_USER.password) missing.push('USER_PASSWORD');
if (missing.length) {
  console.error('\n  ✗ Missing in .env:', missing.join(', '), '\n');
  process.exit(1);
}

async function run() {
  console.log('\n  MeshCarrier — Production Live Seed\n');

  // Init schema
  await initSchema();

  // Wipe existing data
  console.log('  Clearing existing data...');
  for (const t of ['activity_log','port_requests','dids','sms_messages','voice_calls',
                    'payments','ticket_messages','tickets','devices','subscribers','nodes','users']) {
    await db.execute(`DELETE FROM ${t}`);
  }

  // Superadmin
  const adminId = uuid();
  await db.execute(
    'INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
    [adminId, SUPERADMIN.email, bcrypt.hashSync(SUPERADMIN.password, 12), SUPERADMIN.full_name, 'superadmin', 'active']
  );
  console.log(`  ✓ Superadmin : ${SUPERADMIN.email}`);

  // First user
  const userId = uuid();
  await db.execute(
    'INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, FIRST_USER.email, bcrypt.hashSync(FIRST_USER.password, 12), FIRST_USER.full_name, 'user', 'active']
  );

  const DATA_LIMITS = { NODE:5, MESH:20, CARRIER:-1 };
  const subId = uuid();
  await db.execute(
    `INSERT INTO subscribers (id,user_id,plan,esim_status,voice,sms,data_used_gb,data_limit_gb,mesh_balance,account_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [subId, userId, FIRST_USER.plan, 'pending','pending','pending', 0, DATA_LIMITS[FIRST_USER.plan]||5, 0, 'active']
  );
  console.log(`  ✓ User       : ${FIRST_USER.email} (${FIRST_USER.plan})`);

  // First node
  const nodeKey = 'nk_' + crypto.randomBytes(24).toString('hex');
  const nodeId  = 'node_' + crypto.randomBytes(6).toString('hex');
  await db.execute(
    "INSERT INTO nodes (id,name,status,node_key,node_type,location,mesh_earned) VALUES ($1,$2,'offline',$3,$4,$5,0)",
    [nodeId, 'Pixel Fold Node #1', nodeKey, 'relay', 'Primary']
  );

  const fs = require('fs'), path = require('path');
  const creds = `MeshCarrier Live Credentials
Generated: ${new Date().toISOString()}

SUPERADMIN
  Email    : ${SUPERADMIN.email}
  Password : ${SUPERADMIN.password}

USER (${FIRST_USER.plan} plan)
  Email    : ${FIRST_USER.email}
  Password : ${FIRST_USER.password}

PIXEL FOLD NODE
  Node ID  : ${nodeId}
  Node Key : ${nodeKey}

NODE AGENT .env:
  NODE_KEY=${nodeKey}
  CORE_URL=https://your-app.onrender.com
  NODE_TYPE=relay
`;
  fs.writeFileSync(path.join(__dirname, 'LIVE_CREDENTIALS.txt'), creds);

  console.log('\n  ════════════════════════════════════════');
  console.log('  LIVE — Credentials saved to LIVE_CREDENTIALS.txt');
  console.log('  ════════════════════════════════════════');
  console.log(`\n  Node Key : ${nodeKey}\n`);

  await db.pool.end();
}

run().catch(e => { console.error('  Error:', e.message); process.exit(1); });
