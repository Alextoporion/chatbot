const Message = require('../models/MessageModel');
const Agent = require('../models/AgentModel'); // Bring in the Agent Model

const handleSockets = (io) => {
    io.on('connection', async (socket) => {
        console.log(`⚡ New real-time connection: ${socket.id}`);

        // 1. PRESENCE TRACKING: Mark Agent Online
        const agentId = socket.handshake.auth?.agentId;
        if (agentId) {
            await Agent.findByIdAndUpdate(agentId, { status: 'online' });
            console.log(`🟢 Agent ${agentId} is now ONLINE`);
            
            // Save the ID to this specific socket connection in memory
            socket.agentId = agentId;
        }

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

        socket.on('close_session', (sessionId) => {
            io.to(sessionId).emit('session_closed');
        });

        socket.on('new_ticket_created', () => {
            io.emit('refresh_queue');
        });

        // ==========================================
        // 📞 WEBRTC SIGNALING LOGIC (NEW ADDITIONS)
        // ==========================================
        
        // 1. Caller rings the Receiver with an SDP Offer
        socket.on('call_user', (data) => {
            socket.to(data.sessionId).emit('incoming_call', data);
        });

        // 2. Receiver answers and sends an SDP Answer back
        socket.on('answer_call', (data) => {
            socket.to(data.sessionId).emit('call_answered', data);
        });

        // 3. Exchange network coordinates (ICE Candidates)
        socket.on('ice_candidate', (data) => {
            socket.to(data.sessionId).emit('ice_candidate', data);
        });

        // 4. Handle call hang up
        socket.on('end_call', (sessionId) => {
            socket.to(sessionId).emit('call_ended');
        });
        
        // ==========================================
        // END OF WEBRTC LOGIC
        // ==========================================

        // 2. PRESENCE TRACKING: Mark Agent Offline on Disconnect
        socket.on('disconnect', async () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
            
            if (socket.agentId) {
                await Agent.findByIdAndUpdate(socket.agentId, { status: 'offline' });
                console.log(`🔴 Agent ${socket.agentId} is now OFFLINE`);
            }
        });
    });
};

module.exports = handleSockets;