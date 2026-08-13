// models/messages.js — PostgreSQL
const { getDatabase } = require('../config/db');

const getMessages = async () => {
  const pool = getDatabase();
  const { rows } = await pool.query(
    'SELECT username, message, type, timestamp FROM messages ORDER BY timestamp ASC'
  );
  return rows;
};

const saveMessage = async (username, message, type = 'text') => {
  const pool = getDatabase();
  const { rows } = await pool.query(
    'INSERT INTO messages (username, message, type) VALUES ($1, $2, $3) RETURNING id',
    [username, message, type]
  );
  console.log('Message saved successfully, ID:', rows[0].id);
  return rows[0].id;
};

const setUserOnline = async (username) => {
  const pool = getDatabase();
  await pool.query(
    `INSERT INTO online_users (username, last_seen)
     VALUES ($1, NOW())
     ON CONFLICT (username) DO UPDATE SET last_seen = NOW()`,
    [username]
  );
};

const setUserOffline = async (username) => {
  const pool = getDatabase();
  await pool.query('DELETE FROM online_users WHERE username = $1', [username]);
};

const getOnlineUserCount = async () => {
  const pool = getDatabase();
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM online_users');
  return parseInt(rows[0].count, 10);
};

module.exports = { getMessages, saveMessage, setUserOnline, setUserOffline, getOnlineUserCount };
