const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    // Link to the SupportSession
    sessionId: { 
        type: Schema.Types.ObjectId, 
        ref: 'SupportSession', 
        required: true 
    },

    // Who sent the message?
    senderType: { 
        type: String, 
        enum: ['customer', 'agent', 'bot', 'system'], 
        required: true 
    },
    
    // The specific ID of the person (or bot) who sent it
    senderId: { 
        type: String, 
        required: true 
    },

    // The actual text content
    content: { 
        type: String, 
        required: true 
    },

    // For read receipts
    isRead: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true }); // Automatically gives us 'createdAt' for sorting messages by time

module.exports = mongoose.model('Message', messageSchema);