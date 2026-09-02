const SupportSession = require('../models/SessionModel');
const Message = require('../models/MessageModel');
const asyncHandler = require('../utils/AsyncHandler');
const ApiError = require('../utils/ApiError');

// 1. Initialize a new chat session (When a user clicks "Start Chat")
const createSession = asyncHandler(async (req, res, next) => {
    const { originApp, customerId, customerName, customerEmail } = req.body;

    if (!originApp || !customerId || !customerName || !customerEmail) {
        return next(new ApiError(400, 'Missing required customer details'));
    }

    const newSession = await SupportSession.create({
        originApp,
        customerId,
        customerName,
        customerEmail,
        status: 'queued'
    });

    res.status(201).json({
        success: true,
        data: newSession
    });
});

// 2. Fetch history for a specific session (When they reopen the chat window)
const getSessionMessages = asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;

    // Fetch messages and sort by oldest first so they read top-to-bottom
    const messages = await Message.find({ sessionId }).sort({ createdAt: 1 });

    res.status(200).json({
        success: true,
        data: messages
    });
});
// Fetch all queued or active sessions for the agent dashboard
const getQueuedSessions = asyncHandler(async (req, res, next) => {
    // Get tickets that need attention, newest first
    const sessions = await SupportSession.find({ 
        status: { $in: ['queued', 'active'] } 
    }).sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        data: sessions
    });
});

// Update session status (e.g., queued -> active -> closed)
const updateSessionStatus = asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    const { status, agentId, agentName } = req.body;

    const session = await SupportSession.findByIdAndUpdate(
        sessionId,
        { 
            status, 
            ...(agentId && { agentId }), 
            ...(agentName && { agentName }),
            ...(status === 'closed' && { closedAt: new Date() }) 
        },
        { new: true, runValidators: true }
    );

    if (!session) {
        return next(new ApiError(404, 'Session not found'));
    }

    res.status(200).json({
        success: true,
        data: session
    });
});

module.exports = {
    createSession,
    getSessionMessages,
    getQueuedSessions,
    updateSessionStatus
};