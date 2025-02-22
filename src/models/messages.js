// models/messages.js
const { getDatabase } = require("../config/db");

const getMessages = () => {
    return new Promise((resolve, reject) => {
        const db = getDatabase();
        const query = 'SELECT username, message FROM messages ORDER BY timestamp ASC';
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error retrieving messages:', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

const saveMessage = (username, message) => {
    return new Promise((resolve, reject) => {
        const db = getDatabase();
        const query = 'INSERT INTO messages (username, message) VALUES (?, ?)';
        db.run(query, [username, message], function (err) {
            if (err) {
                console.error('Error saving message:', err);
                reject(err);
            } else {
                console.log('Message saved successfully, ID:', this.lastID);
                resolve(this.lastID);
            }
        });
    });
};

const setUserOnline = (username) => {
    return new Promise((resolve, reject) => {
        const db = getDatabase();
        const query = 'INSERT OR REPLACE INTO online_users (username, last_seen) VALUES (?, CURRENT_TIMESTAMP)';
        db.run(query, [username], (err) => {
            if (err) {
                console.error('Error setting user online:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

const setUserOffline = (username) => {
    return new Promise((resolve, reject) => {
        const db = getDatabase();
        const query = 'DELETE FROM online_users WHERE username = ?';
        db.run(query, [username], (err) => {
            if (err) {
                console.error('Error setting user offline:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

const getOnlineUserCount = () => {
    return new Promise((resolve, reject) => {
        const db = getDatabase();
        const query = 'SELECT COUNT(*) as count FROM online_users';
        db.get(query, [], (err, row) => {
            if (err) {
                console.error('Error getting online user count:', err);
                return reject(err);
            }
            // Log the returned row for debugging
            console.log('Row returned from query:', row);
            if (row && typeof row.count !== 'undefined') {
                resolve(row.count);
            } else {
                console.warn('Row is undefined or row.count is missing; defaulting count to 0');
                resolve(0);
            }
        });
    });
};


module.exports = { getMessages, saveMessage, setUserOnline, setUserOffline, getOnlineUserCount };