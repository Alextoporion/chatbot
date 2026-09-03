const Session = require('../models/SessionModel'); // 👈 Changed from SupportSession to Session
const Message = require('../models/MessageModel');

const asyncHandler = require('../utils/AsyncHandler');
const ApiError = require('../utils/ApiError');
const AgentModel = require('../models/AgentModel');

// 1. Initialize a new chat session (When a user clicks "Start Chat")
// @desc    Create a new chat session (Triggered by widget)
// @route   POST /api/chat/session
const createSession = async (req, res) => {
    try {
        // 👈 NEW: Expect companyId from the widget request body
        const { originApp, customerId, customerName, customerEmail, companyId } = req.body;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "companyId is required to start a chat." });
        }

        // 1. SMART ROUTING: Find an online agent WITH THIS EXACT companyId
        const availableAgent = await AgentModel.findOne({ 
            status: 'online', 
            companyId: companyId // 👈 NEW: Keeps routing inside the client's bubble
        }).sort({ activeTicketCount: 1 });

        const sessionData = {
            companyId, // 👈 NEW: Attach the new ticket to the company
            originApp,
            customerId,
            customerName,
            customerEmail,
            status: availableAgent ? 'active' : 'queued',
            agentId: availableAgent ? availableAgent._id : null,
            agentName: availableAgent ? availableAgent.name : null
        };

        const session = await Session.create(sessionData);

        // 2. Increment that agent's ticket count
        if (availableAgent) {
            availableAgent.activeTicketCount += 1;
            await availableAgent.save();
        }

        res.status(201).json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Fetch history for a specific session (When they reopen the chat window)
// 2. Fetch history for a specific session
const getSessionMessages = asyncHandler(async (req, res, next) => {
    // 👈 FIXED: We must grab "id" from req.params because the route is /session/:id/messages
    const sessionId = req.params.id; 

    // Fetch messages and sort by oldest first
    const messages = await Message.find({ sessionId }).sort({ createdAt: 1 });

    res.status(200).json({
        success: true,
        data: messages
    });
});
// Fetch all queued or active sessions for the agent dashboard
// @desc    Get sessions for the sidebar (Queued + Agent's Active Tickets)
// @route   GET /api/chat/sessions/queued
const getQueuedSessions = async (req, res) => {
    try {
        // 👈 NEW: Added companyId filter at the top level of the query
        const sessions = await Session.find({
            companyId: req.user.companyId,
            $or: [
                { status: 'queued' },
                { status: 'active', agentId: req.user.id } 
            ]
        }).sort({ updatedAt: -1 }); 

        res.status(200).json({ success: true, data: sessions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update session status (Claiming or Closing)
// @route   PATCH /api/chat/session/:id/status
const updateSessionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, agentId, agentName } = req.body;

        const session = await Session.findById(id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        // 1. If closing an active ticket, decrement the agent's workload
        if (status === 'closed' && session.agentId) {
            await AgentModel.findByIdAndUpdate(session.agentId, { $inc: { activeTicketCount: -1 } });
        }

        // 2. If manually claiming a queued ticket from the dashboard, increment workload
        if (status === 'active' && session.status === 'queued' && agentId) {
            await AgentModel.findByIdAndUpdate(agentId, { $inc: { activeTicketCount: 1 } });
        }

        session.status = status;
        if (agentId) session.agentId = agentId;
        if (agentName) session.agentName = agentName;
        await session.save();

        res.status(200).json({ success: true, data: session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createSession,
    getSessionMessages,
    getQueuedSessions,
    updateSessionStatus
};