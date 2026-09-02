const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        select: false // Never return the password by default when fetching agents
    },
    role: {
        type: String,
        enum: ['agent', 'admin'],
        default: 'agent'
    },
    status: {
        type: String,
        enum: ['offline', 'online', 'busy'],
        default: 'offline'
    },
    activeTicketCount: {
        type: Number,
        default: 0 // We will use this later to find the "least busy" agent
    }
}, {
    timestamps: true
});

// Encrypt password using bcrypt before saving to the database
agentSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
agentSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Agent', agentSchema);