const Message = require('../models/MessageModel');

const handleSockets = (io) => {
    io.on('connection', (socket) => {
        console.log(`⚡ New real-time connection: ${socket.id}`);

        socket.on('join_session', (sessionId) => {
            socket.join(sessionId);
        });

        socket.on('send_message', async (data) => {
            try {
                const { sessionId, senderType, senderId, content } = data;
                const newMessage = await Message.create({
                    sessionId,
                    senderType,
                    senderId,
                    content
                });
                io.to(sessionId).emit('receive_message', newMessage);
            } catch (error) {
                socket.emit('message_error', { error: 'Failed to send message' });
            }
        });

        // Tell everyone the chat is closed
        socket.on('close_session', (sessionId) => {
            io.to(sessionId).emit('session_closed');
        });

        // UPDATED: Broadcast to agents that a new ticket exists
        socket.on('new_ticket_created', () => {
            io.emit('refresh_queue');
        });

        socket.on('disconnect', () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
        });
    });
};

module.exports = handleSockets;