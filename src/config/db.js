// db.js — PostgreSQL via pg Pool
const { Pool } = require('pg');

let pool;

const initializeDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Render Postgres requires SSL in production
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Verify connection
  const client = await pool.connect();
  console.log('Connected to PostgreSQL database');

  // Create tables if they don't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id        SERIAL PRIMARY KEY,
      username  TEXT NOT NULL,
      message   TEXT NOT NULL,
      type      TEXT NOT NULL DEFAULT 'text',
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Messages table created/verified');

  await client.query(`
    CREATE TABLE IF NOT EXISTS online_users (
      username  TEXT PRIMARY KEY,
      last_seen TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Online_users table created/verified');

  client.release();
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
