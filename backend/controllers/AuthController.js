const AgentModel = require('../models/AgentModel'); // Using our new Agent Model


const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require('../utils/AsyncHandler');
const ApiError = require('../utils/ApiError');
const CompanyModel = require('../models/CompanyModel');

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
        companyId: req.user.companyId // 👈 THE MAGIC KEY: Forces the new agent into the Admin's company!
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
            activeTicketCount: newAgent.activeTicketCount,
            companyId: newAgent.companyId // 👈 Return it to the frontend just in case
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

    // Generate JWT token
    const jwtToken = jwt.sign({
        id: existingAgent._id, 
        role: existingAgent.role,
        name: existingAgent.name, 
        email: existingAgent.email,
        companyId: existingAgent.companyId // 👈 THE MAGIC KEY: Added right here!
    }, process.env.JWT_SECRET, { expiresIn: "1d" });

    // Define secure cookie options
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
                status: existingAgent.status, 
                activeTicketCount: existingAgent.activeTicketCount,
                companyId: existingAgent.companyId // 👈 Passed to the frontend as well
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
    
    // We must map _id to id so the frontend doesn't break on refresh!
    res.status(200).json({
        success: true,
        agent: {
            id: agent._id,
            name: agent.name,
            email: agent.email,
            role: agent.role,
            status: agent.status,
            activeTicketCount: agent.activeTicketCount
        }
    });
});

// @desc    Get all team members (Admin only)
// @route   GET /api/auth/agents
const getAllAgents = asyncHandler(async (req, res) => {
    // 👈 NEW: Filter agents by the Admin's companyId
    const agents = await AgentModel.find({ companyId: req.user.companyId }).select('-password');
    
    res.status(200).json({
        success: true,
        data: agents
    });
});

// @desc    SUPER ADMIN ONLY: Create a new client company & their first Admin
// @route   POST /api/auth/register-company
// @desc    SUPER ADMIN ONLY: Create a new client company & their first Admin
// @route   POST /api/auth/register-company
const registerCompany = async (req, res) => {
    try {
        const { companyName, domain, adminName, adminEmail, adminPassword } = req.body;

        // 1. Create the new Company profile
        const newCompany = await CompanyModel.create({
            companyName,
            domain
        });

      
        const hashedPassword = await bcrypt.hash(String(adminPassword), 10);

        // 2. Create the first Admin agent for this specific company
        const newAdmin = await AgentModel.create({
            name: adminName,
            email: adminEmail,
            password: hashedPassword, // 👈 Now it is safely encrypted!
            role: 'admin',
            companyId: newCompany._id
        });

        res.status(201).json({ 
            success: true, 
            message: "Client Company onboarded successfully!",
            data: { company: newCompany, adminId: newAdmin._id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { agentCreate, agentLogin, agentLogout, getMe, getAllAgents, registerCompany };