// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    try {
      const dbPath = path.join(__dirname, 'chat.db');
      db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to SQLite: ${err.message}`));
          return;
        }
        console.log('Connected to SQLite database at:', dbPath);

        // Create messages table
        const createMessagesTableQuery = `
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `;

        const createOnlineUsersTableQuery = `
          CREATE TABLE IF NOT EXISTS online_users (
            username TEXT PRIMARY KEY,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `;

        // Run both table creation queries sequentially
        db.serialize(() => {
          db.run(createMessagesTableQuery, (err) => {
            if (err) {
              reject(new Error(`Failed to create messages table: ${err.message}`));
              return;
            }
            console.log('Messages table created/verified');
          });

          db.run(createOnlineUsersTableQuery, (err) => {
            if (err) {
              reject(new Error(`Failed to create online_users table: ${err.message}`));
              return;
            }
            console.log('Online_users table created/verified');
            resolve(db);
          });
        });
      });
    } catch (error) {
      reject(error);
    }
  });
};

const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
};

module.exports = { initializeDatabase, getDatabase, closeDatabase };