const express = require('express');
const router = express.Router();

// Import the controllers we just made
const { agentCreate, agentLogin, agentLogout, getMe } = require('../controllers/AuthController');
const verifyToken = require('../middlewares/verifyToken');
const verifyRole = require('../middlewares/verifyRoles');


router.post('/register', agentCreate);
router.post('/login', agentLogin);
router.post('/logout', agentLogout);

// Protect the /me route with your verifyToken middleware
router.get('/me', verifyToken, getMe);
// Only admins with a valid token can hit this route!
router.post('/register', verifyToken, verifyRole('admin'), agentCreate);

module.exports = router;