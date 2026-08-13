// models/messages.js — PostgreSQL
const { getDatabase } = require('../config/db');

const MESSAGE_LIMIT = 200;

const getMessages = async () => {
  const pool = getDatabase();
  // Fetch last N messages ordered oldest-first for display
  const { rows } = await pool.query(
    `SELECT username, message, type, reply_to, timestamp
     FROM (
       SELECT * FROM messages ORDER BY timestamp DESC LIMIT $1
     ) sub
     ORDER BY timestamp ASC`,
    [MESSAGE_LIMIT]
  );
  return rows;
};

const saveMessage = async (username, message, type = 'text', replyTo = null) => {
  const pool = getDatabase();
  const { rows } = await pool.query(
    'INSERT INTO messages (username, message, type, reply_to) VALUES ($1, $2, $3, $4) RETURNING id',
    [username, message, type, replyTo ? JSON.stringify(replyTo) : null]
  );
  console.log('Message saved successfully, ID:', rows[0].id);
  return rows[0].id;
};

module.exports = { getMessages, saveMessage };
