const WebSocket = require('ws');
const { getMessages, saveMessage } = require('../models/messages');
const { getDatabase } = require('../config/db');

const MAX_CONTENT_LENGTH = 2000;
const MAX_USERNAME_LENGTH = 24;
const CLEAR_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const WARN_BEFORE_MS   =  2 * 60 * 1000; //  2 minute warning before clear

const initializeWebSocketServer = (server) => {
    const wss = new WebSocket.Server({ server });
    const clients = new Map(); // ws -> { username, ip, joinedAt }

    // Exposed for admin view
    const getConnectedUsers = () =>
        Array.from(clients.values()).map(({ username, ip, joinedAt }) => ({ username, ip, joinedAt }));

    /* ---------- Heartbeat: ping every 10s, kill if no pong within 5s ---------- */
    const PING_INTERVAL = 10000;
    const PONG_TIMEOUT  = 5000;

    const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) {
                ws.terminate(); // forcefully close dead socket
                return;
            }
            ws.isAlive = false;
            ws.ping();
            // Kill if no pong arrives within 5s
            ws._pongTimer = setTimeout(() => {
                if (!ws.isAlive) ws.terminate();
            }, PONG_TIMEOUT);
        });
    }, PING_INTERVAL);

    wss.on('close', () => clearInterval(heartbeat));

    const broadcastUserCount = () => {
        const count = new Set(Array.from(clients.values()).map((i) => i.username)).size;
        const payload = JSON.stringify({ type: 'userCount', count });
        clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
    };

    const broadcastUserList = () => {
        const users = [...new Set(Array.from(clients.values()).map((i) => i.username))];
        const payload = JSON.stringify({ type: 'userList', users });
        clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
    };

    const broadcast = (payload) => {
        const msg = JSON.stringify(payload);
        clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) client.send(msg);
        });
    };

    // Auto-clear every 30 minutes — warn users 2 minutes before
    const scheduleAutoClear = () => {
        // Warning
        setTimeout(async () => {
            broadcast({ type: 'systemMessage', text: '⚠️ Chat will be cleared in 2 minutes.' });
        }, CLEAR_INTERVAL_MS - WARN_BEFORE_MS);

        // Clear
        setTimeout(async () => {
            try {
                await getDatabase().query('TRUNCATE TABLE messages');
                console.log('Auto-clear: messages table cleared');
                broadcast({ type: 'chatCleared', text: '🗑️ Chat has been cleared. Starting fresh!' });
            } catch (err) {
                console.error('Auto-clear error:', err);
            }
            // Schedule next cycle
            scheduleAutoClear();
        }, CLEAR_INTERVAL_MS);
    };

    scheduleAutoClear();

    wss.on('connection', async (ws, req) => {
        // Extract real IP (handles Render's reverse proxy)
        const ip =
            req.headers['x-forwarded-for']?.split(',')[0].trim() ||
            req.socket.remoteAddress ||
            'unknown';

        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
            clearTimeout(ws._pongTimer); // cancel kill timer — pong arrived in time
        });

        console.log('WebSocket connection established from', ip);

        ws.once('message', async (data) => {
            try {
                const { username: rawUsername } = JSON.parse(data);
                const username = (rawUsername || '').trim().slice(0, MAX_USERNAME_LENGTH);

                if (!username) {
                    ws.send(JSON.stringify({ error: 'Username required' }));
                    ws.close();
                    return;
                }

                // Block duplicate usernames
                const taken = Array.from(clients.values()).some(
                    (i) => i.username.toLowerCase() === username.toLowerCase()
                );
                if (taken) {
                    ws.send(JSON.stringify({ error: 'Username already taken. Choose another.' }));
                    ws.close();
                    return;
                }

                clients.set(ws, { username, ip, joinedAt: new Date().toISOString() });
                console.log(`Client ${username} connected from ${ip}`);

                broadcastUserCount();
                broadcastUserList();

                // Send message history
                try {
                    const messages = await getMessages();
                    console.log(`Retrieved ${messages.length} messages`);
                    // Send history as a single batch so client can clear+reload atomically
                    ws.send(JSON.stringify({
                        type: 'history',
                        messages: messages.map((msg) => ({
                            type: msg.username === username ? 'sentMessage' : 'receivedMessage',
                            username: msg.username,
                            messageType: msg.type || 'text',
                            content: msg.message,
                            timestamp: msg.timestamp,
                            replyTo: msg.reply_to || null
                        }))
                    }));
                } catch (err) {
                    console.error('Error retrieving messages:', err);
                }

                // Handle subsequent messages
                ws.on('message', async (messageData) => {
                    try {
                        const data = JSON.parse(messageData);

                        // Typing indicators
                        if (data.type === 'typing' || data.type === 'stopTyping') {
                            const payload = JSON.stringify({ type: data.type, username });
                            clients.forEach((info, client) => {
                                if (client !== ws && client.readyState === WebSocket.OPEN)
                                    client.send(payload);
                            });
                            return;
                        }

                        // Regular messages
                        const content = (data.content || '').trim();
                        const messageType = data.messageType || 'text';
                        const replyTo = data.replyTo || null;

                        if (!content) return;
                        if (content.length > MAX_CONTENT_LENGTH) {
                            ws.send(JSON.stringify({ error: 'Message too long (max 2000 chars)' }));
                            return;
                        }

                        try {
                            await saveMessage(username, content, messageType, replyTo);
                            const now = new Date().toISOString();

                            ws.send(JSON.stringify({
                                type: 'sentMessage',
                                messageType,
                                content,
                                timestamp: now,
                                replyTo
                            }));

                            const broadcastPayload = JSON.stringify({
                                type: 'receivedMessage',
                                username,
                                messageType,
                                content,
                                timestamp: now,
                                replyTo
                            });

                            clients.forEach((info, client) => {
                                if (client !== ws && client.readyState === WebSocket.OPEN)
                                    client.send(broadcastPayload);
                            });
                        } catch (dbError) {
                            console.error('Database error:', dbError);
                            ws.send(JSON.stringify({ error: 'Failed to save message' }));
                        }
                    } catch (parseError) {
                        console.error('Error parsing message:', parseError);
                        ws.send(JSON.stringify({ error: 'Invalid message format' }));
                    }
                });
            } catch (parseError) {
                console.error('Error parsing initial message:', parseError);
                ws.close();
            }
        });

        ws.on('close', () => {
            const info = clients.get(ws);
            const username = info?.username;
            console.log(`Client ${username || 'unknown'} disconnected`);
            clients.delete(ws);

            if (username) {
                const payload = JSON.stringify({ type: 'stopTyping', username });
                clients.forEach((_, client) => {
                    if (client.readyState === WebSocket.OPEN) client.send(payload);
                });
            }

            broadcastUserCount();
            broadcastUserList();
        });

        ws.on('error', (err) => console.error('WebSocket error:', err));
    });

    return { wss, getConnectedUsers };
};

module.exports = { initializeWebSocketServer };
