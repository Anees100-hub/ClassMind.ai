const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    studentId: { type: Number }, // If null/undefined, applies to all students in course or classId
    teacherId: { type: Number }, // Targeted teacher notification
    classId: { type: String, required: true },
    materialId: { type: String }, // For 'material' type notifications — links to the actual Material id
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['reschedule', 'material', 'lecture', 'general'], 
        default: 'reschedule' 
    },
    code: { type: String }, // e.g. "CS101"
    time: { type: String }, // formatted time string or timestamp
    unread: { type: Boolean, default: true }
}, { timestamps: true });

NotificationSchema.index({ studentId: 1, classId: 1 });

module.exports = mongoose.model('Notification', NotificationSchema, 'Notifications');
