const express = require('express');
const path = require('path');
const os = require('os');
require('dotenv').config();
const { initializeWebSocketServer } = require('./src/websocket/server');
const { initializeDatabase } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Initialize database first
        await initializeDatabase();
        
        // Create Express app and HTTP server
        const app = express();
        app.use(express.static(path.join(__dirname, '/public')));

        // Admin: clear all messages
        // Usage: GET /admin/clear-chat?key=YOUR_ADMIN_KEY
        app.get('/admin/clear-chat', async (req, res) => {
            const adminKey = process.env.ADMIN_KEY;
            if (!adminKey || req.query.key !== adminKey) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            try {
                const { getDatabase } = require('./src/config/db');
                await getDatabase().query('TRUNCATE TABLE messages');
                console.log('Messages table cleared by admin');
                return res.json({ success: true, message: 'All messages cleared.' });
            } catch (err) {
                console.error('Error clearing messages:', err);
                return res.status(500).json({ error: 'Failed to clear messages' });
            }
        });

        const address = Object.values(os.networkInterfaces()).flat().find((iface) => iface.family === 'IPv4' && !iface.internal);
        const ip = address ? address.address : 'localhost';

        const server = app.listen(PORT, '0.0.0.0', () =>
            console.log(`HTTP server running on http://${ip}:${PORT}`)
        );

        // Initialize WebSocket server with HTTP server
        initializeWebSocketServer(server);
        console.log('WebSocket server running');
        
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();