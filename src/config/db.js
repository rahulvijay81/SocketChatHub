// db.js — PostgreSQL via pg Pool
const { Pool } = require('pg');

let pool;

const initializeDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Verify connection and create tables
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id        SERIAL PRIMARY KEY,
        username  TEXT NOT NULL,
        message   TEXT NOT NULL,
        type      TEXT NOT NULL DEFAULT 'text',
        reply_to  JSONB DEFAULT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Messages table created/verified');

    // Add reply_to column to existing deployments that don't have it
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL
    `).catch(() => {}); // ignore if already exists on older pg versions

  } finally {
    client.release();
  }

  return pool;
};

const getDatabase = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
};

const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    console.log('Database connection closed');
  }
};

module.exports = { initializeDatabase, getDatabase, closeDatabase };
