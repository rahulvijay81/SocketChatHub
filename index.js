const express = require('express');
const path = require('path');
const { initializeWebSocketServer } = require('./src/websocket/server');
const { initializeDatabase } = require('./src/config/db');

const startServer = async () => {
    try {
        // Initialize database first
        await initializeDatabase();
        
        // Create Express app and HTTP server
        const app = express();
        app.use(express.static(path.join(__dirname, '/public')));
        const server = app.listen(3000, '0.0.0.0', () => console.log('HTTP server running on http://11.0.244.63:3000'));

        
        // Initialize WebSocket server with HTTP server
        initializeWebSocketServer(server);
        console.log('WebSocket server running');
        
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();