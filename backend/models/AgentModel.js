const mongoose = require('mongoose');

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
        enum: ['agent', 'admin', 'superadmin'], // 👈 NEW: Added 'superadmin' to the allowed list
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
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        // 👈 NEW: It is required for clients, but NOT for you (the Super Admin)
        required: function () { return this.role !== 'superadmin'; }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Agent', agentSchema);