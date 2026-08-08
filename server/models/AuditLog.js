const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    user: { type: String, required: true },
    action: { type: String, required: true },
    entity: { type: String },
    entityId: { type: String },
    details: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', AuditLogSchema, 'AuditLogs');
