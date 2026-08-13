const WebSocket = require('ws');
const { getMessages, saveMessage } = require('../models/messages');

const initializeWebSocketServer = (server) => {
    const wss = new WebSocket.Server({ server });
    const clients = new Map(); // Store client info with their ws connection

    // Function to broadcast online user count (unique usernames currently connected)
    const broadcastUserCount = () => {
        const count = new Set(
            Array.from(clients.values()).map((info) => info.username)
        ).size;

        const payload = JSON.stringify({
            type: 'userCount',
            count
        });

        clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    };

    // Broadcast the list of online usernames to all clients
    const broadcastUserList = () => {
        const users = [...new Set(Array.from(clients.values()).map((info) => info.username))];
        const payload = JSON.stringify({ type: 'userList', users });
        clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    };

    wss.on('connection', async (ws, req) => {
        console.log('WebSocket connection established');

        // Wait for initial username before adding to clients
        ws.once('message', async (data) => {
            try {
                const { username } = JSON.parse(data);
                if (!username) {
                    ws.send(JSON.stringify({ error: 'Username required' }));
                    return;
                }

                // Store client with their username
                clients.set(ws, { username });
                console.log(`Client ${username} connected`);

                broadcastUserCount();
                broadcastUserList();

                // Send previous messages
                try {
                    const messages = await getMessages();
                    console.log(`Retrieved ${messages.length} messages successfully`);
                    for (const msg of messages) {
                        const isSelf = msg.username === username;
                        ws.send(JSON.stringify({
                            type: isSelf ? 'sentMessage' : 'receivedMessage',
                            username: msg.username,
                            messageType: msg.type || 'text',
                            content: msg.message,
                            timestamp: msg.timestamp
                        }));
                    }
                } catch (err) {
                    console.error('Error retrieving messages:', err);
                }

                // Handle subsequent messages
                ws.on('message', async (messageData) => {
                    try {
                        const data = JSON.parse(messageData);

                        // Handle typing indicators
                        if (data.type === 'typing' || data.type === 'stopTyping') {
                            // Broadcast typing status to other clients
                            const typingPayload = JSON.stringify({
                                type: data.type,
                                username: username
                            });

                            clients.forEach((clientInfo, client) => {
                                if (client !== ws && client.readyState === WebSocket.OPEN) {
                                    client.send(typingPayload);
                                }
                            });
                            return;
                        }

                        // Handle regular messages
                        const content = data.content;
                        const messageType = data.messageType || 'text';
                        const replyTo = data.replyTo || null;
                        if (!content) {
                            console.log('Invalid message format - missing message content');
                            return;
                        }

                        try {
                            // Save message to database
                            await saveMessage(username, content, messageType);
                            console.log('Message saved successfully');

                            const now = new Date().toISOString();

                            // Send confirmation back to sender
                            ws.send(JSON.stringify({
                                type: 'sentMessage',
                                messageType: messageType,
                                content: content,
                                timestamp: now,
                                replyTo: replyTo
                            }));

                            // Broadcast to other clients
                            const broadcastPayload = JSON.stringify({
                                type: 'receivedMessage',
                                username: username,
                                messageType: messageType,
                                content: content,
                                timestamp: now,
                                replyTo: replyTo
                            });

                            clients.forEach((clientInfo, client) => {
                                if (client !== ws && client.readyState === WebSocket.OPEN) {
                                    client.send(broadcastPayload);
                                }
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
                console.error('Error parsing initial username:', parseError);
                ws.close();
            }
        });

        ws.on('close', () => {
            const clientInfo = clients.get(ws);
            const username = clientInfo?.username;
            console.log(`Client ${username || 'unknown'} disconnected`);

            clients.delete(ws);

            if (username) {
                // Notify other clients that this user has stopped typing
                const stopTypingPayload = JSON.stringify({
                    type: 'stopTyping',
                    username: username
                });

                clients.forEach((info, client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(stopTypingPayload);
                    }
                });
            }

            broadcastUserCount();
            broadcastUserList();
        });

        ws.on('error', (err) => console.error('WebSocket error:', err));
    });

    return wss;
};

module.exports = {
    initializeWebSocketServer
};