/**
 * MeshCarrier — PostgreSQL Database Layer
 * 
 * Drop-in replacement for the SQLite db.js.
 * Uses node-postgres (pg) with a synchronous-style wrapper
 * so existing routes need minimal changes.
 *
 * Connection: process.env.DATABASE_URL (set by Render automatically)
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Synchronous-style query wrapper.
 * 
 * SQLite used db.prepare(sql).get/all/run — all synchronous.
 * PostgreSQL is async-only. We bridge this by providing:
 *   db.query(sql, params)  — returns Promise<rows[]>
 *   db.queryOne(sql, params) — returns Promise<row|null>
 *   db.execute(sql, params) — returns Promise<{rowCount}>
 * 
 * Routes have been updated to use async/await with these methods.
 */

// Convert SQLite ? placeholders to PostgreSQL $1 $2 $3 style
function toPostgresParams(sql, params = []) {
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  return { sql: converted, params };
}

// Convert SQLite datetime() to PostgreSQL NOW()
function normalizeSql(sql) {
  return sql
    .replace(/datetime\('now'\)/gi,       'NOW()')
    .replace(/CURRENT_TIMESTAMP/gi,        'NOW()')
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bTEXT\b(?!\s+PRIMARY)/gi,  match => match) // keep TEXT
    .replace(/REAL\b/gi,                  'DOUBLE PRECISION')
    .replace(/\bIF NOT EXISTS\b/gi,       'IF NOT EXISTS');
}

const db = {
  pool,

  // Run a SELECT returning multiple rows
  async query(sql, params = []) {
    const { sql: pSql, params: pParams } = toPostgresParams(normalizeSql(sql), params);
    const result = await pool.query(pSql, pParams);
    return result.rows;
  },

  // Run a SELECT returning one row (or null)
  async queryOne(sql, params = []) {
    const rows = await db.query(sql, params);
    return rows[0] || null;
  },

  // Run INSERT/UPDATE/DELETE
  async execute(sql, params = []) {
    const { sql: pSql, params: pParams } = toPostgresParams(normalizeSql(sql), params);
    const result = await pool.query(pSql, pParams);
    return { rowCount: result.rowCount, rows: result.rows };
  },

  // Run raw SQL (for schema/migrations)
  async exec(sql) {
    await pool.query(normalizeSql(sql));
  },

  // Transaction helper
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch(e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

module.exports = db;
