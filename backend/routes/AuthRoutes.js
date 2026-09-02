const express = require('express');
const router = express.Router();

// Import the controllers we just made
const { agentCreate, agentLogin, agentLogout, getMe } = require('../controllers/AuthController');

// Import your custom middleware
const verifyToken = require('../middlewares/VerifyToken'); 

router.post('/register', agentCreate);
router.post('/login', agentLogin);
router.post('/logout', agentLogout);

// Protect the /me route with your verifyToken middleware
router.get('/me', verifyToken, getMe);

module.exports = router;