const express = require('express');
const router = express.Router();
// Update your import line:
const { createSession, getSessionMessages, getQueuedSessions, updateSessionStatus } = require('../controllers/ChatController');

router.post('/session', createSession);
router.get('/session/:sessionId/messages', getSessionMessages);
router.get('/sessions/queued', getQueuedSessions);

// ADD THIS NEW ROUTE:
router.patch('/session/:sessionId/status', updateSessionStatus);

module.exports = router;