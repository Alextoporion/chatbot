const express = require('express');
const router = express.Router();

// Import the controllers we just made
const { agentCreate, agentLogin, agentLogout, getMe, getAllAgents, registerCompany } = require('../controllers/AuthController');
const verifyToken = require('../middlewares/verifyToken');
const verifyRole = require('../middlewares/verifyRoles');


router.post('/register',verifyToken,agentCreate);
router.post('/login', agentLogin);
router.post('/logout', agentLogout);

// Protect the /me route with your verifyToken middleware
router.get('/me', verifyToken, getMe);
// Only admins with a valid token can hit this route!
// router.post('/register', verifyToken, verifyRole('admin'), agentCreate);
// NEW: Protected route to get the team directory
router.get('/agents', verifyToken, verifyRole('admin'), getAllAgents);
// 🟢 Master Onboarding Route (You will use Postman to hit this when you get a new client)
router.post('/register-company', registerCompany);

module.exports = router;