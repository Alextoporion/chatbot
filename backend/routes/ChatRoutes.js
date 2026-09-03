const express = require('express');
const router = express.Router();

const { createSession, updateSessionStatus, getQueuedSessions, getSessionMessages } = require('../controllers/ChatController');
const verifyToken = require('../middlewares/verifyToken');

// 🟢 PUBLIC ROUTES: The customer widget uses these. No token required!
router.post('/session', createSession);
router.get('/session/:id/messages', getSessionMessages); // 👈 REMOVED verifyToken HERE

// 🔴 PROTECTED ROUTES: Only logged-in agents can use these!
router.get('/sessions/queued', verifyToken, getQueuedSessions);
router.patch('/session/:id/status', verifyToken, updateSessionStatus);

module.exports = router;