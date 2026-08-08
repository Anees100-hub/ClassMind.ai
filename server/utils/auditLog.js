const AuditLog = require('../models/AuditLog');

async function logAudit({ user = 'System', action, entity, entityId, details }) {
    try {
        await AuditLog.create({ user, action, entity, entityId, details });
    } catch (err) {
        console.error('Audit log write failed:', err.message);
    }
}

module.exports = { logAudit };
