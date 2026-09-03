const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
    // Identifies which application the user is contacting from (e.g., 'getsoko-restaurant', 'portfolio', etc.)
    originApp: { 
        type: String, 
        required: true, 
        trim: true 
    },
    
    // Customer Details
    customerId: { 
        type: String, 
        required: true 
    },
    customerName: { 
        type: String, 
        required: true 
    },
    customerEmail: { 
        type: String, 
        required: true 
    },

    // Agent Assignment
    agentId: { 
        type: String, 
        default: null 
    },
    agentName: { 
        type: String, 
        default: null 
    },

    // Lifecycle Status
    status: { 
        type: String, 
        enum: ['queued', 'active', 'closed'], 
        default: 'queued' 
    },

    // Mode of Communication
    sessionType: { 
        type: String, 
        enum: ['text', 'audio'], 
        default: 'text' 
    },

    // Rating & Closure
    closedAt: { 
        type: Date, 
        default: null 
    },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true });

module.exports = mongoose.model('SupportSession', sessionSchema);