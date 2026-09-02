const AgentModel = require('../models/AgentModel'); // Using our new Agent Model


const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require('../utils/AsyncHandler');
const ApiError = require('../utils/ApiError');

const agentCreate = asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    const existingAgent = await AgentModel.findOne({ email });

    if (existingAgent) {
        throw new ApiError(400, "Agent already exists");
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);

    // activeTicketCount and status will automatically be set by the Mongoose schema defaults!
    const newAgent = await AgentModel.create({
        name,
        email,
        password: hashedPassword,
        role: role || "agent",
    });

    res.status(201).json({
        success: true,
        message: "Agent created successfully",
        agent: {
            id: newAgent._id,
            name: newAgent.name,
            email: newAgent.email,
            role: newAgent.role,
            status: newAgent.status,
            activeTicketCount: newAgent.activeTicketCount
        }
    });
});

const agentLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    // Notice: We must select('+password') because we hid it in the schema!
    const existingAgent = await AgentModel.findOne({ email }).select('+password');
    if (!existingAgent) {
        throw new ApiError(404, 'Agent does not exist');
    }

    const isPasswordMatch = await bcrypt.compare(String(password), existingAgent.password);

    if (!isPasswordMatch) {
        throw new ApiError(401, "Password does not match");
    }

    // Generate JWT token (using your exact method)
    const jwtToken = jwt.sign({
        id: existingAgent._id, 
        role: existingAgent.role,
        name: existingAgent.name, 
        email: existingAgent.email
    }, process.env.JWT_SECRET, { expiresIn: "1d" });

    // Define secure cookie options (using your exact method)
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000
    };

    // Set cookie and send response
    res.cookie("token", jwtToken, cookieOptions)
        .status(200).json({
            success: true,
            message: "Agent logged in successfully",
            agent: {
                id: existingAgent._id,
                name: existingAgent.name,
                email: existingAgent.email,
                role: existingAgent.role,
                status: existingAgent.status, // We return these to the frontend!
                activeTicketCount: existingAgent.activeTicketCount
            }
        });
});

const agentLogout = asyncHandler(async (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "strict"
    });

    res.status(200).json({
        success: true,
        message: "Agent logged out successfully"
    });
});

const getMe = asyncHandler(async (req, res) => {
    // req.user is populated by your verifyToken middleware
    const agent = await AgentModel.findById(req.user.id);
    if (!agent) {
        throw new ApiError(404, "Agent not found");
    }
    res.status(200).json({
        success: true,
        agent
    });
});

module.exports = { agentCreate, agentLogin, agentLogout, getMe };