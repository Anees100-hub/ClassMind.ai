const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    academicYear: { type: String, default: '2024-2025' },
    language: { type: String, default: 'en' },
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema, 'SystemSettings');
