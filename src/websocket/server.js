const WebSocket = require('ws');
const { getMessages, saveMessage, setUserOnline, getOnlineUserCount, setUserOffline } = require('../models/messages');

const initializeWebSocketServer = (server) => {
    const wss = new WebSocket.Server({ server });
    const clients = new Map(); // Store client info with their ws connection

    // Function to broadcast online user count
    const broadcastUserCount = async () => {
        try {
            const count = await getOnlineUserCount();
            console.log("confirmation: User count updated to", count, "clients");

            const payload = JSON.stringify({
                type: 'userCount',
                count: count
            });

            console.log("payload sent to all clients", payload);

            clients.forEach((_, client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
            
        } catch (err) {
            console.error('Error broadcasting user count:', err);
        }
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
                await setUserOnline(username);
                console.log(`Client ${username} connected`);

                broadcastUserCount()

                // Send previous messages
                try {
                    const messages = await getMessages();
                    console.log(`Retrieved ${messages.length} messages successfully`);
                    for (const msg of messages) {
                        // Only send messages from other users
                        if (msg.username !== username) {
                            ws.send(JSON.stringify({
                                type: 'receivedMessage',
                                username: msg.username,
                                message: msg.message
                            }));
                        }
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
                        const { message } = data;
                        if (!message) {
                            console.log('Invalid message format - missing message content');
                            return;
                        }

                        try {
                            // Save message to database
                            await saveMessage(username, message);
                            console.log('Message saved successfully');

                            // Send confirmation back to sender
                            ws.send(JSON.stringify({
                                type: 'sentMessage',
                                message: message
                            }));

                            // Broadcast to other clients
                            const broadcastPayload = JSON.stringify({
                                type: 'receivedMessage',
                                username: username,
                                message: message
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

        ws.on('close', async () => {
            const clientInfo = clients.get(ws);
            const username = clientInfo?.username;
            console.log(`Client ${username || 'unknown'} disconnected`);

            if (username) {
                try {
                    await setUserOffline(username);
                } catch (err) {
                    console.error(`Error setting ${username} offline:`, err);
                }

                // Notify other clients that this user has stopped typing
                const stopTypingPayload = JSON.stringify({
                    type: 'stopTyping',
                    username: username
                });

                clients.forEach((info, client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(stopTypingPayload);
                    }
                });
            } else {
                console.warn('Client info not found; skipping offline status update.');
            }

            clients.delete(ws);
            broadcastUserCount()
        });

        ws.on('error', (err) => console.error('WebSocket error:', err));
    });

    return wss;
};

module.exports = {
    initializeWebSocketServer
};