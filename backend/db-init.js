/**
 * MeshCarrier — PostgreSQL Schema Init
 * Run once on first deploy: node db-init.js
 * Or called automatically by server.js on startup.
 */

const db = require('./db');

async function initSchema() {
  console.log('  Initializing PostgreSQL schema...');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      plan TEXT NOT NULL DEFAULT 'NODE',
      did TEXT,
      msisdn TEXT,
      esim_status TEXT DEFAULT 'pending',
      voice TEXT DEFAULT 'pending',
      sms TEXT DEFAULT 'pending',
      data_used_gb DOUBLE PRECISION DEFAULT 0,
      data_limit_gb DOUBLE PRECISION DEFAULT 5,
      mesh_balance DOUBLE PRECISION DEFAULT 0,
      wallet TEXT,
      voicemail_count INTEGER DEFAULT 0,
      account_status TEXT DEFAULT 'active',
      gigs_user_id TEXT,
      gigs_sub_id TEXT,
      gigs_sim_id TEXT,
      iccid TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      subscriber_id TEXT REFERENCES subscribers(id),
      make TEXT,
      model TEXT,
      os_version TEXT,
      imei TEXT,
      esim_eid TEXT,
      iccid TEXT,
      status TEXT DEFAULT 'setup',
      setup_step INTEGER DEFAULT 0,
      setup_notes TEXT,
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      subject TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES tickets(id),
      user_id TEXT REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      sub_id TEXT REFERENCES subscribers(id),
      type TEXT NOT NULL,
      plan TEXT,
      amount_xrp DOUBLE PRECISION NOT NULL,
      amount_usd DOUBLE PRECISION,
      status TEXT DEFAULT 'settled',
      nft_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS voice_calls (
      id TEXT PRIMARY KEY,
      sub_id TEXT REFERENCES subscribers(id),
      direction TEXT,
      from_num TEXT,
      to_num TEXT,
      duration_s INTEGER DEFAULT 0,
      status TEXT DEFAULT 'answered',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY,
      sub_id TEXT REFERENCES subscribers(id),
      direction TEXT,
      from_num TEXT,
      to_num TEXT,
      body TEXT,
      status TEXT DEFAULT 'delivered',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dids (
      number TEXT PRIMARY KEY,
      city TEXT,
      type TEXT DEFAULT 'local',
      provider TEXT DEFAULT 'Bandwidth',
      monthly_usd DOUBLE PRECISION DEFAULT 1.5,
      status TEXT DEFAULT 'available',
      sub_id TEXT
    );

    CREATE TABLE IF NOT EXISTS port_requests (
      id TEXT PRIMARY KEY,
      sub_id TEXT REFERENCES subscribers(id),
      number TEXT,
      carrier_losing TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT,
      location TEXT,
      status TEXT DEFAULT 'offline',
      node_key TEXT UNIQUE,
      hostname TEXT,
      ip_address TEXT,
      device_type TEXT DEFAULT 'unknown',
      node_type TEXT DEFAULT 'relay',
      hardware_json TEXT,
      capabilities_json TEXT,
      stats_json TEXT,
      agent_version TEXT,
      uptime_seconds INTEGER DEFAULT 0,
      cpu_percent DOUBLE PRECISION DEFAULT 0,
      ram_percent DOUBLE PRECISION DEFAULT 0,
      temperature_c DOUBLE PRECISION,
      connected_clients INTEGER DEFAULT 0,
      gb_served DOUBLE PRECISION DEFAULT 0,
      mesh_earned DOUBLE PRECISION DEFAULT 0,
      radio_enabled INTEGER DEFAULT 0,
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      full_name TEXT,
      action TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('  ✓ Schema ready');
}

module.exports = initSchema;

// Run directly: node db-init.js
if (require.main === module) {
  initSchema()
    .then(() => { console.log('  Done.'); process.exit(0); })
    .catch(e => { console.error('  Error:', e.message); process.exit(1); });
}
