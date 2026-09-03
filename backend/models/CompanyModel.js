const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    domain: { type: String, required: true }, // e.g., "getsoko.app"
    isActive: { type: Boolean, default: true } // You can turn this to false if they stop paying!
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);